import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import type { NetworkId } from '@/lib/xrpl/networks'
import type { WalletMeta } from '@/lib/crypto/keystore'
import { endSession } from '@/lib/crypto/auth'

interface AppState {
  // Non-secret, persisted state
  network: NetworkId
  wallets: WalletMeta[]
  activeWalletId: string | null
  addressBook: { address: string; label: string }[]
  autoLockMinutes: number
  /** app-versioning-and-updates.md US-4: a declined release's identifier (its
   * commit SHA) is remembered so it stops nagging, while a newer one still
   * surfaces. Non-secret, so it's fine alongside the rest of this state. */
  declinedUpdateVersions: string[]

  // Secret / session-only state — NEVER persisted (docs/decisions.md
  // guardrail #3: no secret ever enters anything serializable).
  vaultKey: CryptoKey | null
  unlocked: boolean
  /** app-versioning-and-updates.md US-5: true for the exact window a payment
   * or trust-line transaction is signing, submitted, or awaiting validation.
   * Session-only and deliberately not derived from any per-tab local state —
   * Radix unmounts inactive `TabsContent`, so a flag local to `SendTab` would
   * vanish the moment the user switched away from it mid-send. Set/cleared at
   * the single choke point every write passes through
   * (`lib/xrpl/writes.ts#submitAndClassify`). */
  txInFlight: boolean

  setNetwork: (network: NetworkId) => void
  setWallets: (wallets: WalletMeta[]) => void
  setActiveWalletId: (id: string | null) => void
  setAutoLockMinutes: (minutes: number) => void
  addAddressBookEntry: (address: string, label: string) => void
  declineUpdateVersion: (id: string) => void
  setTxInFlight: (inFlight: boolean) => void
  unlock: (key: CryptoKey) => void
  lock: () => void
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
      network: 'testnet',
      wallets: [],
      activeWalletId: null,
      addressBook: [],
      autoLockMinutes: 5,
      declinedUpdateVersions: [],

      vaultKey: null,
      unlocked: false,
      txInFlight: false,

      setNetwork: (network) => set({ network }),
      setWallets: (wallets) => set({ wallets }),
      setActiveWalletId: (activeWalletId) => set({ activeWalletId }),
      setAutoLockMinutes: (autoLockMinutes) => set({ autoLockMinutes }),
      addAddressBookEntry: (address, label) =>
        set((s) => ({ addressBook: [...s.addressBook.filter((e) => e.address !== address), { address, label }] })),
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
      name: 'xrpl-wallet-app-state',
      // docs/decisions.md §1 specifies IndexedDB for app state, not
      // localStorage (zustand's default). The payload here is non-secret, but
      // keeping every persisted byte in one store means teardown has a single
      // place to clear and nothing app-related is left behind in localStorage.
      storage: createJSONStorage(() => indexedDbStorage),
      // Only ever persist non-secret UI/selection state. vaultKey and
      // unlocked are deliberately excluded here.
      partialize: (s) => ({
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

export function useActiveWallet(): WalletMeta | null {
  return useAppStore((s) => s.wallets.find((w) => w.id === s.activeWalletId) ?? null)
}
