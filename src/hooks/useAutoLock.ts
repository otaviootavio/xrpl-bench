import { useEffect, useRef } from 'react'
import { useAppStore } from '@/store/app-store'
import { extendSession } from '@/lib/crypto/auth'

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

/** wallet-security.md US-1 + docs/decisions.md resolved decision: default
 * 5-minute inactivity auto-lock (configurable). Backgrounding the app
 * (switching tabs/apps) only locks if it stays backgrounded past a short
 * grace window, not on every tab switch — see BACKGROUND_GRACE_MS above.
 * Also extends the persisted unlocked session (see lib/crypto/auth.ts) on
 * activity, so a page refresh mid-session doesn't force re-entering the
 * PIN/passkey. */
export function useAutoLock() {
  const unlocked = useAppStore((s) => s.unlocked)
  const autoLockMinutes = useAppStore((s) => s.autoLockMinutes)
  const vaultKey = useAppStore((s) => s.vaultKey)
  const lock = useAppStore((s) => s.lock)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastExtendRef = useRef(0)
  const hiddenAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!unlocked || !vaultKey) return

    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => lock(), autoLockMinutes * 60_000)
      // Throttled — extending on every single mousedown/scroll would hammer
      // IndexedDB; being off by up to 30s on the persisted expiry is fine.
      const now = Date.now()
      if (vaultKey && now - lastExtendRef.current > 30_000) {
        lastExtendRef.current = now
        void extendSession(vaultKey, autoLockMinutes)
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
      if (hiddenAt !== null && Date.now() - hiddenAt > grace) {
        lock()
      } else {
        resetTimer() // returning within the grace window counts as activity
      }
    }

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((e) => window.addEventListener(e, resetTimer))
    document.addEventListener('visibilitychange', handleVisibility)
    resetTimer()

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer))
      document.removeEventListener('visibilitychange', handleVisibility)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [unlocked, autoLockMinutes, lock, vaultKey])
}
