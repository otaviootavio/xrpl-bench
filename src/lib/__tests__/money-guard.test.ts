import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error -- plain .mjs guard script, deliberately untyped so it stays
// runnable by `node` with no build step (same shape as check-query-keys.mjs).
import { scanForMoneyArithmetic } from '../../../scripts/check-money.mjs'

/**
 * AD-7's guard is the only thing that fails when BigInt arithmetic comes back
 * into a hook, a page or a component — lint, build, tests and the contrast gate
 * all stay green on that relapse (G-27). A guard nobody has seen fail is not
 * known to work, so these run it in both directions against a fixture tree.
 *
 * This file lives under `src/lib`, which the money guard does not scan, so its
 * fixture strings need no directive.
 */
const TREES = ['src/hooks', 'src/pages', 'src/components']

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'money-guard-'))
  for (const tree of TREES) mkdirSync(join(dir, tree), { recursive: true })
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function write(name: string, contents: string) {
  const full = join(dir, name)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, contents, 'utf8')
}

const scan = () => scanForMoneyArithmetic(dir, TREES)

describe('the money-arithmetic guard', () => {
  it('passes a tree that calls the money module and never makes a bigint', () => {
    write(
      'src/pages/Send.tsx',
      `import { dropsToXrpString } from '@/lib/xrpl/money'\n` +
        `// Balances are DECIMAL strings — never BigInt them.\n` +
        `const shown = dropsToXrpString(balance)\n` +
        `function isBig(v: unknown): v is bigint { return typeof v === 'bigint' }\n` +
        `const id = x1n + abc.0\n`,
    )
    expect(scan()).toEqual([])
  })

  it('rejects a BigInt call in each of the three trees, naming file and line', () => {
    write('src/hooks/useSpendable.ts', `const a = 1\nconst spendable = BigInt(balance) - BigInt(reserve)\n`)
    write('src/pages/tabs/SendTab.tsx', `const fits = BigInt (amount) <= max\n`)
    write('src/components/wallet/Readout.tsx', `const n = BigInt(x)\n`)
    const found = scan()
    expect(found.map((v: { file: string; line: number; label: string }) => [v.file, v.line, v.label])).toEqual([
      ['src/components/wallet/Readout.tsx', 1, 'BigInt('],
      ['src/hooks/useSpendable.ts', 2, 'BigInt('],
      ['src/hooks/useSpendable.ts', 2, 'BigInt('],
      ['src/pages/tabs/SendTab.tsx', 1, 'BigInt('],
    ])
  })

  it('rejects a BigInt static and every form of bigint literal', () => {
    write(
      'src/hooks/a.ts',
      `const w = BigInt.asUintN(64, v)\n` +
        `const zero = 0n\n` +
        `const million = 1_000_000n\n` +
        `const hex = 0x1fn\n` +
        `const oct = 0o17n\n` +
        `const bin = 0b101n\n`,
    )
    expect(scan().map((v: { line: number; label: string }) => [v.line, v.label])).toEqual([
      [1, 'BigInt.'],
      [2, 'bigint literal'],
      [3, 'bigint literal'],
      [4, 'bigint literal'],
      [5, 'bigint literal'],
      [6, 'bigint literal'],
    ])
  })

  it('is not defeated by a line break between BigInt and its call', () => {
    write('src/components/a.tsx', `const n = BigInt\n  (x)\n`)
    expect(scan()).toHaveLength(1)
  })

  it('polices test files inside the scanned trees', () => {
    write('src/pages/__tests__/send.test.tsx', `expect(BigInt(shown)).toBe(10n)\n`)
    expect(scan()).toHaveLength(2)
  })

  it('does not scan outside the three trees, so the money module and lib stay free', () => {
    write('src/lib/xrpl/money.ts', `export const whole = BigInt(drops) / 1_000_000n\n`)
    write('src/store/app-store.ts', `const n = BigInt(x)\n`)
    expect(scan()).toEqual([])
  })

  it('fails closed when a scanned tree is missing rather than passing an empty scan', () => {
    rmSync(join(dir, 'src/hooks'), { recursive: true, force: true })
    expect(() => scan()).toThrow()
  })

  it('ignores files that are not TypeScript', () => {
    write('src/pages/notes.md', `BigInt(x) + 1n\n`)
    expect(scan()).toEqual([])
  })
})

describe('the money guard’s directive', () => {
  it('suppresses exactly the next line and nothing else', () => {
    write(
      'src/hooks/a.ts',
      `// ${'check-money-allow'}\n` +
        `const deliberate = BigInt(x)\n` +
        `const unrelated = 1\n` +
        `const caught = BigInt(y)\n`,
    )
    const found = scan()
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ file: 'src/hooks/a.ts', line: 4 })
  })

  it('does not suppress a violation two lines below it', () => {
    write('src/hooks/a.ts', `// ${'check-money-allow'}\nconst blank = 1\nconst caught = 0n\n`)
    expect(scan()).toHaveLength(1)
  })
})
