/**
 * Which build is this — app-versioning-and-updates.md US-1.
 *
 * Values are injected at build time by `vite.config.ts` (`define`), so they are
 * correct offline and cannot be altered by a later network response. A release
 * build with no resolvable commit fails at build time rather than shipping.
 */
declare const __COMMIT_SHA__: string
declare const __BUILD_DATE__: string
declare const __APP_VERSION__: string

export const BUILD = {
  version: __APP_VERSION__,
  commitSha: __COMMIT_SHA__,
  builtAt: __BUILD_DATE__,
} as const

/** First 7 characters, the form a human compares against a commit listing. */
export const shortSha = BUILD.commitSha.slice(0, 7)

/** True when this build cannot be traced to a commit — only possible in dev. */
export const isUntraceable = BUILD.commitSha === 'unknown-dev'

const REPO = 'https://github.com/otaviootavio/xrpl-bench'

/** The exact source this build came from, so a reader can go and check it. */
export const sourceUrl = isUntraceable ? REPO : `${REPO}/commit/${BUILD.commitSha}`

export function formatBuiltAt(): string {
  const d = new Date(BUILD.builtAt)
  return Number.isNaN(d.getTime()) ? BUILD.builtAt : d.toLocaleString()
}
