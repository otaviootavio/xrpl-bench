import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PinPromptProvider } from '@/components/wallet/PinPromptDialog'
import { Onboarding } from '@/pages/Onboarding'
import { Main } from '@/pages/Main'
import { appStateHydrationFailed, appStateSettled, useAppStore } from '@/store/app-store'
import { listWallets, migrateLegacyVault } from '@/lib/crypto/keystore'
import { restoreOpenLocks } from '@/lib/crypto/lock'
import { setTxInFlightReporter } from '@/lib/xrpl/writes'

/**
 * Wires the write choke point's in-flight signal to the app store — AD-1:
 * `lib/xrpl/writes.ts` reports upward, it does not reach into the store.
 *
 * Installed at MODULE scope, not in an effect, for the same reason
 * `useAppUpdate` registers its worker there: StrictMode double-invokes
 * effects, and an effect would also leave a window in which a submit could
 * run before the reporter was installed. FR-48 (no update activates
 * mid-transaction) depends on this line being in place.
 */
setTxInFlightReporter((inFlight) => useAppStore.getState().setTxInFlight(inFlight))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

/** Story 12.1 / AD-27: the legacy-vault relabel, run once per app start and only
 * here — in a build the user has already activated. Idempotent and atomic in the
 * vault; an error leaves every Wallet on its legacy shape, still openable. */
let migration: Promise<void> | null = null
function migrateOnce(): Promise<void> {
  migration ??= appStateSettled()
    .then(() => {
      // A failed read leaves the store on its defaults, and the relabel writes
      // `network` into the vault for good: skip it, so every Wallet stays on its
      // legacy shape and the next app start tries again.
      if (appStateHydrationFailed()) return undefined
      const { network, autoLockMinutes } = useAppStore.getState()
      return migrateLegacyVault({ network, autoLockMinutes })
    })
    .then(() => undefined)
    .catch((err: unknown) => {
      // Not cached: a later call retries.
      console.error('Legacy vault migration failed; Wallets stay on their legacy shape.', err)
      migration = null
    })
  return migration
}

/** Story 4 / AD-26: there is no app-wide unlock gate. The app opens to the shell;
 * `Main` shows the active Wallet's locked view until its own lock is open. */
function Gate() {
  const wallets = useAppStore((s) => s.wallets)
  const setWallets = useAppStore((s) => s.setWallets)
  const setActiveWalletId = useAppStore((s) => s.setActiveWalletId)
  const openLock = useAppStore((s) => s.openLock)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Hydrates the wallet list from IndexedDB on mount — not a ledger read,
    // so it's outside the TanStack Query guardrail. zustand setters are
    // referentially stable, so listing them here is safe and complete
    // (docs/decisions.md guardrail #2: never disable exhaustive-deps). Runs
    // once: the selection is read from the store, not from a dependency, so
    // switching Wallets never re-restores sessions.
    let cancelled = false
    migrateOnce().then(() => listWallets(useAppStore.getState().network)).then(async (stored) => {
      if (cancelled) return
      setWallets(stored)
      const active = useAppStore.getState().activeWalletId
      if (stored.length > 0 && !stored.some((w) => w.id === active)) setActiveWalletId(stored[0].id)
      // Restores each lock's still-valid session so a page refresh within ITS
      // auto-lock window doesn't force re-entering the PIN/passkey — see
      // lib/crypto/lock.ts restoreOpenLocks(). Locks without a valid session stay closed.
      if (stored.length > 0) {
        for (const restored of await restoreOpenLocks().catch(() => [])) {
          if (!cancelled) openLock(restored.lockId, restored.key, restored.autoLockMinutes, restored.expiresAt)
        }
      }
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [openLock, setActiveWalletId, setWallets])

  if (!ready) return null
  if (wallets.length === 0) return <Onboarding />
  return <Main />
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PinPromptProvider>
          <Gate />
        </PinPromptProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
