#!/usr/bin/env node
/**
 * Money-arithmetic guard — AD-7.
 *
 * All arithmetic on drops and issued-currency values lives in
 * `src/lib/xrpl/money.ts` and is called from elsewhere. Epic 4 moved the last
 * drops calculation out of the UI layers (G-6); this scan holds that closure in
 * place, because the rule is grep-shaped and nothing else fails when it decays —
 * a balance check written inline in a screen passes lint, build, tests and the
 * contrast gate, and then diverges from the one in `money.ts`.
 *
 * Scope: `src/hooks`, `src/pages` and `src/components`, test files included.
 * `money.ts` sits outside those trees, so it is exempt the way the factory is
 * exempt from the query-key guard. `src/lib` and `src/store` are not scanned —
 * a lib test legitimately constructs a BigInt to pin a regression — so this
 * guard does not prove AD-7 for them.
 *
 * What it flags: a `BigInt(` call, a `BigInt.` static (`BigInt.asUintN`), and a
 * bigint literal (`0n`, `1_000_000n`, `0x1fn`). A text scan cannot tell `a + b`
 * on bigints from `a + b` on numbers, but it can see where a bigint is made, and
 * in these three trees there is no legitimate reason to make one. The `bigint`
 * type keyword is not flagged: a type is not arithmetic. Comments are not
 * stripped, so a comment that writes `BigInt(` fails closed rather than a
 * stripping bug failing open.
 *
 * A single line may opt out with a `// check-money-allow` comment on the line
 * above it. It suppresses that one line and nothing else, so a deliberate
 * counterexample — this guard's own fixtures — stays possible without exempting
 * a whole tree.
 *
 * This is a standalone scan rather than a lint rule, in the same idiom as
 * `check-query-keys.mjs`. It imports `node:` builtins and nothing else, so it
 * adds no dependency and runs under plain `node`.
 *
 * Run by `bun run lint`, or alone with `bun run check:money`.
 */
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** The trees that render or orchestrate money but must not compute it. */
export const SCANNED = [join('src', 'hooks'), join('src', 'pages'), join('src', 'components')]

/** The one module that owns money arithmetic. It is outside every scanned
 * tree; the explicit skip keeps it exempt if a scope is ever widened. */
const OWNER = join('src', 'lib', 'xrpl', 'money.ts')

/** Opts the NEXT line out of the scan, and only that line. */
const ALLOW_DIRECTIVE = 'check-money-allow'

const EXTENSIONS = ['.ts', '.tsx']

const PATTERNS = [
  { label: 'BigInt(', re: /\bBigInt\s*\(/g },
  { label: 'BigInt.', re: /\bBigInt\s*\.\s*[A-Za-z_$]/g },
  {
    label: 'bigint literal',
    re: /(?<![\w$.])(?:0[xX][0-9a-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+|\d[\d_]*)n(?![\w$])/g,
  },
]

/** Walks `dir`. A missing directory throws rather than scanning nothing and
 * passing: a renamed tree must fail the gate, not slip out of it. */
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

/**
 * Scan each of `trees` (relative to `root`) for bigint construction, reporting
 * paths relative to `root`. Exported so the guard itself is testable: a check
 * nobody tests is a check that silently stops matching.
 */
export function scanForMoneyArithmetic(root = ROOT, trees = SCANNED) {
  const found = []
  for (const tree of trees) {
    for (const file of walk(join(root, tree))) {
      const rel = posix(relative(root, file))
      if (rel === posix(OWNER)) continue
      const text = readFileSync(file, 'utf8')
      const allowed = allowedLines(text)
      for (const { label, re } of PATTERNS) {
        re.lastIndex = 0
        let match
        while ((match = re.exec(text)) !== null) {
          const line = lineOf(text, match.index)
          if (allowed.has(line)) continue
          found.push({ file: rel, line, label })
        }
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
  const violations = scanForMoneyArithmetic()
  if (violations.length > 0) {
    console.error('BigInt arithmetic found outside the money module:\n')
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  ${v.label}`)
    }
    console.error(`\nAll arithmetic on drops and issued-currency values lives in ${posix(OWNER)} (AD-7).`)
    console.error('Add a named function there and call it here, so the same calculation is never')
    console.error('written twice and left to diverge.')
    console.error(
      `\nA deliberate counterexample can opt its line out with a \`// ${ALLOW_DIRECTIVE}\` comment on the line above.`,
    )
    process.exit(1)
  }

  console.log(`check-money: no BigInt arithmetic in ${SCANNED.map(posix).join(', ')}.`)
}
