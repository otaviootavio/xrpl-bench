import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { blockLeaving, currentPathname, isLeaveBlocked, parseRoute, subscribeLeaveBlockers, subscribeRoute, type Route } from '@/lib/route'

/** The current screen, from the location. */
export function useRoute(): Route {
  const pathname = useSyncExternalStore(subscribeRoute, currentPathname, () => '/')
  return useMemo(() => parseRoute(pathname), [pathname])
}

/** While `active`, the browser's Back and in-app navigation cannot leave the screen:
 * a write or a Seed backup is running there and its outcome must stay visible. */
export function useLeaveBlocker(active: boolean): void {
  useEffect(() => {
    if (!active) return undefined
    return blockLeaving()
  }, [active])
}

/** Whether a screen is currently blocking leaving; re-renders when that changes. */
export function useLeaveBlocked(): boolean {
  return useSyncExternalStore(subscribeLeaveBlockers, isLeaveBlocked, () => false)
}
