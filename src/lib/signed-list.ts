/**
 * The signed list of an Offline Wallet and the retry table (OS-FR-16,
 * route-checks.md "Retry without paying twice"). A record holds public ledger
 * facts only: no blob, no key, no secret. It is kept on the Wallet's view, so
 * it survives a lock and a reload; the kept Build does not.
 */

/** One signing by this Wallet. */
export interface SignedRecord {
  /** The Build hash (`offline-round.ts` `buildHashOf`): the Same Build content. */
  buildHash: string
  sequence: number
  /** The signed transaction's hash. */
  hash: string
  lastLedgerSequence: number
  /** The validated ledger index the Data to Sign carried. */
  ledgerIndex: number
  /** When it was signed, ms since epoch. */
  signedAt: number
}

const isUInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffffff

/** A stored record as written by `noteSigned`; anything else is dropped on read. */
export function isSignedRecord(v: unknown): v is SignedRecord {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return (
    typeof r.buildHash === 'string' &&
    /^[0-9a-f]{64}$/.test(r.buildHash) &&
    typeof r.hash === 'string' &&
    /^[0-9A-F]{64}$/.test(r.hash) &&
    isUInt(r.sequence) &&
    isUInt(r.lastLedgerSequence) &&
    isUInt(r.ledgerIndex) &&
    typeof r.signedAt === 'number' &&
    Number.isFinite(r.signedAt)
  )
}

/**
 * The earlier signing a new Data to Sign is compared with: of the records with
 * this Build hash, the one with the highest Sequence, then the highest
 * LastLedgerSequence. After a case (c) re-sign two records share a Sequence; the
 * later window is the one that can still apply, so P-21 is never shown while it
 * is open.
 */
export function latestSameBuild(list: readonly SignedRecord[], buildHash: string): SignedRecord | null {
  let best: SignedRecord | null = null
  for (const r of list) {
    if (r.buildHash !== buildHash) continue
    if (!best || r.sequence > best.sequence || (r.sequence === best.sequence && r.lastLedgerSequence > best.lastLedgerSequence)) best = r
  }
  return best
}

/**
 * The retry table (route-checks "Retry without paying twice", EXPERIENCE
 * "Retry"), from values already received:
 *
 * - `higher`: the received Sequence is higher, so the earlier one's Sequence is
 *   used, most likely by the earlier signing (P-20). Nothing is signed unless
 *   the user confirms "This is a new payment"; then the received Sequence.
 * - `passed`: the validated index has reached the earlier LastLedgerSequence, so
 *   the earlier signing can never apply (P-21). The received Sequence.
 *   "Past" is read as `>=`, the Transmit step's own window rule (story 2): a
 *   transaction is not in the validated ledger that equals its
 *   LastLedgerSequence, so it can never apply.
 * - `same-sequence`: the earlier signing can still apply, so this one uses its
 *   Sequence and at most one of the two applies (P-22). No new Sequence is
 *   offered (owner, 2026-11-08).
 *
 * A received Sequence LOWER than the earlier one is not in the table (it cannot
 * happen on a correct ledger). The earlier Sequence is always used (P-22), so
 * the two share one Sequence whatever ledger index came with it (story 7 review).
 */
export type RetryCase =
  | { case: 'higher' }
  | { case: 'passed'; sequence: number }
  | { case: 'same-sequence'; sequence: number }

export function retryCaseOf(earlier: SignedRecord, received: { sequence: number; ledger_index: number }): RetryCase {
  if (received.sequence > earlier.sequence) return { case: 'higher' }
  // Lower: always the earlier Sequence. The ledger index comes from the same
  // Transmitter that gave the impossible Sequence, so it cannot prove the earlier
  // window passed (story 7 review).
  if (received.sequence < earlier.sequence) return { case: 'same-sequence', sequence: earlier.sequence }
  if (received.ledger_index >= earlier.lastLedgerSequence) return { case: 'passed', sequence: received.sequence }
  return { case: 'same-sequence', sequence: earlier.sequence }
}
