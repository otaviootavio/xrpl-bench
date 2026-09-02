import { xrpToDrops } from 'xrpl'

// Guardrail (docs/decisions.md #4): XRP drops and issued-currency amounts
// are handled as strings/BigInt end-to-end. Conversion to a human display
// string happens ONLY here, at the render boundary, and never via
// `Number()`/parseFloat on the underlying value.
//
// Note: xrpl.js's own `dropsToXrp` returns a JS `number`, which is exactly
// the float-precision risk this guardrail exists to avoid for large
// balances — so drops-to-XRP conversion is done here with BigInt instead.
// `xrpToDrops` is reused as-is since it returns a string and only ever
// narrows precision (XRP -> drops can't lose information going the other
// way as long as the input has at most 6 decimal places).

/** Convert a drops string (from account_info, meta, etc.) to an exact XRP string. */
export function dropsToXrpString(drops: string): string {
  const negative = drops.startsWith('-')
  const value = BigInt(negative ? drops.slice(1) : drops)
  const whole = value / 1_000_000n
  const fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  const result = fraction.length > 0 ? `${whole}.${fraction}` : whole.toString()
  return negative ? `-${result}` : result
}

/** Convert a user-entered XRP string to a drops string for a transaction. */
export function xrpToDropsString(xrp: string): string {
  return xrpToDrops(xrp)
}

/**
 * Insert thousands separators into a decimal string WITHOUT going through
 * a floating-point Number — string manipulation only, so arbitrary-precision
 * issued-currency values (up to 15 significant digits) are never truncated
 * or rounded by IEEE 754 float conversion.
 */
export function formatAmountString(value: string): string {
  const negative = value.startsWith('-')
  const unsigned = negative ? value.slice(1) : value
  const [intPart, fracPart] = unsigned.split('.')
  const withSeparators = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const result = fracPart ? `${withSeparators}.${fracPart}` : withSeparators
  return negative ? `-${result}` : result
}

export function formatXrp(drops: string): string {
  return `${formatXrpValue(drops)} XRP`
}

/**
 * The same figure without its unit, for a surface that engraves the unit once
 * beside the reading instead of repeating it on every line — the readout well.
 * Never use this where the unit is not already unambiguous on screen.
 */
export function formatXrpValue(drops: string): string {
  return formatAmountString(dropsToXrpString(drops))
}

/** BigInt-safe drops arithmetic for reserve/spendable calculations. */
export function subtractDrops(a: string, b: string): string {
  return (BigInt(a) - BigInt(b)).toString()
}

export function multiplyDropsByCount(dropsPerUnit: string, count: number): string {
  return (BigInt(dropsPerUnit) * BigInt(count)).toString()
}

export function isNonNegativeDrops(drops: string): boolean {
  try {
    return BigInt(drops) >= 0n
  } catch {
    return false
  }
}

/**
 * True if a DECIMAL amount string (issued-currency balance/limit, e.g. "10.5")
 * is greater than zero. Issued-currency values are decimal strings, so they
 * must never be passed to BigInt — `BigInt("10.5")` throws a SyntaxError, and
 * doing so on a trust-line balance crashed the whole Send tab for any account
 * holding a fractional token balance. String inspection only, per guardrail #4.
 */
export function isPositiveDecimalString(value: string): boolean {
  if (!/^-?\d*\.?\d*$/.test(value) || value.trim() === '') return false
  if (value.startsWith('-')) return false
  return /[1-9]/.test(value)
}

/**
 * Compares two non-negative DECIMAL amount strings without floating point.
 * Returns -1, 0 or 1. Used to check an issued-currency amount against a held
 * balance — those are decimal strings, so BigInt would throw on them and
 * Number() would reintroduce exactly the float drift guardrail #4 forbids.
 */
export function compareDecimalStrings(a: string, b: string): number {
  const [aInt = '0', aFrac = ''] = a.split('.')
  const [bInt = '0', bFrac = ''] = b.split('.')
  const aI = aInt.replace(/^0+/, '') || '0'
  const bI = bInt.replace(/^0+/, '') || '0'
  if (aI.length !== bI.length) return aI.length > bI.length ? 1 : -1
  if (aI !== bI) return aI > bI ? 1 : -1
  const width = Math.max(aFrac.length, bFrac.length)
  const aF = aFrac.padEnd(width, '0')
  const bF = bFrac.padEnd(width, '0')
  if (aF === bF) return 0
  return aF > bF ? 1 : -1
}

/** Currency code display: XRPL uses 3-char ISO codes or 160-bit hex codes. */
export function displayCurrencyCode(code: string): string {
  if (code.length === 3) return code
  // 40-char hex currency code — try to decode a human-readable ASCII name
  // (XLS-15 style), else fall back to a shortened hex for display.
  if (/^[0-9A-Fa-f]{40}$/.test(code)) {
    const bytes = code.match(/.{2}/g) ?? []
    const chars = bytes.map((b) => parseInt(b, 16))
    if (chars.slice(0, 3).every((c) => c === 0) === false && chars.every((c) => c === 0 || (c >= 32 && c < 127))) {
      const text = String.fromCharCode(...chars).replace(/\0+$/, '').trim()
      if (text.length > 0) return text
    }
    return `${code.slice(0, 4)}…${code.slice(-4)}`
  }
  return code
}
