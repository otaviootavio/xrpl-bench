#!/usr/bin/env node
/**
 * Explorer-link guard — AD-10.
 *
 * Addresses and transaction hashes link to the block explorer only through the
 * shared `AddressLink` / `TxLink` components, which both live in
 * `src/components/wallet/AddressLink.tsx` and always build the URL for the
 * active network. Epic 4 removed the last hand-rolled explorer anchor (G-7);
 * this scan holds that closure in place. A link built by hand can point at the
 * wrong network's explorer, and every other gate stays green when one returns.
 *
 * Two rules, over all of `src/`:
 *
 *   1. **Host.** A known explorer host (`livenet.xrpl.org`, `testnet.xrpl.org`,
 *      `devnet.xrpl.org`, `xrpscan.com`, `bithomp.com`) appears only in
 *      `src/lib/xrpl/networks.ts`, which defines the hosts, and in
 *      `AddressLink.tsx`. Test files included.
 *   2. **Builder.** The URL builder — `accountExplorerUrl`, `txExplorerUrl`,
 *      and the `explorerBaseUrl` field they read — is referenced only by those
 *      same two files. AD-10 makes using the builder in a hand-written anchor a
 *      violation even when the URL is correct, and flagging every reference
 *      (not just one inside `href=`) also catches a URL bound to a variable
 *      first. Test files are outside this rule only: a test asserting a shared
 *      component's `href` has to name the builder, and a test ships no anchor.
 *
 * What it cannot see: a host assembled from fragments
 * (`'https://' + net + '.xrpl.org'`), or an explorer not on the host list.
 * Documentation links on `xrpl.org` itself are deliberately not matched.
 * Comments are not stripped, so a comment naming an explorer host fails closed
 * rather than a stripping bug failing open.
 *
 * A single line may opt out with a `// check-explorer-links-allow` comment on
 * the line above it. It suppresses that one line and nothing else, so a
 * deliberate counterexample — this guard's own fixtures — stays possible
 * without exempting a whole tree.
 *
 * This is a standalone scan rather than a lint rule, in the same idiom as
 * `check-query-keys.mjs`. It imports `node:` builtins and nothing else, so it
 * adds no dependency and runs under plain `node`.
 *
 * Run by `bun run lint`, or alone with `bun run check:explorer-links`.
 */
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')

/** The shared components (`AddressLink` and `TxLink`) and the URL builder's
 * own module. Everything else goes through the components. */
export const OWNERS = [
  join('src', 'components', 'wallet', 'AddressLink.tsx'),
  join('src', 'lib', 'xrpl', 'networks.ts'),
]

/** Opts the NEXT line out of the scan, and only that line. */
const ALLOW_DIRECTIVE = 'check-explorer-links-allow'

const EXTENSIONS = ['.ts', '.tsx']

const HOST_PATTERN = {
  label: 'explorer host',
  re: /\b(?:(?:livenet|testnet|devnet)\.xrpl\.org|xrpscan\.com|bithomp\.com)\b/gi,
}

const BUILDER_PATTERN = {
  label: 'explorer URL builder',
  re: /\b(?:accountExplorerUrl|txExplorerUrl|explorerBaseUrl)\b/g,
}

function* walk(dir) {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) yield full
  }
}

/** 1-based line number of a character offset. */
function lineOf(text, index) {
  let line = 1
  for (let i = 0; i < index; i++) if (text[i] === '\n') line++
  return line
}

/** 1-based line numbers suppressed by a directive on the line above them. */
function allowedLines(text) {
  const allowed = new Set()
  text.split('\n').forEach((line, i) => {
    if (line.includes(`// ${ALLOW_DIRECTIVE}`)) allowed.add(i + 2)
  })
  return allowed
}

const posix = (p) => p.split(sep).join('/')

/** A test file: colocated `*.test.ts(x)` or anything under `__tests__/`. */
const isTestFile = (rel) => /\.test\.tsx?$/.test(rel) || rel.split('/').includes('__tests__')

/**
 * Scan `dir` for hand-rolled explorer links, reporting paths relative to
 * `root`. Exported so the guard itself is testable: a check nobody tests is a
 * check that silently stops matching.
 */
export function scanForExplorerLinks(dir = SRC, root = ROOT) {
  const owners = new Set(OWNERS.map(posix))
  const found = []
  for (const file of walk(dir)) {
    const rel = posix(relative(root, file))
    if (owners.has(rel)) continue
    const text = readFileSync(file, 'utf8')
    const allowed = allowedLines(text)
    const patterns = isTestFile(rel) ? [HOST_PATTERN] : [HOST_PATTERN, BUILDER_PATTERN]
    const seen = new Set()
    for (const { label, re } of patterns) {
      re.lastIndex = 0
      let match
      while ((match = re.exec(text)) !== null) {
        const line = lineOf(text, match.index)
        if (allowed.has(line)) continue
        const key = `${line}:${label}`
        if (seen.has(key)) continue
        seen.add(key)
        found.push({ file: rel, line, label, match: match[0] })
      }
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
}

/** True when this file is the process entry point rather than an import.
 * Both sides are realpath-resolved: compared unresolved, a symlinked path makes
 * the guard skip its own body and exit 0 while `bun run lint` goes green. */
function runningAsScript() {
  if (process.argv[1] === undefined) return false
  const real = (p) => {
    try {
      return realpathSync(p)
    } catch {
      return resolve(p)
    }
  }
  return real(fileURLToPath(import.meta.url)) === real(resolve(process.argv[1]))
}

if (runningAsScript()) {
  const violations = scanForExplorerLinks()
  if (violations.length > 0) {
    console.error('Hand-rolled explorer link(s) found:\n')
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  ${v.label} (${v.match})`)
    }
    console.error(
      `\nAddresses and transaction hashes link to the explorer only through AddressLink / TxLink in ${posix(OWNERS[0])} (AD-10).`,
    )
    console.error('Render <AddressLink address={…} /> or <TxLink hash={…} /> instead: they build the URL for')
    console.error('the active network, and a hand-built one can point at the wrong network’s explorer.')
    console.error(
      `\nA deliberate counterexample can opt its line out with a \`// ${ALLOW_DIRECTIVE}\` comment on the line above.`,
    )
    process.exit(1)
  }

  console.log(`check-explorer-links: no explorer link outside ${OWNERS.map(posix).join(' and ')}.`)
}
