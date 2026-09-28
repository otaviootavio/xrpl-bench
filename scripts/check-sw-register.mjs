#!/usr/bin/env node
/**
 * Service-worker registration guard — AD-11.
 *
 * `src/lib/sw-register.ts` is the one module allowed to import the
 * `virtual:pwa-register` specifier, and it owns the single memoised
 * registration every caller shares. The app entry point used to import the
 * specifier itself and register a second worker alongside `useAppUpdate`'s;
 * two registrations race, and an update prompt can fire from a path the update
 * logic does not own.
 *
 * Nothing else can catch a relapse: the registry's own tests exercise the core
 * factory, and `useAppUpdate.test.tsx` mocks the wiring module away, so putting
 * `import { registerSW } from 'virtual:pwa-register'` back into `main.tsx`
 * leaves lint, build, tests and the contrast gate all green. This scan is the
 * only thing standing between that edit and a shipped double registration.
 *
 * oxlint carries no user-defined-rule mechanism, so this is a standalone scan
 * rather than a lint rule. It imports `node:` builtins and nothing else, so it
 * adds no dependency and runs under plain `node`.
 *
 * Run by `bun run lint`, or alone with `bun run check:sw-register`.
 */
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')

/** The one module that may name the specifier. */
const OWNER = join('src', 'lib', 'sw-register.ts')

/** The virtual module only the owner may reach for. */
const SPECIFIER = 'virtual:pwa-register'

/** Opts the NEXT line out of the scan, and only that line. Same idiom as
 * `check-query-keys.mjs`: a deliberate counterexample — this guard's own
 * fixtures — stays possible without exempting a whole tree. */
const ALLOW_DIRECTIVE = 'check-sw-register-allow'

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
 * Every file that imports the specifier, with the line it appears on. Only a
 * module string reached through `from`, `import(`, `require(` or
 * `declare module` counts — the specifier is named in prose in several
 * docstrings, and a guard that flagged those would be one nobody could keep.
 *
 * Matched against whole-file text rather than line by line, because a pattern
 * that needs the keyword and the string on one line is defeated by a line
 * break — exactly how a check like this rots without anyone noticing.
 *
 * Exported so the guard itself is testable — a check nobody tests is a check
 * that silently stops matching.
 */
export function findSwRegisterImporters(dir = SRC, root = ROOT) {
  const found = []
  const re = /(?:\bfrom|\bimport|\brequire|\bdeclare\s+module)\s*\(?\s*['"]virtual:pwa-register['"]/g
  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf8')
    const allowed = allowedLines(text)
    re.lastIndex = 0
    let match
    while ((match = re.exec(text)) !== null) {
      const line = lineOf(text, match.index)
      if (allowed.has(line)) continue
      found.push({ file: posix(relative(root, file)), line })
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
}

/**
 * The violations: any importer that is not the owner, plus the owner having
 * stopped importing it at all (which would mean the specifier moved somewhere
 * this scan no longer knows about, or the module went dead).
 */
export function checkSwRegisterOwnership(dir = SRC, root = ROOT, owner = posix(OWNER)) {
  const importers = findSwRegisterImporters(dir, root)
  const strays = importers.filter((i) => i.file !== owner)
  const ownerImports = importers.some((i) => i.file === owner)
  return { importers, strays, ownerImports }
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
  const { strays, ownerImports } = checkSwRegisterOwnership()
  if (strays.length > 0) {
    console.error(`Module(s) other than ${posix(OWNER)} import '${SPECIFIER}':\n`)
    for (const s of strays) console.error(`  ${s.file}:${s.line}`)
    console.error(
      `\nAD-11: ${posix(OWNER)} owns the one service-worker registration and every caller shares it.`,
    )
    console.error(
      "Import `registerServiceWorker` from '@/lib/sw-register' instead — a second `registerSW` call registers a second worker,",
    )
    console.error(
      'and two registrations race over an update the user has not accepted yet.',
    )
    console.error(
      `\nA deliberate counterexample can opt its line out with a \`// ${ALLOW_DIRECTIVE}\` comment on the line above.`,
    )
    process.exit(1)
  }
  if (!ownerImports) {
    console.error(`${posix(OWNER)} no longer imports '${SPECIFIER}'.`)
    console.error('Either the registration moved — in which case this guard is now pointing at nothing —')
    console.error('or the app stopped registering a service worker at all. Neither is a silent change.')
    process.exit(1)
  }
  console.log(`check-sw-register: '${SPECIFIER}' is imported by ${posix(OWNER)} alone.`)
}
