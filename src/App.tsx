import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Onboarding } from '@/pages/Onboarding'
import { Unlock } from '@/pages/Unlock'
import { Main } from '@/pages/Main'
import { useAppStore } from '@/store/app-store'
import { listWallets } from '@/lib/crypto/keystore'
import { restoreSession } from '@/lib/crypto/auth'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

function Gate() {
  const wallets = useAppStore((s) => s.wallets)
  const setWallets = useAppStore((s) => s.setWallets)
  const activeWalletId = useAppStore((s) => s.activeWalletId)
  const setActiveWalletId = useAppStore((s) => s.setActiveWalletId)
  const unlocked = useAppStore((s) => s.unlocked)
  const unlock = useAppStore((s) => s.unlock)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Hydrates the wallet list from IndexedDB on mount — not a ledger read,
    // so it's outside the TanStack Query guardrail. zustand setters are
    // referentially stable, so listing them here is safe and complete
    // (docs/decisions.md guardrail #2: never disable exhaustive-deps).
    let cancelled = false
    listWallets().then(async (stored) => {
      if (cancelled) return
      setWallets(stored)
      if (!activeWalletId && stored.length > 0) setActiveWalletId(stored[0].id)
      // Restores a still-valid unlocked session so a page refresh within
      // the auto-lock window doesn't force re-entering the PIN/passkey —
      // see docs/decisions.md and lib/crypto/auth.ts restoreSession().
      if (stored.length > 0) {
        const restoredKey = await restoreSession()
        if (!cancelled && restoredKey) unlock(restoredKey)
      }
      if (!cancelled) setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [activeWalletId, setActiveWalletId, setWallets, unlock])

  if (!ready) return null
  if (wallets.length === 0) return <Onboarding />
  if (!unlocked) return <Unlock />
  return <Main />
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Gate />
        {/* `closeButton` is required, not cosmetic: errors and warnings never
            auto-dismiss (see lib/notify.ts + docs/decisions.md §6.5), so they
            need a way out. Per-type durations live in lib/notify.ts because
            sonner's toastOptions cannot express them.

            `richColors` is deliberately off: it would paint toasts from
            sonner's own palette, which is not measured by
            `bun run check:contrast`. These classNames use the same tinted
            alert surfaces and text-* tokens as `Alert`, so a notification and
            an inline notice report the same state in the same colours. */}
        <Toaster
          closeButton
          position="top-center"
          toastOptions={{
            classNames: {
              toast: 'panel-plate rounded-md gap-2.5 text-sm',
              title: 'font-legend font-semibold uppercase tracking-[0.08em] text-[0.8125rem]',
              description: 'font-legend leading-snug text-muted-foreground',
              closeButton: 'rounded-sm border-border bg-card text-foreground',
              success: 'border-success/45 bg-success/10 text-text-success',
              error: 'border-destructive/45 bg-destructive/10 text-text-destructive',
              warning: 'border-warning/45 bg-warning/10 text-text-warning',
              info: 'border-border bg-card text-foreground',
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
