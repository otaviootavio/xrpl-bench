#!/usr/bin/env node
/**
 * Contrast guard for the token layer.
 *
 * Parses the oklch() token values straight out of `src/index.css` — light from
 * `:root`, dark from the `prefers-color-scheme` block — converts them to sRGB,
 * and measures every pair the app actually renders, including the tinted `/10`
 * and `/40` alpha composites. Exits non-zero on any failure.
 *
 * Exists because the failures it catches are invisible to `tsc` and to oxlint,
 * and were originally found only by measuring by hand. See docs/decisions.md
 * §6.2. Run with `bun run check:contrast`.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const CSS = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.css')

// ---- oklch -> sRGB, and WCAG 2.1 contrast -------------------------------
function oklchToSrgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  const raw = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  const enc = (v) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055
    return Math.min(1, Math.max(0, c))
  }
  return { srgb: raw.map(enc), inGamut: raw.every((v) => v >= -0.0005 && v <= 1.0005) }
}
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const ratio = (f, bg) => {
  const a = lum(f)
  const b = lum(bg)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}
const over = (fg, bg, alpha) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha))

// ---- parse the token blocks out of index.css ----------------------------
const css = readFileSync(CSS, 'utf8')

function parseBlock(source) {
  const out = {}
  const re = /--([a-z-]+):\s*oklch\(([^)]+)\)/g
  let m
  while ((m = re.exec(source))) {
    const parts = m[2].trim().split(/[\s/]+/).map(Number)
    if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) continue // skip alpha tokens
    const { srgb, inGamut } = oklchToSrgb(parts[0], parts[1], parts[2])
    out[m[1]] = { srgb, inGamut, raw: m[2].trim() }
  }
  return out
}

const rootMatch = css.match(/:root\s*\{([\s\S]*?)\n\}/)
const darkMatch = css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([\s\S]*?)\n {2}\}/)
if (!rootMatch) throw new Error('could not find :root token block in src/index.css')
if (!darkMatch) throw new Error('could not find prefers-color-scheme: dark token block in src/index.css')

const light = parseBlock(rootMatch[1])
const dark = { ...light, ...parseBlock(darkMatch[1]) } // dark overrides light

// ---- the pairs the app actually renders ---------------------------------
const TEXT = 4.5
const NON_TEXT = 3

// A scribed rule between panel regions is decorative structure, not a control
// boundary, so WCAG 1.4.11 does not apply to it. It is still measured, at a
// visibility floor, so that a future edit cannot quietly make it vanish the way
// the incumbent --border (~1.2:1 on white) effectively had.
const VISIBLE = 1.5

function pairsFor(t) {
  const card = t.card.srgb
  const bg = t.background.srgb
  const readout = t.readout.srgb
  const warnTint = over(t.warning.srgb, bg, 0.1) // Alert variant="warning"
  const destTint = over(t.destructive.srgb, bg, 0.1) // Alert variant="destructive"
  const sucTint = over(t.success.srgb, bg, 0.1) // Alert variant="success"
  const mutedTint = over(t.muted.srgb, card, 0.4) // bg-muted/40 strips
  return [
    ['body text on page', t.foreground.srgb, bg, TEXT],
    ['body text on card', t['card-foreground'].srgb, card, TEXT],
    ['muted helper on card', t['muted-foreground'].srgb, card, TEXT],
    ['muted helper on bg-muted/40', t['muted-foreground'].srgb, mutedTint, TEXT],
    ['muted helper on page', t['muted-foreground'].srgb, bg, TEXT],
    ['text-destructive on card', t['text-destructive'].srgb, card, TEXT],
    ['text-destructive on destructive/10', t['text-destructive'].srgb, destTint, TEXT],
    ['text-warning on card', t['text-warning'].srgb, card, TEXT],
    ['text-warning on warning/10', t['text-warning'].srgb, warnTint, TEXT],
    ['text-success on card', t['text-success'].srgb, card, TEXT],
    ['text-success on success/10', t['text-success'].srgb, sucTint, TEXT],
    ['primary button label', t['primary-foreground'].srgb, t.primary.srgb, TEXT],
    ['secondary button label', t['secondary-foreground'].srgb, t.secondary.srgb, TEXT],
    // The one control class that moves funds. If this pair ever fails, the
    // most consequential button in the app is the one that reads worst.
    ['commit key label', t['commit-foreground'].srgb, t.commit.srgb, TEXT],
    ['destructive fill label', t['destructive-foreground'].srgb, t.destructive.srgb, TEXT],
    ['warning fill label', t['warning-foreground'].srgb, t.warning.srgb, TEXT],
    ['success fill label', t['success-foreground'].srgb, t.success.srgb, TEXT],
    // The readout well is dark in BOTH finishes, so it is measured in both.
    ['readout numerals', t['readout-foreground'].srgb, readout, TEXT],
    ['readout scale marks', t['readout-muted'].srgb, readout, TEXT],
    ['commit key vs page', t.commit.srgb, bg, NON_TEXT],
    // 1.4.11: --input is what identifies a field as a field.
    ['control boundary vs card', t.input.srgb, card, NON_TEXT],
    ['control boundary vs page', t.input.srgb, bg, NON_TEXT],
    ['--ring vs page bg', t.ring.srgb, bg, NON_TEXT],
    ['--ring vs card', t.ring.srgb, card, NON_TEXT],
    ['scribe rule vs page (visibility, not 1.4.11)', t.border.srgb, bg, VISIBLE],
    ['scribe rule vs card (visibility, not 1.4.11)', t.border.srgb, card, VISIBLE],
  ]
}

let failures = 0
for (const [name, tokens] of [
  ['light', light],
  ['dark', dark],
]) {
  console.log(`\n${name.toUpperCase()}`)
  for (const [label, fg, bgc, need] of pairsFor(tokens)) {
    const r = ratio(fg, bgc)
    const ok = r >= need
    if (!ok) failures++
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1  (needs ${need})  ${label}`)
  }
  // Informational only. Some inherited shadcn tokens sit just outside sRGB and
  // are clamped by the browser (rendering more vividly on a P3 display). Every
  // ratio above is measured on the clamped sRGB value, i.e. the worst case.
  for (const [k, v] of Object.entries(tokens)) {
    if (!v.inGamut) console.log(`  note  --${k}: oklch(${v.raw}) is outside sRGB; measured on the clamped value`)
  }
}

console.log(`\n${failures === 0 ? 'All token pairs pass.' : `${failures} contrast failure(s).`}`)
process.exit(failures === 0 ? 0 : 1)
