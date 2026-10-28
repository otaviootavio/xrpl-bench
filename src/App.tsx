import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PinPromptProvider } from '@/components/wallet/PinPromptDialog'
import { Onboarding } from '@/pages/Onboarding'
import { Main } from '@/pages/Main'
import { GateError } from '@/components/wallet/GateError'
import { appStateHydrationFailed, appStateSettled, useAppStore } from '@/store/app-store'
import { listWallets, migrateLegacyVault } from '@/lib/crypto/keystore'
import { resetToHome } from '@/lib/route'
import { restoreOpenLocks } from '@/lib/crypto/lock'
import { notify, setNoticeWalletReader } from '@/lib/notify'
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

// A notice belongs to the Wallet that was active when it was raised, and goes when
// another becomes active: an error about Wallet A must not sit over Wallet B.
setNoticeWalletReader(() => useAppStore.getState().activeWalletId)
useAppStore.subscribe((state, previous) => {
  if (state.activeWalletId !== previous.activeWalletId) notify.scopeToWallet(state.activeWalletId)
})

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
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  // Bumped by Retry after a failed vault read; re-runs the effect below.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    // Hydrates the wallet list from IndexedDB on mount — not a ledger read,
    // so it's outside the TanStack Query guardrail. zustand setters are
    // referentially stable, so listing them here is safe and complete
    // (docs/decisions.md guardrail #2: never disable exhaustive-deps). Re-runs
    // only on Retry: the selection is read from the store, not from a
    // dependency, so switching Wallets never re-restores sessions.
    //
    // AD-37: no store setter runs before a successful read — after a failed
    // hydration `persist` would write the defaults over the saved state.
    let cancelled = false
    migrateOnce()
      .then(async () => {
        if (appStateHydrationFailed()) {
          if (!cancelled) setStatus('error')
          return
        }
        const stored = await listWallets(useAppStore.getState().network)
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
        if (!cancelled) setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [attempt, openLock, setActiveWalletId, setWallets])

  // A task screen's path means nothing before there is a Wallet: boot at the shell.
  const noWallets = status === 'ready' && wallets.length === 0
  useEffect(() => {
    if (noWallets) resetToHome()
  }, [noWallets])

  if (status === 'loading') return null
  if (status === 'error') {
    // Hydration runs once per load, so its failure is retried by reloading. A failed
    // vault read re-runs the effect, with the error surface kept mounted (and focus
    // on Retry) until the read answers.
    const retry = () => {
      if (appStateHydrationFailed()) window.location.reload()
      else setAttempt((n) => n + 1)
    }
    return <GateError onRetry={retry} />
  }
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
