/**
 * Structural reads of values xrpl.js types loosely or throws as `unknown`.
 *
 * `src/lib/xrpl` has no explicit `any` (`.oxlintrc.json`): an `as any` on an
 * xrpl.js call is what kept `tsc` from reporting the fee cap passed in the
 * `signersCount` slot for a month (`docs/decisions.md` §14). These helpers
 * are the typed replacement. They read fields off any non-null object rather
 * than test `instanceof XrplError`/`RippledError`, so a plain object (a fake,
 * or an error from another copy of xrpl.js) classifies exactly as before.
 */

/** A non-null object whose fields may be read. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** The rippled error code on a failed request (`actNotFound`, …): what
 * `err?.data?.error` reads, without `any`. Undefined when there is none. */
export function rippledErrorCode(err: unknown): unknown {
  return isRecord(err) && isRecord(err.data) ? err.data.error : undefined
}
