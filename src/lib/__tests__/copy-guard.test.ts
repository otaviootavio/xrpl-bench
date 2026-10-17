import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * No screen, string or doc may say a key "cannot be exported". The wallet reveals
 * a Seed behind its checks (FR-69); a claim that nothing can be exported is false
 * and, on a wallet that holds real funds, misleading. This scan fails if the
 * wording returns anywhere user-visible or in the repo's own docs.
 */
const ROOT = join(__dirname, '..', '..', '..')
const BANNED = /\b(?:can(?:no|')?t|can not|never|not|won'?t|will not)\s+(?:be\s+)?(?:exported|extracted)\b|\bnon-?exportable\b|\bunexportable\b/i
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '__tests__', '_bmad-output', '.impeccable'])

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, exts, out)
    else if (exts.some((e) => name.endsWith(e))) out.push(full)
  }
  return out
}

describe('copy guard: a key is never described as unexportable', () => {
  const files = [
    ...walk(join(ROOT, 'src'), ['.ts', '.tsx']),
    ...walk(join(ROOT, 'docs'), ['.md']),
    ...['README.md', 'PRODUCT.md', 'DESIGN.md', 'CLAUDE.md'].map((f) => join(ROOT, f)).filter((f) => statSync(f, { throwIfNoEntry: false })),
  ]

  it('scans something', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('matches the wording it is meant to ban', () => {
    for (const bad of ['the key cannot be exported', "keys can't be exported", 'a non-exportable key', 'it will not be extracted']) {
      expect(BANNED.test(bad)).toBe(true)
    }
    expect(BANNED.test('Your seed can be exported only after the check')).toBe(false)
  })

  it('finds none in the app or its docs', () => {
    const hits = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((text, i) => ({ file: relative(ROOT, file), line: i + 1, text }))
        .filter((l) => BANNED.test(l.text)),
    )
    expect(hits).toEqual([])
  })
})
