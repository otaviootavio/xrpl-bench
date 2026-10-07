import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  accountScopedBuilderNames,
  checkAccountInvalidation,
  failuresOf,
  violationsIn,
  // @ts-expect-error -- plain .mjs guard script, deliberately untyped so it
  // stays runnable by `node` with no build step (same shape as check-query-keys.mjs).
} from '../../../../scripts/check-account-invalidation.mjs'
import { queryKeys } from '../query-keys'
import packageJson from '../../../../package.json'

/**
 * Story 5.5's one-path rule, as the lint gate `scripts/check-account-
 * invalidation.mjs` enforces it (epic 5 retro item 9 moved it out of a vitest
 * scan). A guard nobody tests is a guard that can silently stop matching, so
 * these run it in both directions against fixture trees, hold its parse of the
 * factory to the factory's runtime keys, and check `lint` still runs it.
 */

const REPO = join(__dirname, '..', '..', '..', '..')
const FACTORY = 'src/lib/xrpl/query-keys.ts'

/** Account-scoped builder names, read off the RUNTIME factory by key shape —
 * arity 2, `[name, network, address]` — independently of the script's text
 * parse, so the two can be compared. */
const NETWORK = 'testnet' as const
const RUNTIME_ACCOUNT_SCOPED = Object.entries(queryKeys)
  .filter(([, build]) => {
    if (build.length !== 2) return false
    const key = (build as (n: typeof NETWORK, a: string) => readonly unknown[])(NETWORK, 'rProbe')
    return key.length === 3 && key[1] === NETWORK && key[2] === 'rProbe'
  })
  .map(([name]) => name)

/** A minimal factory in the real one's shape. */
const FIXTURE_FACTORY = `
const accountScoped = {
  accountState: (network: NetworkId, address: string | null) =>
    ['accountState', network, address] as const,

  trustLines: (network: NetworkId, address: string | null) =>
    ['trustLines', network, address] as const,
} satisfies Record<string, AccountScopedKeyBuilder>

export async function invalidateAccountScoped(client, network, address) {
  await Promise.all(Object.values(accountScoped).map((b) => client.invalidateQueries({ queryKey: b(network, address) })))
}
`

const ONE_PATH_CALLER = `await invalidateAccountScoped(queryClient, network, address)\n`

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'account-invalidation-guard-'))
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
  return checkAccountInvalidation(join(dir, 'src'), dir, FACTORY)
}

describe('the account-invalidation guard reads the factory', () => {
  it("parses exactly the factory's account-scoped builders — the text and the runtime agree", () => {
    const parsed = accountScopedBuilderNames(readFileSync(join(REPO, FACTORY), 'utf8'))
    expect(parsed).not.toBeNull()
    expect([...parsed].sort()).toEqual([...RUNTIME_ACCOUNT_SCOPED].sort())
    // Non-vacuous: at least the four members story 5.5 named.
    expect(parsed).toEqual(expect.arrayContaining(['accountState', 'accountTx', 'incomingPaymentWatch', 'trustLines']))
  })

  it('reports a factory with no accountScoped table as null, so the script can fail on it', () => {
    write(FACTORY, `export const queryKeys = { accountState: (n, a) => ['accountState', n, a] }\n`)
    write('src/pages/A.tsx', ONE_PATH_CALLER)
    expect(check().builders).toBeNull()
  })

  it('reports an empty table as no builders', () => {
    write(FACTORY, `const accountScoped = {\n} satisfies Record<string, AccountScopedKeyBuilder>\n`)
    expect(check().builders).toEqual([])
  })
})

describe('the account-invalidation guard scans the tree', () => {
  it('passes a tree where every site takes the one path', () => {
    write(FACTORY, FIXTURE_FACTORY)
    write('src/pages/tabs/SendTab.tsx', ONE_PATH_CALLER)
    write('src/hooks/useLive.ts', ONE_PATH_CALLER)
    const result = check()
    expect(result.builders).toEqual(['accountState', 'trustLines'])
    expect(result.violations).toEqual([])
    expect(result.callers).toEqual(['src/hooks/useLive.ts', 'src/pages/tabs/SendTab.tsx'])
  })

  it('does not count the factory itself, which is where the group is discarded', () => {
    write(FACTORY, FIXTURE_FACTORY)
    expect(check()).toMatchObject({ violations: [], callers: [] })
  })

  it('catches a site that names a key to a discard call, with file and line', () => {
    write(FACTORY, FIXTURE_FACTORY)
    write('src/pages/tabs/TrustLinesTab.tsx', `// leading\nawait qc.invalidateQueries({ queryKey: queryKeys.trustLines(n, a) })\n`)
    expect(check().violations).toEqual([
      { file: 'src/pages/tabs/TrustLinesTab.tsx', line: 2, builder: 'trustLines', kind: 'passed to a discard call' },
    ])
  })

  it('catches a key bound to a variable first and discarded beside it', () => {
    write(FACTORY, FIXTURE_FACTORY)
    write('src/pages/B.tsx', `const k = queryKeys.accountState(n, a)\n\nawait qc.invalidateQueries({ queryKey: k })\n`)
    expect(check().violations).toEqual([
      { file: 'src/pages/B.tsx', line: 1, builder: 'accountState', kind: 'built beside a discard call' },
    ])
  })

  it.each(['refetchQueries', 'resetQueries', 'removeQueries', 'cancelQueries'])('covers %s', (api) => {
    expect(violationsIn(`qc.${api}({ queryKey: queryKeys.accountState(n, a) })`, ['accountState'])).toEqual([
      { line: 1, builder: 'accountState', kind: 'passed to a discard call' },
    ])
  })

  it('is not fooled by a line break inside the call', () => {
    expect(
      violationsIn(`qc.invalidateQueries(\n  {\n    queryKey: queryKeys.trustLines(n, a),\n  },\n)`, ['trustLines']),
    ).toHaveLength(1)
  })

  it('leaves a non-account key alone — the destination check has its own helper', () => {
    write(FACTORY, FIXTURE_FACTORY)
    write('src/pages/C.tsx', `await qc.invalidateQueries({ queryKey: queryKeys.destinationInfo(n, d, 'XRP') })\n`)
    expect(check().violations).toEqual([])
  })

  it('skips test files and __tests__ directories', () => {
    write(FACTORY, FIXTURE_FACTORY)
    const offending = `qc.invalidateQueries({ queryKey: queryKeys.accountState(n, a) })\n`
    write('src/lib/__tests__/x.ts', offending)
    write('src/lib/y.test.ts', offending)
    write('src/lib/z.test.tsx', offending)
    expect(check().violations).toEqual([])
  })

  it('honours the allow directive for the next line only', () => {
    write(FACTORY, FIXTURE_FACTORY)
    write(
      'src/pages/D.tsx',
      `// check-account-invalidation-allow\nqc.invalidateQueries({ queryKey: queryKeys.accountState(n, a) })\n` +
        `qc.invalidateQueries({ queryKey: queryKeys.trustLines(n, a) })\n`,
    )
    expect(check().violations).toEqual([
      { file: 'src/pages/D.tsx', line: 3, builder: 'trustLines', kind: 'passed to a discard call' },
    ])
  })

  it('does not let an allowed call mask a variable-bound key of the same builder', () => {
    expect(
      violationsIn(
        `// check-account-invalidation-allow\nqc.invalidateQueries({ queryKey: queryKeys.accountState(n, a) })\n` +
          `const k = queryKeys.accountState(n, b)\nqc.invalidateQueries({ queryKey: k })\n`,
        ['accountState'],
      ),
    ).toEqual([{ line: 3, builder: 'accountState', kind: 'built beside a discard call' }])
  })

  it('does not flag the key inside an allowed call that spans several lines', () => {
    expect(
      violationsIn(
        `// check-account-invalidation-allow\nqc.invalidateQueries({\n  queryKey: queryKeys.accountState(n, a),\n})\n`,
        ['accountState'],
      ),
    ).toEqual([])
  })
})

describe('the account-invalidation guard fails the gate on each reason', () => {
  it('fails on a missing table, a violation, and a path nobody takes — and passes otherwise', () => {
    write(FACTORY, `export const queryKeys = {}\n`)
    write('src/pages/A.tsx', ONE_PATH_CALLER)
    expect(failuresOf(check())).toEqual(['no-builders'])

    write(FACTORY, `const accountScoped = {\n} satisfies Record<string, AccountScopedKeyBuilder>\n`)
    expect(failuresOf(check())).toEqual(['no-builders'])

    write(FACTORY, FIXTURE_FACTORY)
    expect(failuresOf(check())).toEqual([])

    write('src/pages/B.tsx', `qc.invalidateQueries({ queryKey: queryKeys.accountState(n, a) })\n`)
    expect(failuresOf(check())).toEqual(['violations'])

    rmSync(join(dir, 'src/pages/A.tsx'))
    expect(failuresOf(check())).toEqual(['violations', 'no-callers'])
  })

  it('exits 0 as a script on the real tree, and says what it checked', () => {
    const out = execFileSync(process.execPath, [join(REPO, 'scripts', 'check-account-invalidation.mjs')], {
      encoding: 'utf8',
    })
    expect(out).toMatch(/check-account-invalidation: \d+ account-scoped builders/)
  })
})

describe('the account-invalidation guard on the real tree', () => {
  it('finds no violation, and the four sites that discard account data take the one path', () => {
    const result = checkAccountInvalidation()
    expect(result.violations).toEqual([])
    expect(result.callers).toEqual(
      expect.arrayContaining([
        'src/hooks/useAccountLiveUpdates.ts',
        'src/pages/tabs/SendTab.tsx',
        'src/pages/tabs/TrustLinesTab.tsx',
        'src/pages/tabs/BalancesTab.tsx',
      ]),
    )
  })

  it('is run by `bun run lint`', () => {
    expect(packageJson.scripts.lint).toContain('node scripts/check-account-invalidation.mjs')
  })
})
