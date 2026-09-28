import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error -- plain .mjs guard script, deliberately untyped so it stays
// runnable by `node` with no build step (same shape as check-query-keys.mjs).
import { findUpwardImports } from '../../../scripts/check-layering.mjs'

/**
 * AD-1's guard is the only thing that fails when a `lib` or `store` module
 * imports from `components` again. Lint, build, tests and the contrast scan
 * were all green for as long as `lib/notify.tsx` imported `NOTICE_TONE` from
 * `components/ui/alert.tsx`, so a guard is the whole mechanism here — and a
 * guard nobody tests is a guard that can silently stop matching.
 */
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'layering-guard-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function write(name: string, contents: string) {
  const full = join(dir, name)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, contents, 'utf8')
}

const check = () => findUpwardImports(dir, dir)

describe('the layering guard', () => {
  it('passes a tree where lib and store only reach sideways and down', () => {
    write('src/lib/notify.tsx', `import { type NoticeTone } from '@/lib/notice-tone'\nexport const x = 1\n`)
    write('src/store/notice-store.ts', `import type { NoticeTone } from '@/lib/notice-tone'\nexport const y = 1\n`)
    write('src/components/ui/alert.tsx', `import { NOTICE_TONE } from '@/lib/notice-tone'\nexport const z = 1\n`)

    expect(check()).toEqual([])
  })

  it('catches the exact regression: lib importing the tone map back out of a component', () => {
    // check-layering-allow
    write('src/lib/notify.tsx', `import { type NoticeTone } from '@/components/ui/alert'\nexport const x = 1\n`)

    expect(check()).toEqual([{ file: 'src/lib/notify.tsx', line: 1 }])
  })

  it('catches a type-only import, which adds no runtime edge but the same coupling', () => {
    // check-layering-allow
    write('src/store/notice-store.ts', `import type { NoticeTone } from '@/components/ui/alert'\nexport const y = 1\n`)

    expect(check()).toEqual([{ file: 'src/store/notice-store.ts', line: 1 }])
  })

  it('catches a relative path that climbs out of lib, and an import from pages', () => {
    // check-layering-allow
    write('src/lib/xrpl/reads.ts', `import { Thing } from '../../components/ui/alert'\nexport const a = Thing\n`)
    // check-layering-allow
    write('src/store/app-store.ts', `const m = await import('@/pages/MainPage')\nexport const b = m\n`)

    expect(check().map((s: { file: string }) => s.file)).toEqual(['src/lib/xrpl/reads.ts', 'src/store/app-store.ts'])
  })

  it('is not fooled by a line break between the keyword and the module string', () => {
    // check-layering-allow
    write('src/lib/notify.tsx', `import { type NoticeTone } from\n  '@/components/ui/alert'\n`)

    expect(check()).toHaveLength(1)
  })

  it('leaves the upper layers alone — components importing lib is the permitted direction', () => {
    write('src/components/Annunciator.tsx', `import { NOTICE_TONE } from '@/lib/notice-tone'\nexport const z = 1\n`)
    // check-layering-allow
    write('src/hooks/useAppUpdate.ts', `import { Button } from '@/components/ui/button'\nexport const h = Button\n`)
    // check-layering-allow
    write('src/pages/tabs/HistoryTab.tsx', `import { Card } from '@/components/ui/card'\nexport const p = Card\n`)

    expect(check()).toEqual([])
  })

  it('ignores the path named in prose, which several docstrings do', () => {
    write('src/lib/notice-tone.ts', '/** Painted by `@/components/ui/alert.tsx` and the Annunciator. */\nexport const x = 1\n')

    expect(check()).toEqual([])
  })

  it('honours a per-line allow directive, which is how this file holds fixtures at all', () => {
    write(
      'src/lib/deliberate.ts',
      // check-layering-allow
      `// check-layering-allow\nimport { X } from '@/components/ui/alert'\nexport const y = X\n`,
    )

    expect(check()).toEqual([])
  })
})
