import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
