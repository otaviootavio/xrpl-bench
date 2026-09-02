#!/usr/bin/env node
/**
 * Emits dist/releases.json — the update manifest the app checks (US-2).
 *
 * Served from the app's OWN origin, never GitHub's API (docs/decisions.md §8.9):
 * a third-party check would tell that party when someone is running this wallet,
 * and would break wherever GitHub is blocked.
 *
 * It also carries the built asset hashes, which is what makes a release
 * independently verifiable (US-7) — rebuild the tag, hash the output, compare.
 *
 * Run AFTER `bun run build`. Deliberately not part of the build itself, so the
 * build stays byte-reproducible (docs/decisions.md §8.6); `globIgnores` keeps
 * this file out of the service worker precache.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const DIST = 'dist'
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))

function git(c) {
  try { return execSync(c, { stdio: ['ignore','pipe','ignore'] }).toString().trim() } catch { return null }
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const commit = process.env.GITHUB_SHA || git('git rev-parse HEAD')
if (!commit) {
  console.error('No commit available; a release manifest must name its source commit (US-7).')
  process.exit(1)
}

const assets = {}
for (const f of walk(DIST).sort()) {
  if (f.endsWith('releases.json')) continue
  assets[f.replace(`${DIST}/`, '')] = createHash('sha256').update(readFileSync(f)).digest('hex')
}

// The bump kind drives how insistently the wallet asks (US-6 / decisions §8):
// major warns hard, minor and patch warn softly. `security` is independent —
// a security fix shipped as a patch is still marked.
const manifest = {
  version: pkg.version,
  commit,
  releasedAt: git('git log -1 --format=%cI') || new Date().toISOString(),
  bump: process.env.RELEASE_BUMP || 'patch',
  security: process.env.RELEASE_SECURITY === 'true',
  notes: `https://github.com/otaviootavio/xrpl-bench/commit/${commit}`,
  verify: 'https://github.com/otaviootavio/xrpl-bench#security',
  assets,
}

writeFileSync(join(DIST, 'releases.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`releases.json: v${manifest.version} @ ${commit.slice(0,7)} (${Object.keys(assets).length} assets hashed)`)
