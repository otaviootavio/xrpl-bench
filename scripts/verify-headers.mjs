#!/usr/bin/env node
/**
 * Deploy gate: the served cache headers must not be able to pin a user to a
 * stale app shell.
 *
 * Why this exists as an executable check rather than a checklist item: on
 * 2026-09-02 a freshly created bunny `sites` pull zone served EVERYTHING —
 * index.html, sw.js, the manifest — with `max-age=2592000`. Thirty days. A user
 * would have been pinned to a stale shell for a month, and the service worker
 * could not have discovered an update at all. That is precisely the failure
 * docs/decisions.md guardrail #6 exists to prevent, and nothing in the build,
 * the tests, or the contrast harness can see it. See §8.7.
 *
 * Usage:  node scripts/verify-headers.mjs <base-url>
 * Exits non-zero on any hard failure.
 */

const base = (process.argv[2] || '').replace(/\/$/, '')
if (!base) {
  console.error('usage: node scripts/verify-headers.mjs <base-url>')
  process.exit(2)
}

/** The shell. If any of these is cached long, the wallet can show stale data. */
const SHELL = ['/', '/index.html', '/sw.js', '/manifest.webmanifest']
/** Anything above this on a shell resource is a stale-wallet risk. */
const SHELL_MAX_AGE_CEILING = 300

function parseMaxAge(cc) {
  const m = /(?:^|[,\s])max-age\s*=\s*(\d+)/i.exec(cc || '')
  return m ? Number(m[1]) : null
}

async function head(url) {
  const res = await fetch(url, { method: 'GET', redirect: 'follow' })
  return { status: res.status, cc: res.headers.get('cache-control') || '', body: res }
}

const failures = []
const warnings = []

console.log(`Verifying cache headers on ${base}\n`)

for (const path of SHELL) {
  const { status, cc } = await head(base + path)
  const age = parseMaxAge(cc)
  const immutable = /immutable/i.test(cc)
  const noStore = /no-store|no-cache/i.test(cc)
  let verdict = 'OK'

  if (status >= 400) {
    failures.push(`${path} returned HTTP ${status}`)
    verdict = 'FAIL'
  } else if (immutable) {
    // The worst case: a shell that can never be replaced.
    failures.push(`${path} is marked immutable — the shell could never be updated`)
    verdict = 'FAIL'
  } else if (!noStore && age !== null && age > SHELL_MAX_AGE_CEILING) {
    failures.push(`${path} has max-age=${age}, above the ${SHELL_MAX_AGE_CEILING}s ceiling for shell resources`)
    verdict = 'FAIL'
  } else if (!noStore && age === null) {
    // No directive at all means browser heuristic freshness: an unbounded,
    // unspecified stale window. Worse than a wrong-but-known number.
    failures.push(`${path} sends no max-age and no no-cache — browsers will apply heuristic freshness`)
    verdict = 'FAIL'
  }
  console.log(`  ${verdict.padEnd(4)} ${path.padEnd(24)} ${cc || '(no cache-control)'}`)
}

// Hashed assets: content-addressed, so long caching is safe and desirable.
// This is an advisory, NOT a failure: bunny `sites` currently exposes no
// working per-path cache lever through its API (§8.7), so the zone-wide safe
// floor makes these short too. Short assets cost bandwidth; a stale shell costs
// correctness. We accept the former and refuse the latter.
try {
  const html = await (await fetch(base + '/index.html')).text()
  const asset = /\/assets\/[A-Za-z0-9._-]+\.js/.exec(html)?.[0]
  if (asset) {
    const { cc } = await head(base + asset)
    const age = parseMaxAge(cc)
    const ok = age !== null && age >= 86400
    console.log(`  ${ok ? 'OK  ' : 'note'} ${asset.padEnd(24)} ${cc || '(none)'}`)
    if (!ok) {
      warnings.push(
        `hashed assets are not long-lived (${cc || 'no cache-control'}). Safe, but wasteful — ` +
          `revisit if bunny exposes a working per-path cache rule. See docs/decisions.md §8.7.`,
      )
    }
  }
} catch {
  warnings.push('could not sample a hashed asset from index.html')
}

console.log()
for (const w of warnings) console.log(`NOTE: ${w}`)
if (failures.length) {
  console.error('\nHEADER CHECK FAILED:')
  for (const f of failures) console.error(`  - ${f}`)
  console.error('\nA long-cached shell can serve a wrong balance. Refusing the deploy.')
  process.exit(1)
}
console.log('Header check passed: no shell resource can pin a user to a stale build.')
