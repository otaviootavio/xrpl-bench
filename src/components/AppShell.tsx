import { AppHeader } from '@/components/AppHeader'
import { ChassisShell } from '@/components/ChassisShell'
import { Main } from '@/pages/Main'
import { useRoute } from '@/hooks/useRoute'
import { useAutoLock } from '@/hooks/useAutoLock'
import { useClearCacheOnLock } from '@/hooks/useClearCacheOnLock'
import { useAppStore } from '@/store/app-store'
import type { Route } from '@/lib/route'

/**
 * The wallet in view on this route.
 *
 * INTERIM (removed by Story 5): until the chooser screen exists, `/` and every
 * chooser-side route still render the wallet shell, so the wallet in view is the
 * active one on every route. Story 5 replaces this body with
 * `enteredWalletId(route, activeWalletId)` from `@/lib/route`.
 */
// oxlint-disable-next-line react/only-export-components -- the spec pins this function to this file until Story 5
export function walletInView(_route: Route, activeWalletId: string | null): string | null {
  return activeWalletId
}

/**
 * The app shell (AD-31): rendered by Gate whenever a Wallet exists. It mounts
 * the lifecycle hooks ONCE, above the route switch, so expiry timers and the
 * background close run on every route and are never remounted by a route change.
 */
export function AppShell() {
  const route = useRoute()
  const activeWalletId = useAppStore((s) => s.activeWalletId)
  useAutoLock(walletInView(route, activeWalletId))
  useClearCacheOnLock()

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
          <AppHeader />
        </>
      }
    >
      {/* tabIndex={-1} so the skip link moves FOCUS here, not just the
          sequential-navigation start point — Safari needs the explicit
          target. It stays out of the tab order. Nothing suppresses the ring on
          this landing target: §6.3 admits no carve-out. */}
      <main id="main-content" tabIndex={-1} className="px-4 pb-6 pt-3">
        <Main />
      </main>
    </ChassisShell>
  )
}
