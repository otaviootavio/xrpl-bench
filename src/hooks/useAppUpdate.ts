import { useCallback, useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * User-controlled updates — app-versioning-and-updates.md US-2/US-3/US-4.
 *
 * `registerType: 'prompt'` installs a new service worker and leaves it
 * WAITING. This hook exposes that waiting state and the single explicit action
 * that activates it. Nothing here activates on its own, and nothing reloads the
 * page without the user asking (docs/decisions.md §8.8).
 *
 * Deliberately NOT a TanStack Query hook: guardrail #1 governs *ledger* reads,
 * and this is a service-worker lifecycle subscription with no ledger involved.
 *
 * `registerSW` is called once at module scope rather than inside the effect, so
 * React StrictMode's double-invoke cannot register two workers.
 */
type UpdateFn = (reload?: boolean) => Promise<void>

let updateSW: UpdateFn | null = null
let waiting = false
const listeners = new Set<(v: boolean) => void>()

function setWaiting(v: boolean) {
  waiting = v
  listeners.forEach((l) => l(v))
}

if (typeof window !== 'undefined' && !updateSW) {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // A new version is ready and waiting. We only record it — we never apply
      // it. US-2: "the running code is not replaced".
      setWaiting(true)
    },
  })
}

export function useAppUpdate() {
  const [updateReady, setUpdateReady] = useState(waiting)
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    listeners.add(setUpdateReady)
    return () => {
      listeners.delete(setUpdateReady)
    }
  }, [])

  /**
   * The one action that swaps the running code. Activates the waiting worker
   * and reloads. Callers MUST gate this on there being no transaction in
   * flight (US-5) — a reload between signing and learning the outcome loses
   * the client's view of a result that is nevertheless real on the ledger.
   */
  const applyUpdate = useCallback(async () => {
    if (!updateSW) return
    setApplying(true)
    try {
      await updateSW(true)
    } catch {
      // Activation failed: the user keeps the version they had, and the
      // control becomes available again rather than pretending it worked.
      setApplying(false)
    }
  }, [])

  return { updateReady, applying, applyUpdate }
}
