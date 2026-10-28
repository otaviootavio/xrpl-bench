import { useEffect } from 'react'
import { AppHeader } from '@/components/AppHeader'
import { ChassisShell } from '@/components/ChassisShell'
import { Chooser } from '@/pages/Chooser'
import { Main } from '@/pages/Main'
import { useRoute } from '@/hooks/useRoute'
import { useAutoLock } from '@/hooks/useAutoLock'
import { useClearCacheOnLock } from '@/hooks/useClearCacheOnLock'
import { useAppStore } from '@/store/app-store'
import { enteredWalletId, isWalletScreen, resetToHome, type Route } from '@/lib/route'

/**
 * The wallet in view on this route: the one the user is inside, or none.
 *
 * INTERIM (Story 11): Add wallet is still launched from inside a wallet's
 * Settings tab and creates against the active wallet, so it keeps counting that
 * wallet's activity. The `add-wallet` clause goes when Add wallet moves to the
 * chooser.
 */
// oxlint-disable-next-line react/only-export-components -- pinned to this file, beside the route switch that shares it
export function walletInView(route: Route, activeWalletId: string | null): string | null {
  return enteredWalletId(route, activeWalletId) ?? (route.screen === 'add-wallet' ? activeWalletId : null)
}

/**
 * The app shell (AD-31): rendered by Gate whenever a Wallet exists. It mounts
 * the lifecycle hooks ONCE, above the route switch, so expiry timers and the
 * background close run on every route and are never remounted by a route change.
 */
export function AppShell() {
  const route = useRoute()
  const activeWalletId = useAppStore((s) => s.activeWalletId)
  const activeExists = useAppStore((s) => s.wallets.some((w) => w.id === s.activeWalletId))
  useAutoLock(walletInView(route, activeWalletId))
  useClearCacheOnLock()

  // An in-wallet shell renders only for the wallet that is active and exists
  // (AD-32); anything else is an unreachable location and lands on the chooser.
  const shellRoute = route.screen === 'wallet' || route.screen === 'configure'
  const shellReachable = shellRoute && route.walletId === activeWalletId && activeExists
  const chooserSide = route.screen === 'chooser' || route.screen === 'settings' || (shellRoute && !shellReachable)
  const walletSide = isWalletScreen(route) || route.screen === 'add-wallet'
  useEffect(() => {
    if (shellRoute && !shellReachable) resetToHome()
  }, [shellRoute, shellReachable])

  return (
    // The chassis shell (docs/decisions.md §9.1, N1) reserves the annunciator
    // band at the base for every screen, this one included, so blank lower
    // area reads as panel face and a notice arriving never covers a control.
    <ChassisShell
      header={
        <>
          {/* First focusable element on the page: the header's network and
              wallet selects precede the content on every tab
              (docs/decisions.md §6.4). */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:border focus:border-input focus:bg-card focus:px-3 focus:py-2 focus:font-legend focus:text-sm focus:font-semibold focus:uppercase focus:tracking-[0.09em] focus:shadow-md"
          >
            Skip to content
          </a>
          {walletSide && !chooserSide ? (
            <AppHeader />
          ) : (
            // Chooser side: the skip link and the nameplate, nothing that reads a wallet (AD-36).
            <header className="flex items-center border-b border-border bg-background px-4 py-2.5">
              <span className="panel-legend text-[0.75rem] tracking-[0.22em] text-foreground">XRPL Bench</span>
            </header>
          )}
        </>
      }
    >
      {/* tabIndex={-1} so the skip link moves FOCUS here, not just the
          sequential-navigation start point — Safari needs the explicit
          target. It stays out of the tab order. Nothing suppresses the ring on
          this landing target: §6.3 admits no carve-out. */}
      <main id="main-content" tabIndex={-1} className="px-4 pb-6 pt-3">
        {chooserSide ? <Chooser /> : <Main />}
      </main>
    </ChassisShell>
  )
}
