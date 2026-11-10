import { useEffect } from 'react'

/** The part of the Screen Wake Lock API this uses (not in every `lib.dom`). */
interface WakeLockSentinelLike {
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
    let stopped = false
    const take = () => {
      if (document.visibilityState !== 'visible') return
      wakeLock
        .request('screen')
        .then((s) => {
          if (stopped) void s.release().catch(() => {})
          else sentinel = s
        })
        .catch(() => {})
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
