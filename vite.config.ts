import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'
import { execSync } from 'node:child_process'

/**
 * Build stamp — app-versioning-and-updates.md US-1.
 *
 * Baked in at build time, never fetched at runtime, so the running build can
 * identify itself offline and a later network response cannot change what it
 * claims to be. CI supplies GITHUB_SHA; a local build falls back to git.
 *
 * A release build with no resolvable commit FAILS rather than shipping an
 * unidentifiable wallet (US-1: "never rendered as unknown/dev/empty"). That is
 * deliberate: a build nobody can trace to a source tag cannot be verified
 * against it, which is the whole point of US-7.
 */
function git(cmd: string): string | null {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return null
  }
}

/**
 * The build date is the COMMIT date, never `new Date()`.
 *
 * A wall-clock timestamp would change the bundle on every build and destroy
 * reproducibility — which docs/decisions.md §8.6 depends on, and which US-7's
 * "rebuild from the tag and compare hashes" is meaningless without. Same
 * commit in, same bytes out.
 */
function resolveCommitDate(isRelease: boolean): string {
  const epoch = process.env.SOURCE_DATE_EPOCH
  if (epoch) return new Date(Number(epoch) * 1000).toISOString()
  const iso = git('git log -1 --format=%cI')
  if (iso) return new Date(iso).toISOString()
  if (isRelease) {
    throw new Error(
      'Build date unavailable: no SOURCE_DATE_EPOCH and no git commit date. A release build must ' +
        'be reproducible (docs/decisions.md §8.6).',
    )
  }
  return new Date(0).toISOString()
}

function resolveCommitSha(isRelease: boolean): string {
  const fromCi = process.env.GITHUB_SHA
  if (fromCi) return fromCi
  const sha = git('git rev-parse HEAD')
  if (sha) return sha
  if (isRelease) {
    throw new Error(
      'Build stamp unavailable: no GITHUB_SHA and no git commit. A release build must be ' +
        'traceable to a source commit (docs/user-stories/app-versioning-and-updates.md US-1). ' +
        'Set GITHUB_SHA to build outside a git checkout.',
    )
  }
  return 'unknown-dev'
}

export default defineConfig(({ mode }) => {
  // Anything not an explicit dev server is treated as release-grade.
  const isRelease = mode === 'production'
  const commitSha = resolveCommitSha(isRelease)
  const builtAt = resolveCommitDate(isRelease)

  return {
    define: {
      __COMMIT_SHA__: JSON.stringify(commitSha),
      __BUILD_DATE__: JSON.stringify(builtAt),
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        /**
         * NEVER 'autoUpdate'. The user decides when the signing code changes
         * (docs/decisions.md §8.8, app-versioning-and-updates.md US-2/US-3).
         *
         * 'prompt' means a new worker installs and WAITS; nothing calls
         * skipWaiting() except the explicit control in Settings. Changing this
         * to 'autoUpdate' would let a compromised origin swap the wallet's
         * signing code silently, which is the single property this delivery
         * model exists to refuse.
         *
         * 'prompt' alone is also not enough: without the Install control in the
         * UI there is no update path at all. The two ship together.
         */
        registerType: 'prompt',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'XRPL Bench',
          short_name: 'XRPL Bench',
          // Explicit id pins the PWA install identity. Without it the identity
          // derives from start_url, so a path change would orphan installs —
          // and an install carries the origin-scoped vault (§8.11).
          id: '/',
          description: 'Self-custody XRP Ledger wallet',
          theme_color: '#e6eaef',
          background_color: '#e6eaef',
          display: 'standalone',
          icons: [
            { src: 'pwa-192.svg', sizes: '192x192', type: 'image/svg+xml' },
            { src: 'pwa-512.svg', sizes: '512x512', type: 'image/svg+xml' },
          ],
        },
        workbox: {
          // Only the static app shell is precached. Ledger/RPC traffic (XRPL
          // JSON-RPC + WebSocket, faucet) must NEVER be served from cache —
          // see docs/decisions.md guardrail #6. Explicitly exclude any runtime
          // caching for those hosts by not registering a runtimeCaching entry
          // for them; navigateFallback covers the SPA shell only.
          navigateFallback: 'index.html',
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          // releases.json is the update manifest served from our own origin
          // (§8.9). Precaching it would make the app check a cached copy of
          // "what is the latest version", which is self-defeating.
          globIgnores: ['**/releases.json'],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },
  }
})
