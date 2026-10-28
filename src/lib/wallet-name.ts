/**
 * The one rule for a wallet's name (AD-42). Pure: no store, no keystore, no DOM.
 * The Rename dialog and `keystore.renameWallet` both call `validateWalletName`;
 * nothing else decides what a valid name is.
 */

export const WALLET_NAME_MAX = 40

export type WalletNameReason = 'empty' | 'too-long' | 'duplicate'
export type WalletNameResult = { ok: true; name: string } | { ok: false; reason: WalletNameReason }

// Zero-width, bidi and other invisible characters: two names that differ only by these look the same
// on a locked card, which shows nothing but the name, so they never survive normalisation.
const INVISIBLE = /[\p{Cc}\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/gu

/** NFC, invisible characters removed, trimmed, every inner run of whitespace collapsed to one space. */
export function normalizeWalletName(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim()
}

const key = (name: string) => normalizeWalletName(name).toLowerCase()

/**
 * `others` is the names of the OTHER Seeds. Views of one Seed share a name and
 * are never in it. Existing duplicates are grandfathered: this runs only when a
 * name is changed.
 */
export function validateWalletName(raw: string, others: readonly string[]): WalletNameResult {
  const name = normalizeWalletName(raw)
  if (name.length === 0) return { ok: false, reason: 'empty' }
  if (Array.from(name).length > WALLET_NAME_MAX) return { ok: false, reason: 'too-long' }
  const taken = new Set(others.map(key))
  if (taken.has(key(name))) return { ok: false, reason: 'duplicate' }
  return { ok: true, name }
}

/** `base`, else `base 2`, `base 3`, ... the first free (case-insensitive). */
export function uniqueDefaultName(base: string, others: readonly string[]): string {
  const taken = new Set(others.map(key))
  if (!taken.has(key(base))) return base
  for (let n = 2; ; n += 1) {
    const candidate = `${base} ${n}`
    if (!taken.has(key(candidate))) return candidate
  }
}
