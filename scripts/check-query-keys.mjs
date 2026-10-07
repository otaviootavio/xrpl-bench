#!/usr/bin/env node
/**
 * Query-key guard for the TanStack Query layer.
 *
 * `src/lib/xrpl/query-keys.ts` is the one module allowed to write a query-key
 * array literal. Everywhere else a key must come from the `queryKeys` factory,
 * so a read key and the invalidation meant to match it can never drift apart —
 * a mismatch leaves the stale cache entry in place, which after a wallet switch
 * or a completed send means the previous wallet's balance stays on screen.
 *
 * A single line may opt out with a `// check-query-keys-allow` comment on the
 * line above it. It suppresses that one line and nothing else, so a deliberate
 * counterexample (the guard's own fixtures, a test that must retype a key to
 * prove the mismatch is caught) stays possible without exempting a whole tree.
 *
 * A key bound to a variable first is followed to its use within the same file
 * (G-19): an identifier bound to an array literal — by `const`/`let`/`var`, by
 * plain reassignment, or as a parameter default — is reported wherever it is
 * then passed at a key position (`queryKey: k`, `invalidateQueries(k)` and the
 * other positional APIs, or the `{ queryKey }` shorthand when the bound name is
 * itself `queryKey`). It is reported at the use line, where it reaches the
 * cache, so the directive for a deliberate one goes above the use.
 *
 * WHAT THIS SCAN CANNOT SEE — stated because a guard that silently misses a
 * case is the failure it exists to prevent (recorded as G-19's residual limit
 * in GAP-REGISTER.md):
 *   - a key literal built in one module and used in another;
 *   - a key returned from a function (`const k = makeKey()`), unless that
 *     function's own body passes it at a key position — including the likely
 *     React shape `const k = useMemo(() => ['accountState', n, a], [n, a])`,
 *     and a wrapped literal such as `Object.freeze([...])` or `([...])`;
 *   - a key composed from a non-literal (`k.concat(...)`, `[...base]` bound
 *     first then reached through another name).
 * Bindings are matched by name per file, not per scope, so a name bound to an
 * array in one function and to a factory key in another is flagged — that
 * over-approximation fails closed.
 *
 * This is a standalone scan rather than a lint rule. oxlint (1.80) does now
 * offer user rules through `jsPlugins`, but its own schema marks them alpha and
 * not subject to semver, which is not a foundation for a gate on signing code.
 * The scan imports `node:` builtins and nothing else, so it adds no dependency
 * and runs under plain `node`.
 *
 * Run by `bun run lint`, or alone with `bun run check:query-keys`.
 */
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')

/** The one module that owns every key. Its literals are the definitions. */
const FACTORY = join('src', 'lib', 'xrpl', 'query-keys.ts')

/** Opts the NEXT line out of the scan, and only that line. */
const ALLOW_DIRECTIVE = 'check-query-keys-allow'

const EXTENSIONS = ['.ts', '.tsx']

/**
 * Every shape a hand-written key can reach the cache through: the `queryKey:`
 * option, and the APIs that take a key as their first positional argument.
 * Matched against whole-file text rather than line by line, because a pattern
 * that needs the token and the `[` on one line is defeated by a line break —
 * exactly how a check like this rots without anyone noticing.
 */
const POSITIONAL_KEY_APIS = [
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

const PATTERNS = [
  { label: 'queryKey:', re: /\bqueryKey\s*:\s*\[/g },
  ...POSITIONAL_KEY_APIS.map((name) => ({
    label: `${name}(`,
    re: new RegExp(`\\b${name}\\s*\\(\\s*\\[`, 'g'),
  })),
]

const IDENT = '[A-Za-z_$][\\w$]*'

/**
 * An identifier bound to an array literal: `const k = [`, `let k: QueryKey = [`,
 * `k = [`, or a parameter default `(k = [`. The lookbehind rules out a member
 * assignment (`obj.k = [`); requiring `[` straight after the single `=` already
 * rules out `==`, `===` and `=>`.
 */
const BINDING_RE = new RegExp(
  `(?<![\\w$.])(${IDENT})\\s*(?::[^=;\\n]+)?=\\s*\\[`,
  'g',
)

/** Escape an identifier for use inside a RegExp (`$` is the only special). */
const escapeIdent = (name) => name.replace(/\$/g, '\\$')

/**
 * Key positions a bound name can reach the cache through. The name must be the
 * whole argument: a following `.`, `(` or `[` means a derived value
 * (`k.slice()`, `k[0]`, `k()`), not the array itself.
 */
function keyPositionPatterns(name) {
  const id = escapeIdent(name)
  const tail = `(?![\\w$])(?!\\s*[.(\\[])`
  const patterns = [
    { label: `queryKey: ${name}`, re: new RegExp(`\\bqueryKey\\s*:\\s*${id}${tail}`, 'g') },
    ...POSITIONAL_KEY_APIS.map((api) => ({
      label: `${api}(${name})`,
      re: new RegExp(`\\b${api}\\s*\\(\\s*${id}${tail}`, 'g'),
    })),
  ]
  if (name === 'queryKey') {
    // `useQuery({ queryKey, enabled })` — object shorthand for the bound name.
    patterns.push({ label: '{ queryKey }', re: /(?<=[{,]\s*)\bqueryKey(?=\s*[,}])/g })
  }
  return patterns
}

/** Every name bound to an array literal in `text`, with the 1-based line of
 * its first such binding. */
function arrayBindings(text) {
  const bindings = new Map()
  BINDING_RE.lastIndex = 0
  let match
  while ((match = BINDING_RE.exec(text)) !== null) {
    const name = match[1]
    if (name === 'const' || name === 'let' || name === 'var') continue
    if (!bindings.has(name)) bindings.set(name, lineOf(text, match.index))
  }
  return bindings
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

/**
 * Scan `dir` for hand-written key literals, reporting paths relative to
 * `root`. Exported so the guard itself is testable: a check nobody tests is a
 * check that silently stops matching.
 */
export function scanForHandWrittenKeys(dir = SRC, root = ROOT) {
  const found = []
  for (const file of walk(dir)) {
    const rel = relative(root, file)
    if (rel.split(sep).join('/') === FACTORY.split(sep).join('/')) continue
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
    for (const [name, boundAt] of arrayBindings(text)) {
      for (const { label, re } of keyPositionPatterns(name)) {
        re.lastIndex = 0
        let match
        while ((match = re.exec(text)) !== null) {
          const line = lineOf(text, match.index)
          if (allowed.has(line)) continue
          found.push({ file: rel, line, label: `${label} (array bound at line ${boundAt})` })
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
  const violations = scanForHandWrittenKeys()
  if (violations.length > 0) {
    console.error('Hand-written query key literal(s) found:\n')
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  array literal passed to ${v.label}`)
    }
    console.error(
      `\nEvery query key is produced by the factory in ${FACTORY.split(sep).join('/')}.`,
    )
    console.error(
      'Add a named function there and call it here, e.g. `queryKey: queryKeys.accountState(network, address)`.',
    )
    console.error(
      'A key retyped at an invalidation site drifts from the read key it is meant to match,',
    )
    console.error(
      'and the stale entry is never dropped — the previous wallet’s balance stays on screen.',
    )
    console.error(
      `\nA deliberate counterexample can opt its line out with a \`// ${ALLOW_DIRECTIVE}\` comment on the line above.`,
    )
    process.exit(1)
  }

  console.log(`check-query-keys: no hand-written query keys outside ${FACTORY.split(sep).join('/')}.`)
}
