import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import { canonicalNodeUrl, isNetworkId, type NetworkId } from '@/lib/xrpl/networks'
import type { WalletMeta } from '@/lib/crypto/keystore'
import { endAllLockSessions, endLockSession } from '@/lib/crypto/lock'
import { isOpenCheck, isSeedAlgorithm, isSeedMethod, isSigningCheck } from '@/lib/crypto/db'
import { navigate, walletScreenPath } from '@/lib/route'
import { migrateAddressBook, upsertAddressBookEntry, type AddressBookEntry } from '@/store/address-book'

interface AppState {
  // Non-secret, persisted state
  /** NOT the network any read uses (AD-19): the active Wallet's `network` is.
   * This field is only the default `useActiveNetwork()` falls back to when no
   * Wallet is active; on write (`partialize`) it mirrors the active Wallet's
   * network. Read it through `useActiveNetwork()`. */
  network: NetworkId
  wallets: WalletMeta[]
  activeWalletId: string | null
  /** One list per Wallet, keyed by `WalletMeta.id` (AD-50). Identity inside a
   * list is the `(network, address, destination tag)` triple — see
   * `store/address-book.ts`, the one place that decides it (AD-6). */
  addressBook: Record<string, AddressBookEntry[]>
  /** app-versioning-and-updates.md US-4: a declined release's identifier (its
   * commit SHA) is remembered so it stops nagging, while a newer one still
   * surfaces. Non-secret, so it's fine alongside the rest of this state. */
  declinedUpdateVersions: string[]

  // Secret / session-only state — NEVER persisted (docs/decisions.md
  // guardrail #3: no secret ever enters anything serializable).
  /** One entry per OPEN lock (AD-21): the non-extractable Open Key and that
   * lock's own auto-lock minutes. A lock absent here is closed, and so is every
   * Wallet on it. */
  openLocks: Record<string, OpenLock>
  /** app-versioning-and-updates.md US-5: true while ANY transaction is
   * signing, submitted, or awaiting validation — true from the moment the
   * first of possibly several overlapping writes starts until the last one
   * settles. Session-only and deliberately not derived from any per-tab local
   * state — Radix unmounts inactive `TabsContent`, so a flag local to
   * `SendTab` would vanish the moment the user switched away from it mid-send.
   * Set/cleared at the single choke point every write passes through
   * (`lib/xrpl/writes.ts#submitAndClassify`), which counts writes and reports
   * only the 0→1 and 1→0 transitions (AD-9) — so this boolean is "depth above
   * zero", not "the most recent write's state". */
  txInFlight: boolean

  setWallets: (wallets: WalletMeta[]) => void
  setActiveWalletId: (id: string | null) => void
  /** Saves under the sending Wallet only; ignored if that Wallet is gone. */
  addAddressBookEntry: (walletId: string, entry: AddressBookEntry) => void
  /** Deletes one Wallet's list (teardown). Never throws. */
  removeAddressBook: (walletId: string) => void
  declineUpdateVersion: (id: string) => void
  setTxInFlight: (inFlight: boolean) => void
  /** Records a lock as open and starts its expiry. */
  openLock: (lockId: string, key: CryptoKey, autoLockMinutes: number, expiresAt?: number) => void
  /** Changes an open lock's minutes (a Settings edit) and restarts its expiry. */
  setLockMinutes: (lockId: string, autoLockMinutes: number) => void
  /** Closes ONE lock: drops its key and its persisted session. Query data is
   * removed by `lib/teardown.ts`, which owns the scopes. */
  closeLock: (lockId: string) => void
  closeAllLocks: () => void
}

interface OpenLock {
  key: CryptoKey
  autoLockMinutes: number
}

// Each open lock's expiry, outside React state: activity moves it on every
// click and scroll, and none of that should re-render anything. The timer in
// `useAutoLock` is one half of the expiry; this is the other, checked lazily
// (parent AD-5) — a throttled background timer that fires late still finds the
// lock expired.
const expiries = new Map<string, number>()

/** Restarts the expiry of ONE wallet's lock — the wallet the user is inside —
 * and nothing else: activity in one Wallet is not activity in another (AD-26).
 * `null` (no wallet entered) extends nothing (AD-35). Returns the lock id, if open. */
export function touchLock(walletId: string | null, now = Date.now()): string | null {
  if (walletId === null) return null
  const { openLocks, wallets } = useAppStore.getState()
  const lockId = wallets.find((w) => w.id === walletId)?.lockId
  const lock = lockId ? openLocks[lockId] : undefined
  if (!lockId || !lock) return null
  expiries.set(lockId, now + lock.autoLockMinutes * 60_000)
  return lockId
}

/** The one function that selects a wallet and navigates into it (AD-34). */
export function enterWallet(walletId: string): void {
  // An id that is not a Wallet here selects nothing and goes nowhere.
  if (!useAppStore.getState().wallets.some((w) => w.id === walletId)) return
  useAppStore.getState().setActiveWalletId(walletId)
  navigate(walletScreenPath('wallet', walletId))
}

/** Milliseconds until an open lock expires (0 if past), or null if not open. */
export function lockRemainingMs(lockId: string, now = Date.now()): number | null {
  const lock = useAppStore.getState().openLocks[lockId]
  if (!lock) return null
  // A lock with no recorded expiry fails closed: it is already expired.
  return Math.max(0, (expiries.get(lockId) ?? 0) - now)
}

/** The ids of open locks whose expiry has passed. */
export function expiredLockIds(now = Date.now()): string[] {
  return Object.keys(useAppStore.getState().openLocks).filter((id) => (expiries.get(id) ?? 0) <= now)
}

/** The idb-keyval key this store persists under. Exported so the teardown
 * owner (`lib/teardown.ts`, AD-16) and its tests name the same key. */
export const APP_STATE_STORAGE_KEY = 'xrpl-wallet-app-state'

type PersistedAppState = Pick<
  AppState,
  'network' | 'wallets' | 'activeWalletId' | 'addressBook' | 'declinedUpdateVersions'
>

/** The persisted slice's initial values — one object, used both as the
 * store's starting state and as what a teardown resets it to, so the two
 * cannot drift apart. */
const PERSISTED_DEFAULTS: PersistedAppState = {
  network: 'testnet',
  wallets: [],
  activeWalletId: null,
  addressBook: {},
  declinedUpdateVersions: [],
}

/**
 * FR-95: a saved Wallet missing any field the screens read is invalid and is not
 * shown; nothing is guessed. The stored entry is left as it is. `node` is the one
 * optional field: it must pass the shared validator (wss://, no userinfo, query or
 * fragment) or the Wallet falls back to its built-in Nodes. Total: a value that is
 * not an array leaves the current wallets alone, never throws.
 */
function isCompleteSavedWallet(w: unknown): w is WalletMeta {
  if (!w || typeof w !== 'object') return false
  const r = w as Record<string, unknown>
  const str = (v: unknown) => typeof v === 'string' && v.length > 0
  // A Transmitter (OS-FR-3) has no Seed fields: its address is the Synced one or null.
  if (r.kind === 'transmitter') {
    return (
      str(r.id) &&
      str(r.seedId) &&
      str(r.lockId) &&
      str(r.label) &&
      (r.address === null || str(r.address)) &&
      typeof r.createdAt === 'number' &&
      isNetworkId(r.network) &&
      isOpenCheck(r.openCheck)
    )
  }
  return (
    str(r.id) &&
    str(r.seedId) &&
    str(r.lockId) &&
    str(r.label) &&
    str(r.address) &&
    str(r.keyAddress) &&
    typeof r.createdAt === 'number' &&
    isNetworkId(r.network) &&
    isSeedAlgorithm(r.algorithm) &&
    isSeedMethod(r.seedMethod) &&
    isOpenCheck(r.openCheck) &&
    isSigningCheck(r.signingCheck)
  )
}

function normaliseWallets(persisted: unknown, current: WalletMeta[]): WalletMeta[] {
  if (!Array.isArray(persisted)) return current
  return persisted.filter(isCompleteSavedWallet).map((w) => ({
    ...w,
    node: canonicalNodeUrl((w as { node?: unknown }).node) ?? undefined,
  }))
}

/**
 * Per-Wallet Address Book (AD-50). An old array-shaped book, or anything that is
 * not a plain object, reads as `{}` (AD-48: no migration of the array). Each
 * stored list is cleaned with `migrateAddressBook`. Total, never throws; a
 * `__proto__` key is skipped and the map is built with `Object.fromEntries`.
 */
function normaliseAddressBook(persisted: unknown): Record<string, AddressBookEntry[]> {
  if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) return {}
  try {
    return Object.fromEntries(
      Object.entries(persisted as Record<string, unknown>)
        .filter(([id]) => id !== '__proto__')
        .map(([id, list]) => [id, migrateAddressBook(list)] as const),
    )
  } catch {
    return {}
  }
}

/** The one shared empty list: a fresh `[]` per selector call re-renders forever. */
const EMPTY_ADDRESS_BOOK: readonly AddressBookEntry[] = Object.freeze([])

/** One Wallet's list, or the shared frozen empty one (no Wallet, no list, or an
 * unhydrated store). Own-property read, so `__proto__` or `constructor` ids find nothing. */
export function selectAddressBook(walletId: string | null | undefined) {
  return (s: Pick<AppState, 'addressBook'>): readonly AddressBookEntry[] =>
    walletId && Object.prototype.hasOwnProperty.call(s.addressBook, walletId) ? s.addressBook[walletId] : EMPTY_ADDRESS_BOOK
}

export function useAddressBook(walletId: string | null | undefined): readonly AddressBookEntry[] {
  return useAppStore(selectAddressBook(walletId))
}

/**
 * Reads the persisted slice into the current shape, on every hydration.
 *
 * Done in `merge`, deliberately NOT by bumping `persist`'s `version` with a
 * `migrate`: zustand's answer to a stored version it does not expect, with no
 * `migrate`, is to hydrate nothing, and its next `set()` then writes defaults
 * over storage. Normalising on read keeps the stored version at 0.
 *
 * `migrateAddressBook` is idempotent, so running it on every load is safe: an
 * entry `{ address, label }` reads as an entry with no recorded network and its
 * tag not recorded (it silences no first-send warning), and nothing with an
 * address is dropped.
 *
 * Total and non-throwing: a throw here would leave the store on its in-memory
 * defaults, and the next `set()` (even `closeLock()`) would write them over the
 * stored slice. With nothing stored (`persisted` undefined) the current state
 * is returned untouched. Every other persisted field passes through exactly as
 * zustand's default shallow merge would pass it.
 */
export function mergePersistedAppState<S extends PersistedAppState>(persisted: unknown, current: S): S {
  if (!persisted || typeof persisted !== 'object') return current
  const state = persisted as Record<string, unknown>
  return {
    ...current,
    ...(state as Partial<PersistedAppState>),
    addressBook: normaliseAddressBook(state.addressBook),
    wallets: normaliseWallets(state.wallets, current.wallets),
  }
}

let hydrationSettled = false
let hydrationFailed = false
const hydrationWaiters: Array<() => void> = []
function settleHydration() {
  hydrationSettled = true
  hydrationWaiters.splice(0).forEach((resolve) => resolve())
}

/** Resolves once the persisted slice has been read back OR its read failed.
 * zustand's `onFinishHydration` fires only on success, so waiting on it alone
 * hangs forever behind a storage error; on failure the store keeps its
 * defaults and callers proceed with those. */
/** True when the persisted slice could not be read: the store then holds its
 * defaults, not what the user last chose, so nothing may be derived from it and
 * written back. */
export function appStateHydrationFailed(): boolean {
  return hydrationFailed
}

export function appStateSettled(): Promise<void> {
  return hydrationSettled ? Promise.resolve() : new Promise((resolve) => void hydrationWaiters.push(resolve))
}

const indexedDbStorage: StateStorage = {
  getItem: async (name) => (await idbGet<string>(name)) ?? null,
  setItem: async (name, value) => {
    await idbSet(name, value)
  },
  removeItem: async (name) => {
    await idbDel(name)
  },
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...PERSISTED_DEFAULTS,

      openLocks: {},
      txInFlight: false,

      setWallets: (wallets) => set({ wallets }),
      setActiveWalletId: (activeWalletId) => set({ activeWalletId }),
      addAddressBookEntry: (walletId, entry) =>
        set((s) => {
          // A removal mid-send must not resurrect the key.
          if (!s.wallets.some((w) => w.id === walletId)) return s
          const current = Object.prototype.hasOwnProperty.call(s.addressBook, walletId) ? s.addressBook[walletId] : []
          return { addressBook: { ...s.addressBook, [walletId]: upsertAddressBookEntry(current, entry) } }
        }),
      removeAddressBook: (walletId) =>
        set((s) => {
          if (!Object.prototype.hasOwnProperty.call(s.addressBook, walletId)) return s
          return { addressBook: Object.fromEntries(Object.entries(s.addressBook).filter(([id]) => id !== walletId)) }
        }),
      declineUpdateVersion: (id) =>
        set((s) => (s.declinedUpdateVersions.includes(id) ? s : { declinedUpdateVersions: [...s.declinedUpdateVersions, id] })),
      setTxInFlight: (txInFlight) => set({ txInFlight }),
      openLock: (lockId, key, autoLockMinutes, expiresAt) => {
        // A restored session keeps its PERSISTED expiry; a fresh open gets a full window.
        expiries.set(lockId, expiresAt ?? Date.now() + autoLockMinutes * 60_000)
        set((s) => ({ openLocks: { ...s.openLocks, [lockId]: { key, autoLockMinutes } } }))
      },
      setLockMinutes: (lockId, autoLockMinutes) => {
        set((s) => {
          const lock = s.openLocks[lockId]
          return lock ? { openLocks: { ...s.openLocks, [lockId]: { ...lock, autoLockMinutes } } } : s
        })
        expiries.set(lockId, Date.now() + autoLockMinutes * 60_000)
      },
      closeLock: (lockId) => {
        expiries.delete(lockId)
        set((s) => {
          if (!(lockId in s.openLocks)) return s
          const { [lockId]: _closed, ...rest } = s.openLocks
          return { openLocks: rest }
        })
        // Every close path tears down the persisted session too, not just the
        // in-memory key — docs/decisions.md guardrail #3. Only THIS lock's:
        // another open lock keeps its own.
        void endLockSession(lockId).catch(() => {})
      },
      closeAllLocks: () => {
        expiries.clear()
        set({ openLocks: {} })
        void endAllLockSessions().catch(() => {})
      },
    }),
    {
      name: APP_STATE_STORAGE_KEY,
      // docs/decisions.md §1 specifies IndexedDB for app state, not
      // localStorage (zustand's default). The payload here is non-secret, but
      // keeping every persisted byte in one store means teardown has a single
      // place to clear and nothing app-related is left behind in localStorage.
      storage: createJSONStorage(() => indexedDbStorage),
      merge: mergePersistedAppState,
      onRehydrateStorage: () => (_state, error) => {
        if (error) hydrationFailed = true
        settleHydration()
      },
      // Only ever persist non-secret UI/selection state. `openLocks` (the Open
      // Keys) is deliberately excluded here.
      partialize: (s): PersistedAppState => ({
        network: s.wallets.find((w) => w.id === s.activeWalletId)?.network ?? s.network,
        wallets: s.wallets,
        activeWalletId: s.activeWalletId,
        addressBook: s.addressBook,
        declinedUpdateVersions: s.declinedUpdateVersions,
      }),
    },
  ),
)

/**
 * Removes everything this store persists — AD-16's account-data set, called
 * only by `lib/teardown.ts`, never by a page clearing its own fields.
 *
 * Two steps, in this order, and both are needed:
 *  1. The in-memory persisted slice goes back to its defaults FIRST. The
 *     `persist` middleware re-serializes the whole slice on every later
 *     `set()` — `closeLock()` included — so deleting the key while the old wallets
 *     and Address Book are still in memory would let the next setter write
 *     them straight back (G-13's residue, by a different route).
 *  2. The key itself is deleted, and awaited: zustand's own
 *     `persist.clearStorage()` returns void, so a reload straight after it
 *     could beat the delete.
 * Session-only fields (`openLocks`, `txInFlight`) are not persisted and are
 * left to the caller's `closeAllLocks`.
 */
export async function clearPersistedAppState(): Promise<void> {
  useAppStore.setState({ ...PERSISTED_DEFAULTS })
  await idbDel(APP_STATE_STORAGE_KEY)
}

export function useActiveWallet(): WalletMeta | null {
  return useAppStore((s) => s.wallets.find((w) => w.id === s.activeWalletId) ?? null)
}

/** The network every ledger read and every network display uses: the active
 * Wallet's (AD-19). With no Wallet there is no account to read; the persisted
 * mirror is returned so a screen that needs a value (Onboarding's default)
 * has one. */
export function useActiveNetwork(): NetworkId {
  return useAppStore((s) => s.wallets.find((w) => w.id === s.activeWalletId)?.network ?? s.network)
}

/** The active Wallet's custom Node URL, or undefined for the built-in Nodes. */
export function useActiveNode(): string | undefined {
  return useAppStore((s) => s.wallets.find((w) => w.id === s.activeWalletId)?.node)
}

/** True while the Wallet's lock is open. A Wallet whose lock is closed is a name
 * and nothing else (AD-26): it mounts no ledger hook. */
export function useWalletIsOpen(walletId: string | null | undefined): boolean {
  return useAppStore((s) => {
    const w = s.wallets.find((x) => x.id === walletId)
    return !!w && w.lockId in s.openLocks
  })
}

/** The Open Key of the Wallet's lock — never another lock's — or null. */
export function useWalletOpenKey(walletId: string | null | undefined): CryptoKey | null {
  return useAppStore((s) => {
    const w = s.wallets.find((x) => x.id === walletId)
    return (w && s.openLocks[w.lockId]?.key) || null
  })
}
