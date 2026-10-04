#!/usr/bin/env node
/**
 * Account-invalidation guard — story 5.5, promoted to a lint gate by epic 5
 * retro item 9.
 *
 * Account-scoped cache data is discarded through `invalidateAccountScoped()`
 * in `src/lib/xrpl/query-keys.ts` and nowhere else. Four sites that each named
 * their own keys to `invalidateQueries` each discarded a different subset —
 * history stayed stale after a trust-line change, the incoming-payment watch
 * after a send — and a member missing from one site could only be found by
 * comparing all four. This scan fails if any source file outside the factory
 * goes back to naming an account-scoped key at a discard or refetch call.
 *
 * The discard and refetch APIs are all covered — `invalidateQueries`,
 * `refetchQueries`, `resetQueries`, `removeQueries` and `cancelQueries` — since
 * a subset hand-picked through any of them is the same defect. It flags a call
 * whose argument names an account-scoped builder, and any file that both makes
 * one of those calls and builds an account-scoped key via `queryKeys.<name>(`
 * (the key bound to a variable first).
 *
 * The account-scoped names are read off the factory's `accountScoped` table as
 * text, because a `node:`-only script cannot import a `.ts` module. If that
 * table cannot be found, or yields no names, the guard fails rather than
 * passing over nothing; `account-invalidation-guard.test.ts` checks the names
 * it parses against the factory's runtime keys, so the two cannot drift.
 *
 * Test files (`__tests__/`, `*.test.ts(x)`) are not scanned: tests seed and
 * invalidate single keys on purpose, to prove the group does.
 *
 * Limits — it is a text scan and cannot see: a builder destructured or aliased
 * out of `queryKeys`; a key built in one module and discarded in another;
 * dynamic `queryKeys[name]` access; `setQueryData`; or a `)` inside a string in
 * the call's arguments, which ends the argument text early. The general
 * variable-bound gap belongs to story 10.1.
 *
 * A single line may opt out with a `// check-account-invalidation-allow`
 * comment on the line above it, the same idiom as the other guards.
 *
 * oxlint carries no user-defined-rule mechanism, so this is a standalone scan
 * rather than a lint rule. It imports `node:` builtins and nothing else, so it
 * adds no dependency and runs under plain `node`.
 *
 * Run by `bun run lint`, or alone with `bun run check:account-invalidation`.
 */
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')

/** The factory: the one module allowed to discard account-scoped keys, and the
 * one that declares which keys are account-scoped. */
const FACTORY = 'src/lib/xrpl/query-keys.ts'

/** The one path every other site must take. */
const ONE_PATH = 'invalidateAccountScoped'

/** Opts the NEXT line out of the scan, and only that line. */
const ALLOW_DIRECTIVE = 'check-account-invalidation-allow'

const DISCARD_CALL = /\b(?:invalidate|refetch|reset|remove|cancel)Queries\s*\(/g

const posix = (p) => p.split(sep).join('/')

function* walk(dir) {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__') yield* walk(full)
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) yield full
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
 * The builder names in the factory's `accountScoped` table, in source order —
 * or `null` when the table cannot be found at all. Exported so the test can
 * hold the parse to the factory's runtime keys.
 */
export function accountScopedBuilderNames(factoryText) {
  const table = /\bconst\s+accountScoped\s*=\s*\{([\s\S]*?)\n\}\s*satisfies\b/.exec(factoryText)
  if (!table) return null
  const names = []
  const entry = /^\s*([A-Za-z_$][\w$]*)\s*:\s*\(/gm
  for (let m = entry.exec(table[1]); m; m = entry.exec(table[1])) names.push(m[1])
  return names
}

/** Each discard/refetch call: where it starts and the text between its
 * parentheses. */
function discardCalls(text) {
  const calls = []
  DISCARD_CALL.lastIndex = 0
  for (let m = DISCARD_CALL.exec(text); m; m = DISCARD_CALL.exec(text)) {
    let depth = 1
    let i = DISCARD_CALL.lastIndex
    while (i < text.length && depth > 0) {
      if (text[i] === '(') depth++
      else if (text[i] === ')') depth--
      i++
    }
    calls.push({ index: m.index, args: text.slice(DISCARD_CALL.lastIndex, i - 1) })
  }
  return calls
}

/**
 * The violations in one file's text, each with the 1-based line it sits on.
 * Exported so the matching rule can be tested on a string as well as a tree.
 */
export function violationsIn(text, builders) {
  const calls = discardCalls(text)
  if (calls.length === 0) return []
  const allowed = allowedLines(text)
  const found = []
  for (const name of builders) {
    const named = new RegExp(`\\b${name}\\b`)
    const direct = calls.filter((c) => named.test(c.args)).map((c) => lineOf(text, c.index))
    const unsuppressed = direct.filter((line) => !allowed.has(line))
    if (direct.length > 0) {
      for (const line of unsuppressed) found.push({ line, builder: name, kind: 'passed to a discard call' })
      continue
    }
    const built = new RegExp(`queryKeys\\.${name}\\s*\\(`, 'g')
    for (let m = built.exec(text); m; m = built.exec(text)) {
      const line = lineOf(text, m.index)
      if (!allowed.has(line)) found.push({ line, builder: name, kind: 'built beside a discard call' })
    }
  }
  return found.sort((a, b) => a.line - b.line || a.builder.localeCompare(b.builder))
}

/**
 * Scan `dir` against the factory at `root/factory`.
 *
 * Returns the builder names it read (`null` if the table is gone), the
 * violations, and the files outside the factory that call the one path — so a
 * caller can tell "nothing wrong" apart from "nothing scanned".
 */
export function checkAccountInvalidation(dir = SRC, root = ROOT, factory = FACTORY) {
  const factoryText = readFileSync(join(root, factory), 'utf8')
  const builders = accountScopedBuilderNames(factoryText)
  const violations = []
  const callers = []
  if (!builders || builders.length === 0) return { builders, violations, callers }
  const onePath = new RegExp(`\\b${ONE_PATH}\\s*\\(`)
  for (const file of walk(dir)) {
    const rel = posix(relative(root, file))
    if (rel === factory) continue
    const text = readFileSync(file, 'utf8')
    if (onePath.test(text)) callers.push(rel)
    for (const v of violationsIn(text, builders)) violations.push({ file: rel, ...v })
  }
  violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  return { builders, violations, callers }
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

/**
 * Why a scan result fails the gate, in the order the script reports them —
 * empty when it passes. Exported so each exit path is tested, not only the
 * scan: a guard that exits 0 on "found no table" passes over nothing.
 */
export function failuresOf({ builders, violations, callers }) {
  if (!builders || builders.length === 0) return ['no-builders']
  const failures = []
  if (violations.length > 0) failures.push('violations')
  if (callers.length === 0) failures.push('no-callers')
  return failures
}

if (runningAsScript()) {
  const result = checkAccountInvalidation()
  const { builders, violations, callers } = result
  const failures = failuresOf(result)
  if (failures.includes('no-builders')) {
    console.error(`check-account-invalidation: no \`accountScoped\` builders found in ${FACTORY}.`)
    console.error('Either the table was renamed or reshaped — in which case this guard is now checking nothing —')
    console.error('or the account-scoped keys moved. Update the parse in this script; it must not pass silently.')
    process.exit(1)
  }
  if (failures.includes('violations')) {
    console.error('Account-scoped key(s) discarded outside the one invalidation path:\n')
    for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.builder} ${v.kind}`)
    console.error(`\nCall \`${ONE_PATH}(queryClient, network, address)\` from ${FACTORY} instead.`)
    console.error('A site that names its own keys discards its own subset, and the member it forgot stays stale')
    console.error('on screen — history after a trust-line change, the incoming-payment watch after a send.')
    console.error(
      `\nA deliberate counterexample can opt its line out with a \`// ${ALLOW_DIRECTIVE}\` comment on the line above.`,
    )
    process.exit(1)
  }
  if (failures.includes('no-callers')) {
    console.error(`check-account-invalidation: no file outside ${FACTORY} calls \`${ONE_PATH}(\`.`)
    console.error('Every site that discards account data used to go through it. A guard over a path nobody takes')
    console.error('is not evidence of anything; find where the discards went before letting this pass.')
    process.exit(1)
  }
  if (failures.length > 0) process.exit(1)
  console.log(
    `check-account-invalidation: ${builders.length} account-scoped builders, discarded only through ${ONE_PATH}() (${callers.length} callers).`,
  )
}
