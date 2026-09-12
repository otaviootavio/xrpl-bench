import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error -- plain .mjs guard script, deliberately untyped so it stays
// runnable by `node` with no build step (same shape as check-query-keys.mjs).
import { checkSwRegisterOwnership } from '../../../scripts/check-sw-register.mjs'

/**
 * AD-11's guard is the only thing that fails when `main.tsx` imports
 * `virtual:pwa-register` again — the registry tests use the core factory and
 * the hook test mocks the wiring module away, so all four gates stay green on
 * a relapse. A guard nobody tests is a guard that can silently stop matching,
 * so these run it in both directions against a fixture tree rather than
 * against `src/`.
 */
const OWNER = 'src/lib/sw-register.ts'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sw-register-guard-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function write(name: string, contents: string) {
  const full = join(dir, name)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, contents, 'utf8')
}

function check() {
  return checkSwRegisterOwnership(dir, dir, OWNER)
}

describe('the service-worker registration guard', () => {
  it('passes a tree where only the owner imports the specifier', () => {
    // check-sw-register-allow
    write(OWNER, `import { registerSW } from 'virtual:pwa-register'\nexport const x = registerSW\n`)
    write('src/main.tsx', `import { registerServiceWorker } from '@/lib/sw-register'\nregisterServiceWorker()\n`)

    const result = check()
    expect(result.strays).toEqual([])
    expect(result.ownerImports).toBe(true)
  })

  it('catches the entry point importing the specifier again — the actual regression', () => {
    // check-sw-register-allow
    write(OWNER, `import { registerSW } from 'virtual:pwa-register'\nexport const x = registerSW\n`)
    // check-sw-register-allow
    write('src/main.tsx', `import { registerSW } from 'virtual:pwa-register'\nregisterSW({ immediate: true })\n`)

    const result = check()
    expect(result.strays).toEqual([{ file: 'src/main.tsx', line: 1 }])
  })

  it('catches a dynamic import and a re-export from anywhere else', () => {
    // check-sw-register-allow
    write(OWNER, `import { registerSW } from 'virtual:pwa-register'\nexport const x = registerSW\n`)
    // check-sw-register-allow
    write('src/hooks/useAppUpdate.ts', `const m = await import('virtual:pwa-register')\nexport const y = m\n`)
    // check-sw-register-allow
    write('src/lib/other.ts', `export { registerSW } from 'virtual:pwa-register'\n`)

    expect(check().strays.map((s: { file: string }) => s.file)).toEqual([
      'src/hooks/useAppUpdate.ts',
      'src/lib/other.ts',
    ])
  })

  it('is not fooled by a line break between the keyword and the module string', () => {
    // check-sw-register-allow
    write(OWNER, `import { registerSW } from 'virtual:pwa-register'\nexport const x = registerSW\n`)
    // check-sw-register-allow
    write('src/main.tsx', `import { registerSW } from\n  'virtual:pwa-register'\n`)

    expect(check().strays).toHaveLength(1)
  })

  it('ignores the specifier named in prose, which several docstrings do', () => {
    // check-sw-register-allow
    write(OWNER, `import { registerSW } from 'virtual:pwa-register'\nexport const x = registerSW\n`)
    write('src/lib/sw-register-core.ts', '/** `virtual:pwa-register` only resolves under Vite. */\nexport const x = 1\n')

    expect(check().strays).toEqual([])
  })

  it('honours a per-line allow directive, which is how this file holds fixtures at all', () => {
    // check-sw-register-allow
    write(OWNER, `import { registerSW } from 'virtual:pwa-register'\nexport const x = registerSW\n`)
    write(
      'src/lib/deliberate.ts',
      // check-sw-register-allow
      `// check-sw-register-allow\nimport { registerSW } from 'virtual:pwa-register'\nexport const y = registerSW\n`,
    )

    expect(check().strays).toEqual([])
  })

  it('reports the owner having stopped importing it, rather than passing silently', () => {
    write('src/main.tsx', `import { registerServiceWorker } from '@/lib/sw-register'\nregisterServiceWorker()\n`)

    const result = check()
    expect(result.strays).toEqual([])
    expect(result.ownerImports).toBe(false)
  })
})
