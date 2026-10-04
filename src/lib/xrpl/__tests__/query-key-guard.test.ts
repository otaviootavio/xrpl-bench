import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error -- plain .mjs guard script, deliberately untyped so it stays
// runnable by `node` with no build step (same shape as check-contrast.mjs).
import { scanForHandWrittenKeys } from '../../../../scripts/check-query-keys.mjs'

// The guard is what stops this refactor decaying. A guard nobody tests is a
// guard that can silently stop matching, so these assertions exercise it in
// both directions against a fixture tree rather than against src/.
//
// The fixtures below are hand-written key literals by construction — that is
// what they are for — so the source lines holding them carry the guard's own
// `// check-query-keys-allow` directive. Each one suppresses exactly the line
// beneath it, which is why this file can hold counterexamples without the
// whole tree being exempt.

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'query-key-guard-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function write(name: string, contents: string) {
  const full = join(dir, name)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, contents, 'utf8')
  return full
}

describe('the query-key guard', () => {
  it('passes a tree where every key comes from the factory', () => {
    write(
      'hook.ts',
      `import { queryKeys } from '@/lib/xrpl/query-keys'\n` +
        `useQuery({ queryKey: queryKeys.accountState(network, address) })\n`,
    )
    expect(scanForHandWrittenKeys(dir, dir)).toEqual([])
  })

  it('rejects a hand-written key at a read site, naming file and line', () => {
    // check-query-keys-allow
    write('hook.ts', `// leading comment\nuseQuery({ queryKey: ['accountState', network, address] })\n`)
    const found = scanForHandWrittenKeys(dir, dir)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ file: 'hook.ts', line: 2, label: 'queryKey:' })
  })

  it('rejects a hand-written key at each invalidation shape', () => {
    // check-query-keys-allow
    write('a.ts', `queryClient.invalidateQueries(['accountState', n, a])\n`)
    // check-query-keys-allow
    write('b.ts', `queryClient.fetchQuery(['accountState', n, a])\n`)
    // check-query-keys-allow
    write('c.ts', `queryClient.removeQueries(['accountState', n, a])\n`)
    const labels = scanForHandWrittenKeys(dir, dir).map((v: { label: string }) => v.label)
    expect(labels.sort()).toEqual(['fetchQuery(', 'invalidateQueries(', 'removeQueries('])
  })

  it('rejects a key passed positionally to the cache-reading and cache-writing APIs', () => {
    // These take the key as their first argument rather than in an options
    // object, so the `queryKey:` pattern alone never sees them — a literal here
    // would have scanned clean while writing straight into the shared cache.
    // check-query-keys-allow
    write('a.ts', `queryClient.setQueryData(['accountState', n, a], next)\n`)
    // check-query-keys-allow
    write('b.ts', `queryClient.getQueryData(['accountState', n, a])\n`)
    // check-query-keys-allow
    write('c.ts', `queryClient.setQueriesData(['accountState', n, a], next)\n`)
    // check-query-keys-allow
    write('d.ts', `queryClient.getQueriesData(['accountState', n, a])\n`)
    // check-query-keys-allow
    write('e.ts', `queryClient.resetQueries(['accountState', n, a])\n`)
    // check-query-keys-allow
    write('f.ts', `queryClient.cancelQueries(['accountState', n, a])\n`)
    // check-query-keys-allow
    write('g.ts', `queryClient.refetchQueries(['accountState', n, a])\n`)
    // check-query-keys-allow
    write('h.ts', `queryClient.prefetchQuery(['accountState', n, a])\n`)
    // check-query-keys-allow
    write('i.ts', `queryClient.ensureQueryData(['accountState', n, a])\n`)
    // check-query-keys-allow
    write('j.ts', `queryClient.getQueryState(['accountState', n, a])\n`)
    // check-query-keys-allow
    write('k.ts', `queryClient.setQueryDefaults(['accountState'], {})\n`)
    // check-query-keys-allow
    write('l.ts', `queryClient.getQueryDefaults(['accountState'])\n`)
    const labels = scanForHandWrittenKeys(dir, dir).map((v: { label: string }) => v.label)
    expect(labels.sort()).toEqual([
      'cancelQueries(',
      'ensureQueryData(',
      'getQueriesData(',
      'getQueryData(',
      'getQueryDefaults(',
      'getQueryState(',
      'prefetchQuery(',
      'refetchQueries(',
      'resetQueries(',
      'setQueriesData(',
      'setQueryData(',
      'setQueryDefaults(',
    ])
  })

  it('is not defeated by a line break between the token and the literal', () => {
    // A line-by-line matcher misses this, which is exactly how a check like
    // this rots without anyone noticing.
    // check-query-keys-allow
    write('hook.ts', `useQuery({\n  queryKey:\n    ['accountState', network, address],\n})\n`)
    expect(scanForHandWrittenKeys(dir, dir)).toHaveLength(1)
  })

  it('ignores files that are not TypeScript', () => {
    // check-query-keys-allow
    write('notes.md', `queryKey: ['accountState', network, address]\n`)
    expect(scanForHandWrittenKeys(dir, dir)).toEqual([])
  })
})

describe('a key bound to a variable before use (G-19)', () => {
  // Every fixture below binds an array literal and passes the name at a key
  // position. The guard follows the name within the file, so each source line
  // holding a use carries the directive, exactly like the literal fixtures.

  it('rejects the case the story names: bound with const, then invalidated', () => {
    write(
      'a.ts',
      `const k = ['accountState', n, a]\n` +
        // check-query-keys-allow
        `queryClient.invalidateQueries({ queryKey: k })\n`,
    )
    const found = scanForHandWrittenKeys(dir, dir)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ file: 'a.ts', line: 2 })
    expect(found[0].label).toBe('queryKey: k (array bound at line 1)')
  })

  it('rejects a typed or `as const` binding, a reassignment and a parameter default', () => {
    // check-query-keys-allow
    write('a.ts', `const key: QueryKey = ['accountState', n, a] as const\nuseQuery({ queryKey: key })\n`)
    // check-query-keys-allow
    write('b.ts', `let k2\nk2 = ['accountState', n, a]\nqueryClient.fetchQuery(k2)\n`)
    // check-query-keys-allow
    write('c.ts', `function f(k3 = ['accountState']) { return useQuery({ queryKey: k3 }) }\n`)
    const found = scanForHandWrittenKeys(dir, dir)
    expect(found.map((v: { file: string; line: number }) => [v.file, v.line])).toEqual([
      ['a.ts', 2],
      ['b.ts', 3],
      ['c.ts', 1],
    ])
  })

  it('rejects a bound key passed positionally to every key-taking API', () => {
    const apis = [
      'invalidateQueries',
      'fetchQuery',
      'removeQueries',
      'setQueryData',
      'setQueriesData',
      'getQueryData',
      'getQueriesData',
      'resetQueries',
      'cancelQueries',
      'refetchQueries',
      'prefetchQuery',
      'ensureQueryData',
      'getQueryState',
      'setQueryDefaults',
      'getQueryDefaults',
    ]
    // check-query-keys-allow
    write('a.ts', `const k = ['accountState', n, a]\n` + apis.map((api) => `queryClient.${api}(k)\n`).join(''))
    expect(scanForHandWrittenKeys(dir, dir)).toHaveLength(apis.length)
  })

  it('rejects the object shorthand when the bound name is queryKey itself', () => {
    // check-query-keys-allow
    write('a.ts', `const queryKey = ['accountState', n, a]\nuseQuery({ queryKey, enabled: true })\n`)
    const found = scanForHandWrittenKeys(dir, dir)
    expect(found).toHaveLength(1)
    // check-query-keys-allow
    expect(found[0]).toMatchObject({ line: 2, label: '{ queryKey } (array bound at line 1)' })
  })

  it('is not defeated by a line break between the key position and the name', () => {
    // check-query-keys-allow
    write('a.ts', `const k = ['accountState', n, a]\nuseQuery({\n  queryKey:\n    k,\n})\n`)
    expect(scanForHandWrittenKeys(dir, dir)).toHaveLength(1)
  })

  it('passes a name bound to a factory key, a derived value, an unused array and a destructure', () => {
    write(
      'a.ts',
      `const fromFactory = queryKeys.accountState(n, a)\n` +
        `useQuery({ queryKey: fromFactory })\n` +
        `const parts = ['accountState', n, a]\n` +
        `useQuery({ queryKey: parts.slice(0, 1) })\n` +
        `queryClient.fetchQuery(parts[0])\n` +
        `const unused = ['accountState', n, a]\n` +
        `const [first, second] = pair\n` +
        `obj.m = ['x']\n` +
        `useQuery({ queryKey: m })\n` +
        `const same = eq == ['x']\n` +
        `useQuery({ queryKey: eq })\n` +
        `items.map((arrowParam) => ['k', arrowParam])\n` +
        `const fn = arrowParam => ['k', arrowParam]\n` +
        `useQuery({ queryKey: arrowParam })\n` +
        `const kk = queryKeys.trustLines(n, a)\n` +
        `const k1 = ['x']\n` +
        `useQuery({ queryKey: kk })\n`,
    )
    expect(scanForHandWrittenKeys(dir, dir)).toEqual([])
  })

  it('suppresses a bound key only by a directive above the use, and only that one use', () => {
    write(
      'a.ts',
      `// ${'check-query-keys-allow'}\n` +
        `const k = ['accountState', n, a]\n` +
        // check-query-keys-allow
        `useQuery({ queryKey: k })\n` +
        `// ${'check-query-keys-allow'}\n` +
        // check-query-keys-allow
        `queryClient.invalidateQueries({ queryKey: k })\n` +
        `const unrelated = 1\n` +
        // check-query-keys-allow
        `queryClient.removeQueries({ queryKey: k })\n`,
    )
    const found = scanForHandWrittenKeys(dir, dir)
    expect(found.map((v: { line: number }) => v.line)).toEqual([3, 7])
  })
})

describe('the guard’s exemptions', () => {
  it('skips the factory module itself, whose literals are the definitions', () => {
    write(
      join('src', 'lib', 'xrpl', 'query-keys.ts'),
      // check-query-keys-allow
      `export const queryKeys = { accountState: (n, a) => ['accountState', n, a] }\n`,
    )
    expect(scanForHandWrittenKeys(dir, dir)).toEqual([])
  })

  it('exempts a single line via the allow directive on the line above it', () => {
    write(
      'hook.ts',
      `// ${'check-query-keys-allow'}\n` +
        // check-query-keys-allow
        `useQuery({ queryKey: ['accountState', n, a] })\n`,
    )
    expect(scanForHandWrittenKeys(dir, dir)).toEqual([])
  })

  it('exempts only that one line, not the rest of the file', () => {
    // The whole reason the directive replaced a blanket tree exemption: a file
    // may hold one deliberate counterexample without going unpoliced.
    write(
      'hook.ts',
      `// ${'check-query-keys-allow'}\n` +
        // check-query-keys-allow
        `useQuery({ queryKey: ['accountState', n, a] })\n` +
        `const unrelated = 1\n` +
        // check-query-keys-allow
        `useQuery({ queryKey: ['trustLines', n, a] })\n`,
    )
    const found = scanForHandWrittenKeys(dir, dir)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ file: 'hook.ts', line: 4 })
  })

  it('polices a colocated test file, which no tree exemption would have caught', () => {
    // `vitest.config.ts` runs `src/**/*.test.ts`, so a colocated test file is
    // real source under src/ — and the acceptance criterion is that a literal
    // anywhere under src/ fails lint.
    // check-query-keys-allow
    write(join('lib', 'thing.test.ts'), `useQuery({ queryKey: ['accountState', n, a] })\n`)
    const found = scanForHandWrittenKeys(dir, dir)
    expect(found).toHaveLength(1)
    expect(found[0].file.split(sep).join('/')).toBe('lib/thing.test.ts')
  })

  it('polices a __tests__ tree too', () => {
    // check-query-keys-allow
    write(join('lib', '__tests__', 'thing.test.ts'), `useQuery({ queryKey: ['accountState', n, a] })\n`)
    expect(scanForHandWrittenKeys(dir, dir)).toHaveLength(1)
  })
})
