import { useEffect } from 'react'

/** The part of the Screen Wake Lock API this uses (not in every `lib.dom`). */
interface WakeLockSentinelLike {
  /** True once the browser (on hiding the page) or `release` let it go. */
  readonly released?: boolean
  release(): Promise<void>
}
interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>
}

/**
 * Holds a screen wake lock while `active` (EXPERIENCE "Round timing", owner
 * 2026-11-08): a round screen with a QR shown or a scanner waiting keeps the
 * phone awake. Where the API is missing or refuses, nothing changes. Taken again
 * when the page becomes visible (the browser drops it when hidden).
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock
    if (!active || !wakeLock) return
    let sentinel: WakeLockSentinelLike | null = null
    let pending = false
    let stopped = false
    const take = () => {
      if (stopped || pending || document.visibilityState !== 'visible') return
      // One sentinel at a time: a held one is kept; one the browser let go (page hidden) is taken again.
      if (sentinel && sentinel.released !== true) return
      pending = true
      wakeLock
        .request('screen')
        .then((s) => {
          pending = false
          if (stopped) void s.release().catch(() => {})
          else sentinel = s
        })
        .catch(() => {
          pending = false
        })
    }
    take()
    document.addEventListener('visibilitychange', take)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', take)
      void sentinel?.release().catch(() => {})
    }
  }, [active])
}
