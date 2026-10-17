import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { expiredLockIds, lockRemainingMs, touchActiveLock, useAppStore } from '@/store/app-store'
import { extendLockSession } from '@/lib/crypto/lock'
import { tearDownAllLocks, tearDownLock } from '@/lib/teardown'

// How long the app can sit backgrounded (another tab/app focused) before
// coming back counts as "away long enough to lock." Below this, switching
// tabs and immediately switching back is seamless — see resolved bug: an
// instant lock on every visibilitychange made simply alt-tabbing log the
// user out, which is worse UX than the inactivity timer already provides
// (that timer keeps running in the background regardless, throttled but not
// stopped, so a genuinely long backgrounding still locks via resetTimer's
// own setTimeout — this grace window only softens brief tab switches).
//
// The grace applies to DESKTOP only. docs/decisions.md §2 requires an
// immediate lock on backgrounding "on mobile", where backgrounding usually
// means the device left the user's hands and the handover risk is highest —
// and where the alt-tab pattern that motivated the grace window doesn't
// really exist. Detected by pointer type rather than user-agent sniffing.
const BACKGROUND_GRACE_MS = 30_000

function locksImmediatelyOnBackground(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(pointer: coarse)').matches
}

/** wallet-security.md US-1 + FR-65: inactivity auto-lock, one timer PER LOCK
 * (AD-26). Each open lock has its own minutes (from its lock record) and its own
 * expiry; one expiring tears down only that lock's Wallets. Backgrounding the
 * app past the grace window (immediately on a coarse pointer) closes EVERY lock
 * (FR-11). Activity restarts the ACTIVE Wallet's lock timer and, throttled,
 * extends its persisted session, so a page refresh mid-session doesn't force
 * re-entering the PIN/passkey. Expiry is also checked lazily: a timer that a
 * background tab throttled and fired late finds the lock expired on the next
 * activity or visibility event. */
export function useAutoLock() {
  const queryClient = useQueryClient()
  // A primitive, so the effect re-runs only when a lock opens, closes or has its
  // minutes changed — not on every unrelated store update.
  const openSpec = useAppStore((s) =>
    Object.entries(s.openLocks)
      .map(([id, l]) => `${id}\u0000${l.autoLockMinutes}`)
      .sort()
      .join('\u0001'),
  )
  const hiddenAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!openSpec) return
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const lastExtend = new Map<string, number>()

    function arm(lockId: string) {
      const existing = timers.get(lockId)
      if (existing) clearTimeout(existing)
      timers.set(lockId, setTimeout(() => tearDownLock(queryClient, lockId), lockRemainingMs(lockId) ?? 0))
    }

    function onActivity() {
      // A lock that already expired is closed, never extended by this event.
      for (const id of expiredLockIds()) tearDownLock(queryClient, id)
      // Only the ACTIVE Wallet's lock counts the activity: another open lock
      // keeps running down and auto-locks on its own schedule.
      const active = touchActiveLock()
      if (!active) return
      arm(active)
      const lock = useAppStore.getState().openLocks[active]
      const now = Date.now()
      // Throttled — extending on every single mousedown/scroll would hammer
      // IndexedDB; being off by up to 30s on the persisted expiry is fine.
      if (lock && now - (lastExtend.get(active) ?? 0) > 30_000) {
        lastExtend.set(active, now)
        void extendLockSession(active, lock.autoLockMinutes).catch(() => {})
      }
    }

    function handleVisibility() {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now()
        return
      }
      // Became visible again.
      const hiddenAt = hiddenAtRef.current
      hiddenAtRef.current = null
      const grace = locksImmediatelyOnBackground() ? 0 : BACKGROUND_GRACE_MS
      if (hiddenAt !== null && Date.now() - hiddenAt >= grace) {
        tearDownAllLocks(queryClient)
      } else {
        onActivity() // returning within the grace window counts as activity
      }
    }

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((e) => window.addEventListener(e, onActivity))
    document.addEventListener('visibilitychange', handleVisibility)
    // Arm every open lock from its own remaining time, not a fresh window: a
    // lock opened a minute ago must not get its full minutes again because
    // ANOTHER lock opened and re-ran this effect.
    for (const id of Object.keys(useAppStore.getState().openLocks)) arm(id)

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity))
      document.removeEventListener('visibilitychange', handleVisibility)
      timers.forEach((t) => clearTimeout(t))
    }
  }, [openSpec, queryClient])
}
