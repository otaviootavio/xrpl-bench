import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error -- plain .mjs guard script, deliberately untyped so it stays
// runnable by `node` with no build step (same shape as check-query-keys.mjs).
import { scanForExplorerLinks } from '../../../scripts/check-explorer-links.mjs'

/**
 * AD-10's guard is the only thing that fails when a hand-rolled explorer anchor
 * returns outside AddressLink / TxLink — every other gate stays green on that
 * relapse (G-27). A guard nobody has seen fail is not known to work, so these
 * run it in both directions against a fixture tree.
 *
 * The explorer guard scans test files for hosts, so every source line below
 * that spells an explorer host carries the guard's own directive.
 */
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'explorer-link-guard-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function write(name: string, contents: string) {
  const full = join(dir, name)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, contents, 'utf8')
}

const scan = () => scanForExplorerLinks(dir, dir)
const summary = () =>
  scan().map((v: { file: string; line: number; label: string }) => [v.file, v.line, v.label])

describe('the explorer-link guard', () => {
  it('passes a tree that links only through the shared components', () => {
    write(
      'src/components/wallet/AddressDisplay.tsx',
      `import { AddressLink } from './AddressLink'\n` +
        `export const X = () => <AddressLink address={a} iconOnly label="View account on block explorer" />\n` +
        `const docs = 'https://xrpl.org/docs/concepts/accounts'\n`,
    )
    expect(scan()).toEqual([])
  })

  it('rejects a hand-rolled anchor to an explorer host, naming file and line', () => {
    write(
      'src/pages/tabs/HistoryTab.tsx',
      // check-explorer-links-allow
      `const a = 1\n<a href="https://livenet.xrpl.org/accounts/rEXAMPLE">view</a>\n`,
    )
    expect(summary()).toEqual([['src/pages/tabs/HistoryTab.tsx', 2, 'explorer host']])
  })

  it('rejects every listed host, inside a template literal too', () => {
    // check-explorer-links-allow
    write('src/a.tsx', '<a href={`https://testnet.xrpl.org/transactions/${h}`}>tx</a>\n')
    // check-explorer-links-allow
    write('src/b.ts', `const u = 'https://devnet.xrpl.org/accounts/' + a\n`)
    // check-explorer-links-allow
    write('src/c.ts', `const u = 'https://xrpscan.com/account/' + a\n`)
    // check-explorer-links-allow
    write('src/d.ts', `const u = 'https://bithomp.com/explorer/' + a\n`)
    expect(scan().map((v: { file: string }) => v.file)).toEqual(['src/a.tsx', 'src/b.ts', 'src/c.ts', 'src/d.ts'])
  })

  it('rejects the URL builder used in a hand-written anchor outside the shared components', () => {
    write(
      'src/components/wallet/AddressDisplay.tsx',
      `import { accountExplorerUrl } from '@/lib/xrpl/networks'\n` +
        `<a href={accountExplorerUrl(network, address)}>view</a>\n`,
    )
    expect(summary()).toEqual([
      ['src/components/wallet/AddressDisplay.tsx', 1, 'explorer URL builder'],
      ['src/components/wallet/AddressDisplay.tsx', 2, 'explorer URL builder'],
    ])
  })

  it('rejects the builder reached through a variable, and the base URL field', () => {
    write('src/pages/a.tsx', `const u = txExplorerUrl(n, h)\nreturn <a href={u}>tx</a>\n`)
    write('src/pages/b.tsx', `const u = NETWORKS[n].explorerBaseUrl + '/accounts/' + a\n`)
    expect(summary()).toEqual([
      ['src/pages/a.tsx', 1, 'explorer URL builder'],
      ['src/pages/b.tsx', 1, 'explorer URL builder'],
    ])
  })

  it('exempts the shared components and the builder’s own module', () => {
    write(
      'src/components/wallet/AddressLink.tsx',
      `<a href={accountExplorerUrl(network, address)}>view</a>\n<TruncatedExplorerLink href={txExplorerUrl(network, hash)} />\n`,
    )
    write(
      'src/lib/xrpl/networks.ts',
      // check-explorer-links-allow
      `explorerBaseUrl: 'https://livenet.xrpl.org',\nexport function txExplorerUrl() {}\n`,
    )
    expect(scan()).toEqual([])
  })

  it('lets a test name the builder to assert a shared component’s href', () => {
    write(
      'src/components/wallet/__tests__/address-link.test.tsx',
      `import { accountExplorerUrl } from '@/lib/xrpl/networks'\nexpect(href).toBe(accountExplorerUrl(id, ADDRESS))\n`,
    )
    write('src/lib/thing.test.ts', `expect(txExplorerUrl(n, h)).toContain(h)\n`)
    expect(scan()).toEqual([])
  })

  it('still rejects an explorer host spelled in a test file', () => {
    // check-explorer-links-allow
    write('src/lib/__tests__/thing.test.ts', `expect(href).toBe('https://testnet.xrpl.org/accounts/r1')\n`)
    expect(summary()).toEqual([['src/lib/__tests__/thing.test.ts', 1, 'explorer host']])
  })

  it('ignores files that are not TypeScript', () => {
    // check-explorer-links-allow
    write('src/notes.md', `https://livenet.xrpl.org/accounts/r1\n`)
    expect(scan()).toEqual([])
  })
})

describe('the explorer guard’s directive', () => {
  it('suppresses exactly the next line and nothing else', () => {
    write(
      'src/pages/a.tsx',
      `// ${'check-explorer-links-allow'}\n` +
        `const deliberate = txExplorerUrl(n, h)\n` +
        `const unrelated = 1\n` +
        `const caught = accountExplorerUrl(n, a)\n`,
    )
    expect(summary()).toEqual([['src/pages/a.tsx', 4, 'explorer URL builder']])
  })
})
