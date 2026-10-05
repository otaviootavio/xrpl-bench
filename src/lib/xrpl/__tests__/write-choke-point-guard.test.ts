import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error -- plain .mjs guard script, deliberately untyped so it stays
// runnable by `node` with no build step (same shape as check-explorer-links.mjs).
import { scanForWritesOutsideChokePoint } from '../../../../scripts/check-write-choke-point.mjs'
import packageJson from '../../../../package.json'

const REPO = join(__dirname, '..', '..', '..', '..')

/**
 * AD-9's guard is the only thing that fails when a write bypasses
 * `submitAndClassify` — and with it the in-flight signal and the fee cap.
 * Every other gate stays green on that relapse (epic 7 retro F8). A guard
 * nobody has seen fail is not known to work, so these run it in both
 * directions against a fixture tree.
 */
let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'write-choke-point-guard-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function write(name: string, contents: string) {
  const full = join(dir, name)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, contents, 'utf8')
}

const scan = () => scanForWritesOutsideChokePoint(dir, dir)
const summary = () => scan().map((v: { file: string; line: number; label: string }) => [v.file, v.line, v.label])

describe('the write choke-point guard', () => {
  it('passes a tree whose only writes are in writes.ts, and whose prose merely names the methods', () => {
    write(
      'src/lib/xrpl/writes.ts',
      `const prepared = await client.autofill(tx)\n` +
        `const signed = wallet.sign(prepared)\n` +
        `await client.submitAndWait(signed.tx_blob)\n` +
        `await client.submit(signed.tx_blob)\n` +
        `await client.request({ command: 'submit', tx_blob })\n`,
    )
    write(
      'src/pages/tabs/SendTab.tsx',
      `import { submitXrpPayment } from '@/lib/xrpl/writes'\n` +
        `// autofill computes the fee when none is pinned, then submitAndWait polls\n` +
        `const n = Math.sign(delta)\n` +
        `const aborted = controller.signal.aborted\n` +
        `const fee = behaviour.autofillFee ?? client.submitted.length\n` +
        `<button type="submit" onSubmit={handleSubmit}>Send</button>\n`,
    )
    expect(scan()).toEqual([])
  })

  it('rejects a direct submitAndWait outside writes.ts, naming file and line', () => {
    write('src/pages/tabs/SendTab.tsx', `const a = 1\nconst res = await client.submitAndWait(blob)\n`)
    expect(summary()).toEqual([['src/pages/tabs/SendTab.tsx', 2, 'SDK write method']])
  })

  it('rejects each of autofill, sign, submit and submitAndWait, by dot, optional chain and string key', () => {
    write('src/a.ts', `const p = await client.autofill(tx)\n`)
    write('src/b.ts', `const s = wallet?.sign(p)\n`)
    write('src/c.ts', `await client . submit(s.tx_blob)\n`)
    write('src/d.ts', `await client['submitAndWait'](s.tx_blob)\n`)
    write('src/e.ts', 'const send = client[`submit`]\n')
    write('src/f.tsx', `const send = client.submitAndWait\n`)
    expect(scan().map((v: { file: string }) => v.file)).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts',
      'src/d.ts',
      'src/e.ts',
      'src/f.tsx',
    ])
  })

  it('rejects a raw RPC submit or sign that skips the xrpl.js helpers', () => {
    write(
      'src/hooks/useRawSend.ts',
      `await client.request({ command: 'submit', tx_blob: blob })\n` +
        `await client.request({ command: "submit_multisigned", tx_json })\n` +
        `await client.request({ command: 'sign', tx_json, secret })\n` +
        `await client.request({ command: 'sign_for', tx_json })\n` +
        `await client.request({ command: 'channel_authorize', channel_id, secret })\n` +
        `await client.request({ 'command': 'submit', tx_blob: blob })\n` +
        `socket.send(JSON.stringify({ "command": "submit", tx_blob }))\n`,
    )
    expect(summary()).toEqual([1, 2, 3, 4, 5, 6, 7].map((line) => ['src/hooks/useRawSend.ts', line, 'raw RPC write']))
  })

  it('does not flag read commands that merely contain a write word', () => {
    write('src/lib/xrpl/reads.ts', `await client.request({ command: 'account_tx', account })\nconst c = { command: 'submitter' }\n`)
    expect(scan()).toEqual([])
  })

  it('exempts only writes.ts itself, not a sibling or a look-alike path', () => {
    write('src/lib/xrpl/writes.ts', `await client.submitAndWait(blob)\n`)
    write('src/lib/xrpl/writes2.ts', `await client.submitAndWait(blob)\n`)
    write('src/other/lib/xrpl/writes.ts', `await client.submitAndWait(blob)\n`)
    expect(scan().map((v: { file: string }) => v.file)).toEqual(['src/lib/xrpl/writes2.ts', 'src/other/lib/xrpl/writes.ts'])
  })

  it('skips test files, whose fakes must define and call these names', () => {
    write('src/lib/xrpl/__tests__/fake.ts', `if (behaviour.submit) return behaviour.submit()\n`)
    write('src/pages/send.test.tsx', `await client.submitAndWait(blob)\n`)
    expect(scan()).toEqual([])
  })

  it('lets the directive opt out the next line only', () => {
    write(
      'src/components/Form.tsx',
      `// check-write-choke-point-allow\n` + `form.submit()\n` + `form.submit()\n`,
    )
    expect(summary()).toEqual([['src/components/Form.tsx', 3, 'SDK write method']])
  })

  it('ignores the directive trailing a code line, where it would exempt the next line by accident', () => {
    write(
      'src/pages/Send.tsx',
      `const x = 1 // check-write-choke-point-allow\n` + `await client.submitAndWait(blob)\n`,
    )
    expect(summary()).toEqual([['src/pages/Send.tsx', 2, 'SDK write method']])
  })

  it('passes the real tree', () => {
    expect(scanForWritesOutsideChokePoint()).toEqual([])
  })

  it('exits 0 as a script on the real tree, and says what it checked', () => {
    const out = execFileSync(process.execPath, [join(REPO, 'scripts', 'check-write-choke-point.mjs')], {
      encoding: 'utf8',
    })
    expect(out).toMatch(/check-write-choke-point: no autofill, sign or submit outside src\/lib\/xrpl\/writes\.ts\./)
  })

  it('is run by `bun run lint`', () => {
    expect(packageJson.scripts.lint).toContain('node scripts/check-write-choke-point.mjs')
  })
})
