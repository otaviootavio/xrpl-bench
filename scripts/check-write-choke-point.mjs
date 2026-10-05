#!/usr/bin/env node
/**
 * Write choke-point guard — AD-9.
 *
 * Every transaction this app signs passes `submitAndClassify` in
 * `src/lib/xrpl/writes.ts`. That one function raises the in-flight signal an
 * app update waits on (FR-48), refuses a fee above the cap
 * (`docs/decisions.md` §14), and classifies the result. A write that calls
 * xrpl.js directly skips all three, and every other gate stays green when one
 * appears. Epic 7 observed the single choke point but nothing enforced it
 * (epic 7 retrospective F8, action item 20); this scan does.
 *
 * Two rules, over every non-test `.ts`/`.tsx` file in `src/` except
 * `writes.ts` itself:
 *
 *   1. **SDK write method.** `autofill`, `sign`, `submit` or `submitAndWait`
 *      reached as a member, by dot (`client.submitAndWait(…)`, `wallet?.sign`)
 *      or by a string key (`client['submit']`). A bare reference counts, not
 *      only a call: `const send = client.submitAndWait` is the same bypass.
 *      `Math.sign` is not matched.
 *   2. **Raw RPC write.** A request naming a signing or submitting rippled
 *      command — `command: 'submit' | 'submit_multisigned' | 'sign' |
 *      'sign_for' | 'channel_authorize'`, with the key bare or quoted — which
 *      reaches the network without xrpl.js's helpers (the signing commands
 *      also hand rippled the secret).
 *
 * What it cannot see:
 *   - aliasing that never names the member: `const { submitAndWait } = client`
 *     or a computed key (`client[name]`);
 *   - a write made by another module or library the client is handed to;
 *   - a signing primitive imported under its own name (`import { sign } from
 *     'ripple-keypairs'`, then `sign(…)`), or xrpl.js's other signers
 *     (`multisign`, `signPaymentChannelClaim`), which are not on the list;
 *   - a raw WebSocket or `fetch` carrying a `submit` command assembled from
 *     fragments;
 *   - a second function inside `writes.ts` that bypasses `submitAndClassify`:
 *     the file is exempt as a whole, so its own review is the guard there;
 *   - test files (`*.test.ts(x)`, `__tests__/`): a test ships nothing, and the
 *     fakes in `writes.test.ts` must define and call these names;
 *   - anything outside `.ts`/`.tsx`.
 * Comments are not stripped: a comment spelling `client.submit(` fails closed
 * rather than a stripping bug failing open. Prose that names a method without
 * the leading `.` ("autofill computes one") is not matched.
 *
 * A single line may opt out with a `// check-write-choke-point-allow` comment
 * alone on the line above it — for a deliberate non-XRPL member of the same
 * name (`form.submit()`, `crypto.subtle.sign(…)`). It suppresses that one line
 * and nothing else. Anywhere else (trailing a code line, or in a block or JSX
 * comment) it is not recognised, so it fails closed.
 *
 * Same idiom as `check-explorer-links.mjs`: `node:` builtins only, runs under
 * plain `node`. Run by `bun run lint`, or alone with
 * `bun run check:write-choke-point`.
 */
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')

/** The choke point. The only file allowed to autofill, sign and submit. */
export const OWNER = join('src', 'lib', 'xrpl', 'writes.ts')

/** Opts the NEXT line out of the scan, and only that line. */
const ALLOW_DIRECTIVE = 'check-write-choke-point-allow'

const EXTENSIONS = ['.ts', '.tsx']

const METHOD = String.raw`(?:submitAndWait|submit|autofill|sign)`

const PATTERNS = [
  {
    label: 'SDK write method',
    // `.name` (also `?.name`), whitespace allowed after the dot, not
    // `Math.sign`; or `['name']` with any quote. The trailing `\b` keeps
    // `.signal`, `.submitted` and `.autofillFee` out.
    re: new RegExp(String.raw`(?<!\bMath\s*)\.\s*${METHOD}\b|\[\s*(['"\x60])${METHOD}\1\s*\]`, 'g'),
  },
  {
    label: 'raw RPC write',
    // The key bare (`command:`) or quoted (`'command':`, JSON's `"command":`).
    re: /(?:\bcommand|(['"`])command\1)\s*:\s*(['"`])(?:submit|submit_multisigned|sign|sign_for|channel_authorize)\2/g,
  },
]

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

/** The directive counts only alone on its own line: as a trailing comment on
 * a code line it would silently exempt the line after the one it sits on. */
const DIRECTIVE_LINE = new RegExp(String.raw`^\s*//\s*${ALLOW_DIRECTIVE}\s*$`)

/** 1-based line numbers suppressed by a directive on the line above them. */
function allowedLines(text) {
  const allowed = new Set()
  text.split('\n').forEach((line, i) => {
    if (DIRECTIVE_LINE.test(line)) allowed.add(i + 2)
  })
  return allowed
}

const posix = (p) => p.split(sep).join('/')

/** A test file: colocated `*.test.ts(x)` or anything under `__tests__/`. */
const isTestFile = (rel) => /\.test\.tsx?$/.test(rel) || rel.split('/').includes('__tests__')

/**
 * Scan `dir` for writes that bypass the choke point, reporting paths relative
 * to `root`. Exported so the guard itself is testable: a check nobody tests is
 * a check that silently stops matching.
 */
export function scanForWritesOutsideChokePoint(dir = SRC, root = ROOT) {
  const owner = posix(OWNER)
  const found = []
  for (const file of walk(dir)) {
    const rel = posix(relative(root, file))
    if (rel === owner || isTestFile(rel)) continue
    const text = readFileSync(file, 'utf8')
    const allowed = allowedLines(text)
    const seen = new Set()
    for (const { label, re } of PATTERNS) {
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
  const violations = scanForWritesOutsideChokePoint()
  if (violations.length > 0) {
    console.error('Write(s) outside the choke point found:\n')
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  ${v.label} (${v.match})`)
    }
    console.error(`\nEvery transaction is autofilled, signed and submitted only in ${posix(OWNER)} (AD-9).`)
    console.error('Build the transaction and call submitAndClassify(network, wallet, tx) instead: it raises')
    console.error('the in-flight signal, refuses a fee above the cap, and classifies the result.')
    console.error(
      `\nA deliberate non-XRPL member of the same name can opt its line out with a \`// ${ALLOW_DIRECTIVE}\` comment on the line above.`,
    )
    process.exit(1)
  }

  console.log(`check-write-choke-point: no autofill, sign or submit outside ${posix(OWNER)}.`)
}
