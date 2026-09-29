import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { queryKeys } from '../query-keys'

/**
 * Account-scoped data is discarded through `invalidateAccountScoped()` only.
 *
 * Four sites that each named their own keys to `invalidateQueries` each
 * discarded a different subset, and a member missing from one site could only
 * be found by comparing all four. This scan fails if any source file outside
 * the factory goes back to naming an account-scoped key at an invalidation.
 *
 * The discard and refetch APIs are all covered — `invalidateQueries`,
 * `refetchQueries`, `resetQueries`, `removeQueries` and `cancelQueries` — since
 * a subset hand-picked through any of them is the same defect. It flags a call
 * whose argument names an account-scoped key, and any file that both makes one
 * of those calls and builds an account-scoped key via `queryKeys.<name>(`.
 *
 * Limits — it is a text scan and cannot see: a builder destructured or aliased
 * out of `queryKeys`; a key built in one module and discarded in another;
 * dynamic `queryKeys[name]` access; or a `)` inside a string in the call's
 * arguments, which ends the argument text early. The general variable-bound
 * gap belongs to story 10.1.
 */

const SRC = join(__dirname, '..', '..', '..')
const FACTORY = join('lib', 'xrpl', 'query-keys.ts')

/** Account-scoped builder names, read off the factory by key shape so this
 * scan cannot drift from it. */
const NETWORK = 'testnet' as const
const ACCOUNT_SCOPED = Object.entries(queryKeys)
  .filter(([, build]) => {
    if (build.length !== 2) return false
    const key = (build as (n: typeof NETWORK, a: string) => readonly unknown[])(NETWORK, 'rProbe')
    return key.length === 3 && key[1] === NETWORK && key[2] === 'rProbe'
  })
  .map(([name]) => name)

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

/** The text between the parentheses of each discard/refetch call. */
function invalidationArguments(text: string): string[] {
  const args: string[] = []
  const re = /\b(?:invalidate|refetch|reset|remove|cancel)Queries\s*\(/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    let depth = 1
    let i = re.lastIndex
    while (i < text.length && depth > 0) {
      if (text[i] === '(') depth++
      else if (text[i] === ')') depth--
      i++
    }
    args.push(text.slice(re.lastIndex, i - 1))
  }
  return args
}

function violations(text: string): string[] {
  const args = invalidationArguments(text)
  if (args.length === 0) return []
  const found: string[] = []
  for (const name of ACCOUNT_SCOPED) {
    const named = new RegExp(`\\b${name}\\b`)
    if (args.some((a) => named.test(a))) found.push(`${name} passed to a discard call`)
    else if (new RegExp(`queryKeys\\.${name}\\s*\\(`).test(text)) found.push(`${name} built beside a discard call`)
  }
  return found
}

describe('account-scoped invalidation sites', () => {
  it('reads the account-scoped builders off the factory', () => {
    expect(ACCOUNT_SCOPED).toEqual(
      expect.arrayContaining(['accountState', 'accountTx', 'incomingPaymentWatch', 'trustLines']),
    )
  })

  it('catches a site that names a key, directly or through a variable', () => {
    expect(violations(`await qc.invalidateQueries({ queryKey: queryKeys.trustLines(n, a) })`)).toEqual([
      'trustLines passed to a discard call',
    ])
    expect(
      violations(`const k = queryKeys.accountTx(n, a)\nawait qc.invalidateQueries({ queryKey: k })`),
    ).toEqual(['accountTx built beside a discard call'])
    for (const api of ['refetchQueries', 'resetQueries', 'removeQueries', 'cancelQueries']) {
      expect(violations(`qc.${api}({ queryKey: queryKeys.accountState(n, a) })`), api).toEqual([
        'accountState passed to a discard call',
      ])
    }
    expect(violations(`await invalidateAccountScoped(qc, n, a)`)).toEqual([])
  })

  it('finds no site outside the factory that passes an account-scoped key', () => {
    const files = sourceFiles(SRC)
    const rel = files.map((f) => relative(SRC, f))
    // Non-vacuous: the four sites that discard account data are in the scan.
    for (const site of [
      join('hooks', 'useAccountLiveUpdates.ts'),
      join('pages', 'tabs', 'SendTab.tsx'),
      join('pages', 'tabs', 'TrustLinesTab.tsx'),
      join('pages', 'tabs', 'BalancesTab.tsx'),
    ]) {
      expect(rel).toContain(site)
      expect(readFileSync(join(SRC, site), 'utf8')).toContain('invalidateAccountScoped(')
    }

    const offenders = files
      .filter((f) => relative(SRC, f) !== FACTORY)
      .flatMap((f) => violations(readFileSync(f, 'utf8')).map((v) => `${relative(SRC, f).split(sep).join('/')}: ${v}`))
    expect(offenders).toEqual([])
  })
})
