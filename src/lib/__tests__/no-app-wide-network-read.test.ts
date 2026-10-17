import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Story 2 / AD-19: the app-wide `network` survives only as a migration input
 * and a rollback mirror. No module outside the store may read it for a ledger
 * read — the active Wallet's network (`useActiveNetwork`) is the only source.
 * The two sanctioned reads are named here so an addition is a visible edit.
 */
const SRC = join(__dirname, '..', '..')
const ALLOWED = new Set(['store/app-store.ts', 'App.tsx'])

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : walk(p)
    return /\.(ts|tsx)$/.test(n) ? [p] : []
  })
}

/** Selector of any shape (`s => s.network`, `(state) => state.network`), a
 * destructure off the hook or `getState()`, a property read off `getState()`,
 * and the removed setter. */
const READS = [
  /useAppStore\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.network\b/,
  /\{[^}]*\bnetwork\b[^}]*\}\s*=\s*useAppStore(\.getState)?\(\s*\)/,
  /getState\(\)\.network\b/,
  /\bsetNetwork\b/,
]

describe('no module outside the store reads the app-wide network', () => {
  it('the patterns catch the shapes a plain `s.network` regex missed', () => {
    for (const bypass of [
      'useAppStore((s) => s.network)',
      'useAppStore(s => s.network)',
      'useAppStore((state) => state.network)',
      'const { network } = useAppStore()',
      'const { wallets, network } = useAppStore.getState()',
      'useAppStore.getState().network',
      'setNetwork(x)',
    ]) {
      expect(READS.some((re) => re.test(bypass)), bypass).toBe(true)
    }
    expect(READS.some((re) => re.test('useAppStore((s) => s.wallets)'))).toBe(false)
  })

  it('finds none', () => {
    const offenders = walk(SRC)
      .map((p) => p.slice(SRC.length + 1))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => READS.some((re) => re.test(readFileSync(join(SRC, rel), 'utf8'))))
    expect(offenders).toEqual([])
  })

  it('App.tsx reads it only as the legacy fallback for listWallets and the migration input', () => {
    const src = readFileSync(join(SRC, 'App.tsx'), 'utf8')
    const reads = src.split('\n').filter((l) => /\.network\b|\bnetwork\b.*getState/.test(l))
    expect(reads.length).toBeGreaterThan(0)
    for (const l of reads) expect(l).toMatch(/listWallets|const \{ network, autoLockMinutes \}/)
  })
})
