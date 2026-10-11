import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import { canonicalNodeUrl, isNetworkId, type NetworkId } from '@/lib/xrpl/networks'
import type { WalletMeta } from '@/lib/crypto/keystore'
import { endAllLockSessions, endLockSession } from '@/lib/crypto/lock'
import { LEGACY_LOCK_ID } from '@/lib/crypto/db'
import { migrateAddressBook, upsertAddressBookEntry, type AddressBookEntry } from '@/store/address-book'

interface AppState {
  // Non-secret, persisted state
  /** NOT the network any read uses (AD-19): the active Wallet's `network` is.
   * This field survives only as the story-1 migration input — the network a
   * pre-per-Wallet build had selected — and, on write (`partialize`), as a
   * mirror of the active Wallet's network so a rolled-back build opens on the
   * network the user was last on. Read it through `useActiveNetwork()`. */
  network: NetworkId
  wallets: WalletMeta[]
  activeWalletId: string | null
  /** Identity is the `(address, destination tag)` pair — see
   * `store/address-book.ts`, the one place that decides it (AD-6). */
  addressBook: AddressBookEntry[]
  /** NOT read by anything (AD-26): each lock's auto-lock minutes live on its
   * lock record. Kept only as the migration's input — the value a pre-story-4
   * build had persisted becomes the legacy lock's minutes — and so a rolled-back
   * build still finds its setting. Tolerated in `merge`. */
  autoLockMinutes: number
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
  addAddressBookEntry: (entry: AddressBookEntry) => void
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

/** Restarts the expiry of the ACTIVE Wallet's lock only — activity in one
 * Wallet is not activity in another (AD-26). Returns its id, if open. */
export function touchActiveLock(now = Date.now()): string | null {
  const { openLocks, wallets, activeWalletId } = useAppStore.getState()
  const lockId = wallets.find((w) => w.id === activeWalletId)?.lockId
  const lock = lockId ? openLocks[lockId] : undefined
  if (!lockId || !lock) return null
  expiries.set(lockId, now + lock.autoLockMinutes * 60_000)
  return lockId
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
  'network' | 'wallets' | 'activeWalletId' | 'addressBook' | 'autoLockMinutes' | 'declinedUpdateVersions'
>

/** The persisted slice's initial values — one object, used both as the
 * store's starting state and as what a teardown resets it to, so the two
 * cannot drift apart. */
const PERSISTED_DEFAULTS: PersistedAppState = {
  network: 'testnet',
  wallets: [],
  activeWalletId: null,
  addressBook: [],
  autoLockMinutes: 5,
  declinedUpdateVersions: [],
}

/**
 * Story 12.1: a Wallet persisted by an earlier build has no `network` and no
 * `seedId`. It is given the persisted app-wide network (the same value the
 * vault migration labels the Seed's first view with) and its own id as Seed id.
 * Total: a value that is not an array leaves the current wallets alone, never
 * throws.
 */
function normaliseWallets(persisted: unknown, persistedNetwork: unknown, fallback: NetworkId, current: WalletMeta[]): WalletMeta[] {
  if (!Array.isArray(persisted)) return current
  const network = isNetworkId(persistedNetwork) ? persistedNetwork : fallback
  return persisted
    .filter((w): w is Record<string, unknown> => !!w && typeof w === 'object' && typeof (w as { id?: unknown }).id === 'string')
    .map((w) => ({
      ...(w as unknown as WalletMeta),
      seedId: typeof w.seedId === 'string' ? w.seedId : (w.id as string),
      // A Wallet persisted before per-Wallet locks belongs to the one legacy lock.
      lockId: typeof w.lockId === 'string' ? w.lockId : LEGACY_LOCK_ID,
      network: isNetworkId(w.network) ? w.network : network,
      // A custom Node must pass the shared validator (wss://, no userinfo, query
      // or fragment); anything else on a persisted record is dropped, so a Wallet falls back to its built-in Nodes rather than
      // contacting a host nobody proved.
      node: canonicalNodeUrl(w.node) ?? undefined,
      algorithm: (w.algorithm as WalletMeta['algorithm']) ?? 'unresolved',
      seedMethod: w.seedMethod === 'passkey-derived' ? 'passkey-derived' : 'stored',
      openCheck: (w.openCheck as WalletMeta['openCheck']) ?? 'pin',
      signingCheck: (w.signingCheck as WalletMeta['signingCheck']) ?? 'standard',
    }))
}

/**
 * Reads the persisted slice into the current shape, on every hydration — the
 * Address Book migration (Epic 9).
 *
 * Done in `merge`, deliberately NOT by bumping `persist`'s `version` with a
 * `migrate`. Every build before this one is version 0 with no `migrate`, and
 * zustand's answer to a stored version it does not expect, with no `migrate`,
 * is to hydrate nothing; its next `set()` then writes defaults over storage.
 * A version bump would therefore make rolling `prod` back past this commit
 * erase the Address Book, the network, the auto-lock setting and the declined
 * updates. Normalising on read keeps the stored version at 0, which every
 * build reads: an older build sees the new entries as `{ address }` rows and
 * ignores the tag.
 *
 * `migrateAddressBook` is idempotent, so running it on every load is safe: a
 * pre-Epic-9 entry `{ address, label }` reads as an entry with no recorded
 * network and its tag not recorded (it silences no first-send warning), minus
 * the label the old Send screen fabricated from the address, and nothing with
 * an address is dropped.
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
    addressBook: migrateAddressBook(state.addressBook),
    wallets: normaliseWallets(state.wallets, state.network, current.network, current.wallets),
  }
}

let hydrationSettled = false
const hydrationWaiters: Array<() => void> = []
function settleHydration() {
  hydrationSettled = true
  hydrationWaiters.splice(0).forEach((resolve) => resolve())
}

/** Resolves once the persisted slice has been read back OR its read failed.
 * zustand's `onFinishHydration` fires only on success, so waiting on it alone
 * hangs forever behind a storage error; on failure the store keeps its
 * defaults and callers proceed with those. */
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
      addAddressBookEntry: (entry) => set((s) => ({ addressBook: upsertAddressBookEntry(s.addressBook, entry) })),
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
      onRehydrateStorage: () => () => settleHydration(),
      // Only ever persist non-secret UI/selection state. `openLocks` (the Open
      // Keys) is deliberately excluded here.
      partialize: (s): PersistedAppState => ({
        network: s.wallets.find((w) => w.id === s.activeWalletId)?.network ?? s.network,
        wallets: s.wallets,
        activeWalletId: s.activeWalletId,
        addressBook: s.addressBook,
        autoLockMinutes: s.autoLockMinutes,
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
