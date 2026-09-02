/**
 * The client side of `scripts/gen-release-manifest.mjs` — app-versioning-and-
 * updates.md US-2/US-6/US-7.
 *
 * Fetched from the app's own origin, never GitHub's API (docs/decisions.md
 * §8.9): a third-party check would tell that party when someone is running
 * this wallet. Deliberately not a TanStack Query hook — guardrail #1 governs
 * *ledger* reads, and this touches no XRPL endpoint.
 */
export interface ReleaseManifest {
  version: string
  commit: string
  releasedAt: string
  bump: 'major' | 'minor' | 'patch'
  security: boolean
  notes: string
  verify: string
  assets: Record<string, string>
}

export type ReleaseCheckResult =
  | { ok: true; manifest: ReleaseManifest }
  /** Distinguishes "asked and got told no" from "couldn't ask" — US-2. */
  | { ok: false }

function isReleaseManifest(value: unknown): value is ReleaseManifest {
  if (!value || typeof value !== 'object') return false
  const m = value as Record<string, unknown>
  return (
    typeof m.version === 'string' &&
    typeof m.commit === 'string' &&
    typeof m.releasedAt === 'string' &&
    (m.bump === 'major' || m.bump === 'minor' || m.bump === 'patch') &&
    typeof m.security === 'boolean'
  )
}

/**
 * Never cached by the service worker (`globIgnores` in `vite.config.ts`) and
 * fetched with `cache: 'no-store'` here too, so a stale HTTP cache entry can't
 * make "is there an update" self-defeating. Never throws — a failed or
 * missing manifest (offline, not yet deployed, local dev with no CDN) reports
 * as `{ ok: false }` rather than crashing whatever called it, per US-9:
 * nothing about this check may block startup.
 */
export async function checkForRelease(): Promise<ReleaseCheckResult> {
  try {
    const res = await fetch('/releases.json', { cache: 'no-store' })
    if (!res.ok) return { ok: false }
    const data: unknown = await res.json()
    if (!isReleaseManifest(data)) return { ok: false }
    return { ok: true, manifest: data }
  } catch {
    return { ok: false }
  }
}
