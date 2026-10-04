import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import type { NetworkId } from '@/lib/xrpl/networks'
import type { WalletMeta } from '@/lib/crypto/keystore'
import { endSession } from '@/lib/crypto/auth'
import { migrateAddressBook, upsertAddressBookEntry, type AddressBookEntry } from '@/store/address-book'

interface AppState {
  // Non-secret, persisted state
  network: NetworkId
  wallets: WalletMeta[]
  activeWalletId: string | null
  /** Identity is the `(address, destination tag)` pair — see
   * `store/address-book.ts`, the one place that decides it (AD-6). */
  addressBook: AddressBookEntry[]
  autoLockMinutes: number
  /** app-versioning-and-updates.md US-4: a declined release's identifier (its
   * commit SHA) is remembered so it stops nagging, while a newer one still
   * surfaces. Non-secret, so it's fine alongside the rest of this state. */
  declinedUpdateVersions: string[]

  // Secret / session-only state — NEVER persisted (docs/decisions.md
  // guardrail #3: no secret ever enters anything serializable).
  vaultKey: CryptoKey | null
  unlocked: boolean
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

  setNetwork: (network: NetworkId) => void
  setWallets: (wallets: WalletMeta[]) => void
  setActiveWalletId: (id: string | null) => void
  setAutoLockMinutes: (minutes: number) => void
  addAddressBookEntry: (entry: AddressBookEntry) => void
  declineUpdateVersion: (id: string) => void
  setTxInFlight: (inFlight: boolean) => void
  unlock: (key: CryptoKey) => void
  lock: () => void
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
 * pre-Epic-9 entry `{ address, label }` reads as a tagless entry, minus the
 * label the old Send screen fabricated from the address, and nothing with an
 * address is dropped.
 *
 * Total and non-throwing: a throw here would leave the store on its in-memory
 * defaults, and the next `set()` (even `lock()`) would write them over the
 * stored slice. With nothing stored (`persisted` undefined) the current state
 * is returned untouched. Every other persisted field passes through exactly as
 * zustand's default shallow merge would pass it.
 */
export function mergePersistedAppState<S extends PersistedAppState>(persisted: unknown, current: S): S {
  if (!persisted || typeof persisted !== 'object') return current
  const state = persisted as Record<string, unknown>
  return { ...current, ...(state as Partial<PersistedAppState>), addressBook: migrateAddressBook(state.addressBook) }
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

      vaultKey: null,
      unlocked: false,
      txInFlight: false,

      setNetwork: (network) => set({ network }),
      setWallets: (wallets) => set({ wallets }),
      setActiveWalletId: (activeWalletId) => set({ activeWalletId }),
      setAutoLockMinutes: (autoLockMinutes) => set({ autoLockMinutes }),
      addAddressBookEntry: (entry) => set((s) => ({ addressBook: upsertAddressBookEntry(s.addressBook, entry) })),
      declineUpdateVersion: (id) =>
        set((s) => (s.declinedUpdateVersions.includes(id) ? s : { declinedUpdateVersions: [...s.declinedUpdateVersions, id] })),
      setTxInFlight: (txInFlight) => set({ txInFlight }),
      unlock: (vaultKey) => set({ vaultKey, unlocked: true }),
      lock: () => {
        set({ vaultKey: null, unlocked: false })
        // Cached balances/history must not stay readable behind a lock
        // screen on a shared device (guardrail #7). The query cache is
        // cleared by the Main view's lock handler; here we make sure the
        // persisted session can't be restored.
        // Every lock path (manual, auto-lock timeout, backgrounding) must
        // tear down the persisted session too, not just the in-memory key —
        // docs/decisions.md guardrail #3.
        void endSession()
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
      // Only ever persist non-secret UI/selection state. vaultKey and
      // unlocked are deliberately excluded here.
      partialize: (s): PersistedAppState => ({
        network: s.network,
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
 *     `set()` — `lock()` included — so deleting the key while the old wallets
 *     and Address Book are still in memory would let the next setter write
 *     them straight back (G-13's residue, by a different route).
 *  2. The key itself is deleted, and awaited: zustand's own
 *     `persist.clearStorage()` returns void, so a reload straight after it
 *     could beat the delete.
 * Session-only fields (`vaultKey`, `unlocked`, `txInFlight`) are not
 * persisted and are left to the caller's lock.
 */
export async function clearPersistedAppState(): Promise<void> {
  useAppStore.setState({ ...PERSISTED_DEFAULTS })
  await idbDel(APP_STATE_STORAGE_KEY)
}

export function useActiveWallet(): WalletMeta | null {
  return useAppStore((s) => s.wallets.find((w) => w.id === s.activeWalletId) ?? null)
}
