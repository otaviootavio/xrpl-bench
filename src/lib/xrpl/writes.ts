import { Wallet, type Payment, type SubmittableTransaction, type TrustSet, TrustSetFlags } from 'xrpl'
import { getXrplClient, holdXrplClient } from './client'
import type { NetworkId } from './networks'
import { MAX_FEE_DROPS, feeWithinCap, formatXrp, isCanonicalPositiveDrops } from './money'
import { isRecord } from './narrow'

/**
 * Reports whether a transaction is currently in flight.
 *
 * AD-1: `lib` reports upward, it never reaches upward. The app installs the
 * real reporter once at startup (`src/App.tsx`); until then — and in every
 * test — it is a no-op, so this module can be exercised without standing up
 * React state.
 *
 * Deliberately module-level and global: AD-9/FR-48 require EVERY write to
 * raise the flag, so there is no per-call override and no way for a caller
 * to opt out.
 *
 * The reporter is told a boolean, but the choke point counts (AD-9, G-17):
 * two writes can overlap — a payment and a trust-line change from different
 * tabs — and a flag cleared by whichever settles first would report "nothing
 * in flight" while the other is still live. So the reporter hears `true` on
 * the 0→1 transition of `inFlightDepth` and `false` on 1→0, and never between.
 */
export type TxInFlightReporter = (inFlight: boolean) => void

let reportTxInFlight: TxInFlightReporter = () => {}

/** How many writes are inside the choke point right now. In flight means
 * above zero. Only `submitAndClassify` moves it, and only in matched pairs. */
let inFlightDepth = 0

export function setTxInFlightReporter(reporter: TxInFlightReporter): void {
  reportTxInFlight = reporter
}

/** Test seam — restores the default no-op reporter and a zero depth, so a
 * write a test left hanging cannot hide the next test's 0→1 transition.
 * Nothing in production zeroes the depth: only a settled write lowers it. */
export function resetTxInFlightReporter(): void {
  reportTxInFlight = () => {}
  inFlightDepth = 0
}

/**
 * The choke point refused to sign because the transaction's fee is above
 * `MAX_FEE_DROPS` or is not a canonical positive drops string. Nothing was
 * signed or submitted, so no fee was spent.
 *
 * The cap is enforced here, explicitly, rather than through xrpl.js: the
 * second argument of `client.autofill` is `signersCount`, not an options
 * object, and a `Client({ maxFeeXRP })` would silently CLAMP a spike fee below
 * what the network wants (and skips its special-cost types altogether, e.g.
 * AccountDelete) instead of refusing. A refusal is the honest outcome: every
 * write type passes this check, with no exceptions.
 */
export class FeeAboveCapError extends Error {
  readonly fee: unknown
  constructor(fee: unknown) {
    const cap = formatXrp(MAX_FEE_DROPS)
    super(
      // Named as a figure only when it is a canonical drops string; a
      // malformed one (`'012'`, `'12.5'`, missing) is not a fee to state.
      isCanonicalPositiveDrops(fee)
        ? `The network fee for this transaction is ${formatXrp(fee)}, above this wallet's limit of ${cap}. Nothing was signed or submitted, and no fee was spent.`
        : `The network fee for this transaction could not be confirmed to be within this wallet's limit of ${cap}. Nothing was signed or submitted, and no fee was spent.`,
    )
    this.name = 'FeeAboveCapError'
    this.fee = fee
  }
}

export type SubmitOutcome =
  | { status: 'validated'; hash: string; resultCode: string; ledgerIndex?: number }
  /** In a validated ledger, but the transaction did NOT do what was asked and
   * the fee WAS consumed (`tec*`). Materially different from 'failed' and must
   * be reported differently — the user has been charged. */
  | { status: 'claimed'; hash: string; resultCode: string; ledgerIndex?: number }
  /** Rejected before being applied (`tef*`/`tem*`/`ter*`) — no fee consumed. */
  | { status: 'failed'; hash: string; resultCode: string }
  | { status: 'expired'; hash: string } // LastLedgerSequence passed with no validated result — see docs/decisions.md

function classify(resultCode: string): 'validated' | 'claimed' | 'failed' {
  if (resultCode === 'tesSUCCESS') return 'validated'
  if (resultCode.startsWith('tec')) return 'claimed'
  return 'failed'
}

/**
 * The write choke point (AD-9): every transaction this app signs is submitted
 * here, whatever its type. Exported and typed on `SubmittableTransaction` so a
 * new feature (Escrow, Check, Payment Channel, `AccountSet`, …) obeys AD-9 by
 * calling it, without editing this module (G-16). The caller builds the
 * transaction; this function owns the in-flight signal and the classification.
 */
export async function submitAndClassify(
  network: NetworkId,
  wallet: Wallet,
  tx: SubmittableTransaction,
): Promise<SubmitOutcome> {
  // app-versioning-and-updates.md US-5: the single choke point every write
  // passes through, so the update flow always sees an accurate "is anything
  // in flight right now" signal regardless of which tab is mounted. Raised
  // before the first network call (autofill needs the current sequence, so
  // signing has effectively already started) and lowered in `finally` so a
  // thrown/expired outcome still releases it. The increment is the last
  // statement before `try` and cannot throw, and the report is inside the
  // `try`, so nothing can raise the depth without the `finally` lowering it.
  inFlightDepth += 1
  let release: (() => void) | undefined
  try {
    if (inFlightDepth === 1) reportTxInFlight(true)
    // Held, not merely fetched: `submitAndWait` polls on this one client until
    // the transaction settles, so a read replacing it after a dropped socket
    // must not close it under the wait (see `holdXrplClient`).
    const held = await holdXrplClient(network)
    release = held.release
    const client = held.client
    // A `Fee` already on `tx` (Send pins the figure it showed) is left alone
    // by autofill; otherwise autofill computes one. Either way the cap below
    // is the only ceiling, and it is checked on what will actually be signed.
    const prepared = await client.autofill(tx)
    // Thrown inside the `try`, so the in-flight depth is still lowered.
    if (!feeWithinCap(prepared.Fee)) throw new FeeAboveCapError(prepared.Fee)
    const signed = wallet.sign(prepared)
    const lastLedgerSequence = prepared.LastLedgerSequence
    try {
      const res = await client.submitAndWait(signed.tx_blob)
      const meta = res.result.meta
      const resultCode = typeof meta === 'object' && meta ? meta.TransactionResult : 'unknown'
      const status = classify(resultCode)
      return status === 'failed'
        ? { status, hash: signed.hash, resultCode }
        : { status, hash: signed.hash, resultCode, ledgerIndex: res.result.ledger_index }
    } catch (err: unknown) {
      // The "stuck/expired" case from docs/decisions.md: the network moved past
      // this transaction's LastLedgerSequence without it appearing in a
      // validated ledger. It may simply never have been included. NEVER
      // resubmit this exact signed blob — the caller must build a fresh
      // transaction with a new sequence.
      //
      // Detected structurally (comparing the validated ledger index against the
      // tx's own LastLedgerSequence) rather than by matching on error-message
      // text, which silently reclassifies whenever xrpl.js rewords it.
      if (await isExpiry(err, network, lastLedgerSequence)) {
        return { status: 'expired', hash: signed.hash }
      }
      throw err
    }
  } finally {
    // Nested so the depth is lowered even if releasing the client throws: a
    // depth stranded above zero would refuse every update for the session.
    try {
      release?.()
    } finally {
      inFlightDepth -= 1
      if (inFlightDepth === 0) reportTxInFlight(false)
    }
  }
}

async function isExpiry(err: unknown, network: NetworkId, lastLedgerSequence?: number): Promise<boolean> {
  // Read structurally, not by `instanceof XrplError` (see `narrow.ts`): an
  // expiry missed here would be rethrown as a failure.
  const { name, message } = isRecord(err) ? err : {}
  if (name === 'XrplError' && typeof message === 'string' && message.includes('LastLedgerSequence')) {
    return true
  }
  if (lastLedgerSequence === undefined) return false
  try {
    const client = await getXrplClient(network)
    const res = await client.request({ command: 'ledger', ledger_index: 'validated' })
    const validatedIndex = res.result.ledger_index
    return typeof validatedIndex === 'number' && validatedIndex > lastLedgerSequence
  } catch {
    return false
  }
}

export async function submitXrpPayment(
  network: NetworkId,
  wallet: Wallet,
  params: {
    destination: string
    amountDrops: string
    destinationTag?: number
    /** The fee to sign, as a drops string — the figure the operator was shown.
     * Pinned on the transaction so autofill does not compute its own. Still
     * subject to the choke point's cap. */
    feeDrops?: string
  },
): Promise<SubmitOutcome> {
  const tx: Payment = {
    TransactionType: 'Payment',
    Account: wallet.address,
    Destination: params.destination,
    Amount: params.amountDrops,
    ...(params.destinationTag !== undefined ? { DestinationTag: params.destinationTag } : {}),
    ...(params.feeDrops !== undefined ? { Fee: params.feeDrops } : {}),
  }
  return submitAndClassify(network, wallet, tx)
}

export async function submitIssuedPayment(
  network: NetworkId,
  wallet: Wallet,
  params: {
    destination: string
    currency: string
    issuer: string
    value: string
    destinationTag?: number
    /** The fee to sign, as a drops string — the figure the operator was shown.
     * Pinned on the transaction so autofill does not compute its own. Still
     * subject to the choke point's cap. */
    feeDrops?: string
  },
): Promise<SubmitOutcome> {
  const tx: Payment = {
    TransactionType: 'Payment',
    Account: wallet.address,
    Destination: params.destination,
    Amount: { currency: params.currency, issuer: params.issuer, value: params.value },
    ...(params.destinationTag !== undefined ? { DestinationTag: params.destinationTag } : {}),
    ...(params.feeDrops !== undefined ? { Fee: params.feeDrops } : {}),
  }
  return submitAndClassify(network, wallet, tx)
}

export async function submitTrustSet(
  network: NetworkId,
  wallet: Wallet,
  params: { currency: string; issuer: string; limit: string }, // limit "0" removes the line
): Promise<SubmitOutcome> {
  const tx: TrustSet = {
    TransactionType: 'TrustSet',
    Account: wallet.address,
    LimitAmount: { currency: params.currency, issuer: params.issuer, value: params.limit },
    // Holders should not let balances ripple through their trust lines —
    // rippling is for issuers. Without NoRipple a holder's balance can shift
    // as a side effect of unrelated payments between other parties.
    Flags: TrustSetFlags.tfSetNoRipple,
  }
  return submitAndClassify(network, wallet, tx)
}
