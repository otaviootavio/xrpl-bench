#!/usr/bin/env node
/**
 * Layering guard for the two lower layers — AD-1.
 *
 * Dependencies point one way: `pages` → `components` → `hooks` → `lib`/`store`.
 * So no module under `src/lib` and no module under `src/store` may import from
 * `src/components` or `src/pages`. A `lib` module that needs to report
 * something upward takes a callback or returns a value.
 *
 * This exists because the violation is invisible to every other gate. The
 * notice-tone vocabulary lived in `components/ui/alert.tsx` while `lib/notify`
 * imported it as a *value* and `store/notice-store` as a type; lint, build,
 * tests and the contrast scan were all green the entire time, and the only
 * thing that ever caught it was a person reading the imports. Moving the map to
 * `src/lib/notice-tone.ts` fixed the instance; without this scan, one
 * `import { X } from '@/components/...'` in a `lib` file puts it straight back
 * with four green gates behind it.
 *
 * A single line may opt out with a `// check-layering-allow` comment on the
 * line above it. It suppresses that one line and nothing else, so a deliberate
 * counterexample — this guard's own fixtures — stays possible without
 * exempting a whole tree.
 *
 * oxlint carries no user-defined-rule mechanism, so this is a standalone scan
 * rather than a lint rule. It imports `node:` builtins and nothing else, so it
 * adds no dependency and runs under plain `node`.
 *
 * Run by `bun run lint`, or alone with `bun run check:layering`.
 */
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')

/** The lower layers, which may not reach upward. */
const LOWER = [join('src', 'lib'), join('src', 'store')]

/** The upper layers they may not reach for. */
const UPPER = ['components', 'pages']

/** Opts the NEXT line out of the scan, and only that line. */
const ALLOW_DIRECTIVE = 'check-layering-allow'

const EXTENSIONS = ['.ts', '.tsx']

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

const posix = (p) => p.split(sep).join('/')

/** 1-based line numbers suppressed by a directive on the line above them. */
function allowedLines(text) {
  const allowed = new Set()
  text.split('\n').forEach((line, i) => {
    if (line.includes(`// ${ALLOW_DIRECTIVE}`)) allowed.add(i + 2)
  })
  return allowed
}

/**
 * Every upward import in the lower layers, with the line it appears on.
 *
 * Both spellings count: the `@/components` alias and a relative path that
 * climbs out of `lib`/`store` into one of those trees. `import type` counts
 * too — it adds no runtime edge, but it is the same coupling and it is how the
 * `NoticeTone` import survived review the first time.
 *
 * Matched against whole-file text rather than line by line, because a pattern
 * that needs the keyword and the string on one line is defeated by a line
 * break — exactly how a check like this rots without anyone noticing.
 *
 * Exported so the guard itself is testable — a check nobody tests is a check
 * that silently stops matching.
 */
export function findUpwardImports(dir = SRC, root = ROOT) {
  const found = []
  const group = UPPER.join('|')
  const re = new RegExp(
    String.raw`(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"](?:@/(?:${group})|(?:\.\./)+(?:${group}))(?:/|['"])`,
    'g',
  )
  for (const file of walk(dir)) {
    const rel = posix(relative(root, file))
    if (!LOWER.some((lower) => rel.startsWith(`${posix(lower)}/`))) continue
    const text = readFileSync(file, 'utf8')
    const allowed = allowedLines(text)
    re.lastIndex = 0
    let match
    while ((match = re.exec(text)) !== null) {
      const line = lineOf(text, match.index)
      if (allowed.has(line)) continue
      found.push({ file: rel, line })
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
  const strays = findUpwardImports()
  if (strays.length > 0) {
    console.error('Module(s) under src/lib or src/store import from src/components or src/pages:\n')
    for (const s of strays) console.error(`  ${s.file}:${s.line}`)
    console.error('\nAD-1: dependencies point one way — pages -> components -> hooks -> lib/store.')
    console.error('Move the shared value down into src/lib (the way NOTICE_TONE moved to src/lib/notice-tone.ts),')
    console.error('or have the lower module take a callback and return a value instead of reaching upward.')
    console.error(
      `\nA deliberate counterexample can opt its line out with a \`// ${ALLOW_DIRECTIVE}\` comment on the line above.`,
    )
    process.exit(1)
  }
  console.log('check-layering: src/lib and src/store import nothing from src/components or src/pages.')
}
