import { useCallback, useEffect, useState } from 'react'
import { registerSW } from '@/lib/sw-register'
import { useAppStore } from '@/store/app-store'
import { checkForRelease, type ReleaseManifest } from '@/lib/release-check'
import { BUILD } from '@/lib/build-info'
import { notify } from '@/lib/notify'
import { useNoticeStore } from '@/store/notice-store'

/**
 * User-controlled updates — app-versioning-and-updates.md US-2/US-3/US-4/US-5.
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
let registration: ServiceWorkerRegistration | undefined
let waiting = false
const listeners = new Set<(v: boolean) => void>()

/**
 * US-6/V4: "a major release presents the update more insistently — a
 * persistent, clearly-worded notice — while minor and patch releases surface
 * quietly in Settings." A stronger `Alert` variant inside the Version card is
 * still only visible to someone who has already opened Settings, so a major
 * or security-marked release additionally raises a real Annunciator notice —
 * reachable from any tab, exactly the surface S16/S17 built for this. Module
 * state, not component state, because `useAppUpdate` is called from both
 * `Main` and `SettingsTab`; without this, each mounted caller would raise its
 * own copy of the same notice.
 */
let insistentNoticeCommit: string | null = null
let insistentNoticeId: string | null = null

function setWaiting(v: boolean) {
  waiting = v
  listeners.forEach((l) => l(v))
}

if (typeof window !== 'undefined' && !updateSW) {
  updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      registration = reg
    },
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
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState(false)
  const [pendingRelease, setPendingRelease] = useState<ReleaseManifest | null>(null)
  const txInFlight = useAppStore((s) => s.txInFlight)
  const declinedVersions = useAppStore((s) => s.declinedUpdateVersions)
  const declineUpdateVersion = useAppStore((s) => s.declineUpdateVersion)

  useEffect(() => {
    listeners.add(setUpdateReady)
    return () => {
      listeners.delete(setUpdateReady)
    }
  }, [])

  // Metadata (version/notes/bump/security — US-6) is only worth fetching once
  // the service worker has actually found something waiting; this never
  // blocks startup or the SW check itself (US-9).
  useEffect(() => {
    if (!updateReady || pendingRelease) return
    let cancelled = false
    void checkForRelease().then((result) => {
      if (!cancelled && result.ok) setPendingRelease(result.manifest)
    })
    return () => {
      cancelled = true
    }
  }, [updateReady, pendingRelease])

  // US-6/V4's "more insistently" half: once a major or security-marked
  // release's manifest resolves, and it has not already been declined, put a
  // real notice in the Annunciator — not just a louder Alert nobody sees
  // until they open Settings. Guarded by commit so it fires once per release
  // per session, not once per mounted caller and not once per re-render.
  useEffect(() => {
    if (!pendingRelease) return
    const insistent = pendingRelease.bump === 'major' || pendingRelease.security
    if (!insistent) return
    if (declinedVersions.includes(pendingRelease.commit)) return
    if (insistentNoticeCommit === pendingRelease.commit) return
    insistentNoticeCommit = pendingRelease.commit
    insistentNoticeId = notify.warning(
      pendingRelease.security
        ? `A security update is available (v${pendingRelease.version}).`
        : `A major update is available (v${pendingRelease.version}).`,
      { description: 'Review it in Settings. Nothing installs until you choose to.' },
    )
  }, [pendingRelease, declinedVersions])

  /**
   * The on-demand half of US-2: "on startup, and when the user asks". Calling
   * the registration's own `update()` is what makes the browser re-fetch
   * `sw.js` and compare bytes; a resolved release manifest with a different
   * commit than this build is the corroborating, human-readable signal.
   */
  const checkForUpdate = useCallback(async () => {
    setChecking(true)
    setCheckError(false)
    try {
      await registration?.update()
      const result = await checkForRelease()
      if (result.ok && result.manifest.commit !== BUILD.commitSha) {
        setPendingRelease(result.manifest)
      } else if (!result.ok && !registration) {
        // No registration at all (never registered, e.g. no PWA support) AND
        // no manifest reachable — genuinely could not tell, not "no update".
        setCheckError(true)
      }
    } catch {
      setCheckError(true)
    } finally {
      setChecking(false)
    }
  }, [])

  /**
   * The one action that swaps the running code. Activates the waiting worker
   * and reloads. Refuses while a transaction is in flight (US-5) — a reload
   * mid-submit would lose the client's view of a result that is nevertheless
   * real on the ledger. The UI must also disable its own control; this is
   * defence in depth, not the only gate.
   */
  const applyUpdate = useCallback(async () => {
    if (!updateSW || txInFlight) return
    setApplying(true)
    try {
      await updateSW(true)
    } catch {
      // Activation failed: the user keeps the version they had, and the
      // control becomes available again rather than pretending it worked.
      setApplying(false)
    }
  }, [txInFlight])

  const declineKey = pendingRelease?.commit ?? null
  const declined = declineKey !== null && declinedVersions.includes(declineKey)
  const declineCurrent = useCallback(() => {
    if (!declineKey) return
    declineUpdateVersion(declineKey)
    // "Not now" also retires the insistent notice for THIS release — US-4's
    // "not re-prompted on every launch" would otherwise be undermined by a
    // notice that outlives the decline it responds to. A newer release still
    // gets its own notice; this only silences the one just declined.
    if (insistentNoticeCommit === declineKey && insistentNoticeId) {
      useNoticeStore.getState().dismiss(insistentNoticeId)
      insistentNoticeId = null
    }
  }, [declineKey, declineUpdateVersion])

  return {
    updateReady,
    applying,
    applyUpdate,
    checking,
    checkError,
    checkForUpdate,
    pendingRelease,
    /** US-5: a plain-language reason to render `aria-disabled` with — never
     * to hide the control (docs/decisions.md §6.4). */
    blockedReason: txInFlight ? 'A transaction is in progress. Wait for it to finish before installing an update.' : null,
    declined,
    declineCurrent,
  }
}
