import { type AccountSet, AccountSetAsfFlags, decode, hashes, type Payment, PaymentFlags, type SetRegularKey, type SubmittableTransaction, type TrustSet, TrustSetFlags, verifySignature } from 'xrpl'
import { getXrplClient, holdXrplClient } from './client'
import { NETWORKS, type NetworkId } from './networks'
import { MAX_FEE_DROPS, feeWithinCap, formatXrp, isCanonicalPositiveDrops } from './money'
import { isRecord } from './narrow'
import { fetchAccountState } from './reads'
import { EXPIRED_NOTHING_SENT, NOT_SENT, REFUSAL, STILL_VALID_WARNING, fill } from '../transmit-words'

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

/**
 * Refused before anything is signed: this wallet signs with its Account's MASTER
 * key and the ledger shows that key turned off. Every transaction would be
 * rejected, and it would only surface as "expired" (the network answers
 * `tefMASTER_DISABLED` and the wait runs on to the end of the window).
 */
export class MasterKeyOffError extends Error {
  constructor() {
    super(
      'The master key of this account is turned off, and this wallet signs with the master key, so it cannot send. Use the wallet that signs as the account’s Regular Key. Nothing was signed or submitted, and no fee was spent.',
    )
    this.name = 'MasterKeyOffError'
  }
}

/**
 * A one-use signing capability (AD-22). Structural, so `xrpl` never imports
 * `crypto`: `lib/crypto/keystore` builds one that satisfies it. It holds the
 * Seed only in a closure, valid for one `sign`, and `dispose` clears it whether
 * or not `sign` ran.
 */
export interface Signer {
  sign(tx: SubmittableTransaction): { tx_blob: string; hash: string }
  dispose(): void
}

/**
 * What the choke point is given instead of a `Wallet`. `open` runs the
 * Wallet's Signing Check (a PIN or passkey prompt, possibly long) and returns a
 * `Signer`; the choke point calls it after autofill and before the ledger
 * window is fixed, so a slow prompt cannot eat the window (AD-22). It rejects
 * when the check fails or is cancelled, and nothing is then signed.
 */
export interface SigningHandle {
  address: string
  /** True when the key that signs IS the Account's master key (its own address),
   * so the ledger refuses it once the master key is off. Absent: not known. */
  signsAsMaster?: boolean
  open(): Promise<Signer>
  /**
   * "Show the signed transaction before sending" (OS-FR-10): present only when
   * the Wallet's setting is on. The choke point calls it after signing and
   * before the Transmit step, with the blob; `true` sends it, `false` sends
   * nothing (`TransmitDeclinedError`). Absent: the blob goes straight to the
   * Transmit step, as before the setting existed. Whoever answers it must
   * settle it on every exit (decline, unmount, lock): the in-flight depth stays
   * raised until it does, because a live signed blob exists.
   */
  reviewBeforeSending?(signed: SignedForReview): Promise<boolean>
}

/** What the review is shown: the blob, its hash, the Network it is for, and the
 * last ledger it can apply in. Held only until the review settles. */
export interface SignedForReview {
  txBlob: string
  hash: string
  network: NetworkId
  lastLedgerSequence: number | undefined
}

/**
 * A Signed Transaction that enters the Transmit step from outside this module
 * (a scanned signed QR, story 4): the blob and the Network its envelope names.
 */
export interface SignedTransaction {
  txBlob: string
  network: NetworkId
}

/** Why the Transmit step refused a Signed Transaction. Nothing was submitted. */
export type TransmitRefusal = 'signature' | 'account' | 'network' | 'partial-payment' | 'expired' | 'ledger-unread'

/**
 * The Transmit step refused (route-checks.md "Transmit step", OS-FR-9). Nothing
 * was submitted, so no fee was spent and the blob can still be valid. The words
 * are P-26 and the fixed "Expired. Nothing was sent." (`transmit-words.ts`).
 */
export class TransmitRefusedError extends Error {
  readonly reason: TransmitRefusal
  constructor(reason: TransmitRefusal, message: string) {
    super(message)
    this.name = 'TransmitRefusedError'
    this.reason = reason
  }
}

/**
 * The user declined at "Send it to the ledger?" (OS-FR-10). Nothing was
 * submitted. The blob stays valid until its LastLedgerSequence, so the message
 * is P-24 and its decline line.
 */
export class TransmitDeclinedError extends Error {
  readonly lastLedgerSequence: number | undefined
  constructor(lastLedgerSequence: number | undefined) {
    super(
      lastLedgerSequence === undefined
        ? NOT_SENT
        : `${fill(STILL_VALID_WARNING, lastLedgerSequence)} ${NOT_SENT}`,
    )
    this.name = 'TransmitDeclinedError'
    this.lastLedgerSequence = lastLedgerSequence
  }
}

/**
 * The Account a Signed Transaction must be signed for at the Transmit step
 * (route-checks.md, OS-FR-9): the Synced address; else the Account of the
 * request this Transmitter answered; else the Account the user confirmed on
 * screen. `null`: none is known, and the caller must ask the user to confirm
 * one (P-27) before calling `transmitSignedTransaction`.
 */
export function expectedAccountFor(from: { syncedAddress?: string; requestAccount?: string; confirmedAccount?: string }): string | null {
  return from.syncedAddress ?? from.requestAccount ?? from.confirmedAccount ?? null
}

/** Two-device signing (AD-30): the window must outlast a round trip between two
 * devices, so it is 75 ledgers (roughly four to six minutes), not autofill's 20. */
export const TWO_DEVICE_LEDGER_WINDOW = 75

/** rippled's own default distance to `LastLedgerSequence` (xrpl.js autofill). */
const LEDGER_WINDOW = 20

export type SubmitOutcome =
  | { status: 'validated'; hash: string; resultCode: string; ledgerIndex?: number }
  /** In a validated ledger, but the transaction did NOT do what was asked and
   * the fee WAS consumed (`tec*`). Materially different from 'failed' and must
   * be reported differently — the user has been charged. */
  | { status: 'claimed'; hash: string; resultCode: string; ledgerIndex?: number }
  /** Rejected before being applied (`tef*`/`tem*`/`ter*`) — no fee consumed. */
  | { status: 'failed'; hash: string; resultCode: string }
  | { status: 'expired'; hash: string } // LastLedgerSequence passed with no validated result — see docs/decisions.md
  /** In a validated ledger, but the response carried no readable
   * `TransactionResult`. NOT a failure and NOT "not sent": the caller must tell
   * the operator to check the hash before trying again, and never resubmit. */
  | { status: 'unknown'; hash: string }

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
  signing: SigningHandle,
  tx: SubmittableTransaction,
  node?: string,
): Promise<SubmitOutcome> {
  // app-versioning-and-updates.md US-5: the single choke point every write
  // passes through, so the update flow always sees an accurate "is anything
  // in flight right now" signal regardless of which tab is mounted. Raised
  // before the first network call (autofill needs the current sequence, so
  // signing has effectively already started) and lowered in `finally` so a
  // thrown/expired outcome still releases it (`withWriteInFlight`).
  return withWriteInFlight(network, node, async (client) => {
    // A `Fee` already on `tx` (Send pins the figure it showed) is left alone
    // by autofill; otherwise autofill computes one. Either way the cap below
    // is the only ceiling, and it is checked on what will actually be signed.
    const prepared = await client.autofill(tx)
    // Thrown inside `run`, so the in-flight depth is still lowered.
    if (!feeWithinCap(prepared.Fee)) throw new FeeAboveCapError(prepared.Fee)
    // Before the Signing Check, so no PIN or passkey prompt is wasted on a send the
    // ledger can only refuse. A failed read does not relax it.
    if (signing.signsAsMaster) await assertMasterKeyOn(network, signing.address, node)
    // The Signing Check runs HERE, after the fee was shown and capped and
    // before the window is fixed. It may take as long as the user does.
    const signer = await signing.open()
    let signed: { tx_blob: string; hash: string }
    let lastLedgerSequence: number | undefined
    // The validated ledger read for the window, moments before signing. With
    // no pause before sending, the past-LastLedgerSequence check uses it, so
    // the send makes no extra round trip.
    let validatedAtSigning: number | undefined
    try {
      // The window starts at the validated ledger as it is NOW, not as it was
      // at autofill. A caller-supplied `LastLedgerSequence` is kept.
      let toSign: SubmittableTransaction = prepared
      if (tx.LastLedgerSequence === undefined) {
        const res = await client.request({ command: 'ledger', ledger_index: 'validated' })
        const validated = res.result.ledger_index
        if (typeof validated !== 'number') throw new Error('The current ledger could not be read, so nothing was signed.')
        validatedAtSigning = validated
        toSign = { ...prepared, LastLedgerSequence: validated + LEDGER_WINDOW }
      }
      lastLedgerSequence = toSign.LastLedgerSequence
      signed = signer.sign(toSign)
    } finally {
      signer.dispose()
    }
    if (signing.reviewBeforeSending) {
      const send = await signing.reviewBeforeSending({ txBlob: signed.tx_blob, hash: signed.hash, network, lastLedgerSequence })
      if (!send) throw new TransmitDeclinedError(lastLedgerSequence)
      // Time passed: the window is judged on a fresh read.
      validatedAtSigning = undefined
    }
    return await transmit(
      client,
      network,
      signed,
      { signedNetwork: network, expectedAccount: signing.address, validatedIndex: validatedAtSigning },
      lastLedgerSequence,
      node,
    )
  })
}

/**
 * The in-flight depth and the held client around one write (AD-9, US-5). The
 * increment is the last statement before `try` and cannot throw, and the report
 * is inside the `try`, so nothing can raise the depth without the `finally`
 * lowering it.
 */
async function withWriteInFlight<T>(
  network: NetworkId,
  node: string | undefined,
  run: (client: Awaited<ReturnType<typeof holdXrplClient>>['client']) => Promise<T>,
): Promise<T> {
  inFlightDepth += 1
  let release: (() => void) | undefined
  try {
    if (inFlightDepth === 1) reportTxInFlight(true)
    // Held, not merely fetched: `submitAndWait` polls on this one client until
    // the transaction settles, so a read replacing it after a dropped socket
    // must not close it under the wait (see `holdXrplClient`).
    const held = await holdXrplClient(network, node)
    release = held.release
    return await run(held.client)
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

/**
 * The Transmit step for a Signed Transaction that was not signed here (a
 * scanned signed QR, story 4; OS-FR-9). Same in-flight signal, same checks
 * (the window on a fresh read), one submission, the same outcomes as every
 * other write. `expectedAccount` comes from `expectedAccountFor`; the caller
 * gets the user's confirm (P-27) before calling when that returns `null`.
 */
export function transmitSignedTransaction(
  network: NetworkId,
  signed: SignedTransaction,
  expectedAccount: string,
  node?: string,
): Promise<SubmitOutcome> {
  return withWriteInFlight(network, node, async (client) => {
    let hash: string
    try {
      hash = hashes.hashSignedTx(signed.txBlob)
    } catch {
      throw refuse('signature', REFUSAL.signature)
    }
    let lastLedgerSequence: number | undefined
    try {
      const value: unknown = decode(signed.txBlob).LastLedgerSequence
      if (typeof value === 'number') lastLedgerSequence = value
    } catch {
      // A blob that does not decode is refused by the checks below.
    }
    return transmit(
      client,
      network,
      { tx_blob: signed.txBlob, hash },
      { signedNetwork: signed.network, expectedAccount },
      lastLedgerSequence,
      node,
    )
  })
}

function refuse(reason: TransmitRefusal, detail?: string): TransmitRefusedError {
  if (reason === 'expired') return new TransmitRefusedError(reason, EXPIRED_NOTHING_SENT)
  return new TransmitRefusedError(reason, detail === undefined ? NOT_SENT : `${NOT_SENT} ${detail}`)
}

/**
 * The Transmit step's checks (route-checks.md, OS-FR-9), on the blob that will
 * be sent, before anything is submitted. Throws on the first that fails.
 * `validatedIndex` is the validated ledger as just read; when absent it is read
 * now, and a failed read refuses (a failed read never relaxes a guard).
 */
async function checkSignedTransaction(
  client: Awaited<ReturnType<typeof holdXrplClient>>['client'],
  network: NetworkId,
  txBlob: string,
  check: { signedNetwork: NetworkId; expectedAccount: string; validatedIndex?: number },
): Promise<void> {
  if (check.signedNetwork !== network) {
    throw refuse('network', fill(REFUSAL.network, NETWORKS[check.signedNetwork].label, NETWORKS[network].label))
  }
  let tx: Record<string, unknown>
  let verified = false
  try {
    tx = decode(txBlob)
    verified = verifySignature(txBlob)
  } catch {
    throw refuse('signature', REFUSAL.signature)
  }
  if (!verified) throw refuse('signature', REFUSAL.signature)
  // The Account it is signed for, never the signing key's own address: a
  // Regular Key signs for another Account (OS-FR-20), and the ledger itself
  // refuses a key that is not the master (when on) or the current Regular Key.
  if (tx.Account !== check.expectedAccount) {
    throw refuse('account', fill(REFUSAL.account, String(tx.Account), check.expectedAccount))
  }
  if (tx.TransactionType === 'Payment' && typeof tx.Flags === 'number' && (tx.Flags & PaymentFlags.tfPartialPayment) !== 0) {
    throw refuse('partial-payment', REFUSAL.partialPayment)
  }
  // Checked again on what is sent, whatever signed it (decisions §14).
  if (!feeWithinCap(tx.Fee)) throw new FeeAboveCapError(tx.Fee)
  const lastLedgerSequence = tx.LastLedgerSequence
  if (typeof lastLedgerSequence === 'number') {
    let validated = check.validatedIndex
    if (validated === undefined) {
      try {
        const res = await client.request({ command: 'ledger', ledger_index: 'validated' })
        if (typeof res.result.ledger_index === 'number') validated = res.result.ledger_index
      } catch {
        // Stated below as a refusal, never as "not expired".
      }
      // The P-26 heading alone: no approved sentence says why (story 2,
      // Implementation Notes). Nothing was submitted.
      if (validated === undefined) throw refuse('ledger-unread')
    }
    if (validated > lastLedgerSequence) throw refuse('expired')
  }
}

/**
 * The Transmit step's core (OS-FR-9): the one place a Signed Transaction is
 * submitted and its outcome classified, whatever signed it. Private, and only
 * ever called inside the in-flight depth a caller raised, on a client the
 * caller holds. It checks the blob, submits it once and never resubmits it.
 */
async function transmit(
  client: Awaited<ReturnType<typeof holdXrplClient>>['client'],
  network: NetworkId,
  signed: { tx_blob: string; hash: string },
  check: { signedNetwork: NetworkId; expectedAccount: string; validatedIndex?: number },
  lastLedgerSequence: number | undefined,
  node: string | undefined,
): Promise<SubmitOutcome> {
  await checkSignedTransaction(client, network, signed.tx_blob, check)
  try {
    const res = await client.submitAndWait(signed.tx_blob)
    const meta: unknown = res.result.meta
    // A meta that is missing, not an object (binary meta) or has no string
    // result is an unreadable outcome, never a failure: reading it as one
    // would invite a resend that pays twice.
    if (!isRecord(meta) || typeof meta.TransactionResult !== 'string' || meta.TransactionResult === '') return { status: 'unknown', hash: signed.hash }
    const resultCode = meta.TransactionResult
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
    if (await isExpiry(err, network, lastLedgerSequence, node)) {
      return { status: 'expired', hash: signed.hash }
    }
    throw err
  }
}

async function assertMasterKeyOn(network: NetworkId, account: string, node?: string): Promise<void> {
  let state
  try {
    state = await fetchAccountState(network, account, node)
  } catch (err) {
    throw new Error('The account could not be read to confirm its master key is on, so nothing was signed. Try again.', { cause: err })
  }
  if (state.exists && state.disableMasterKey) throw new MasterKeyOffError()
}

async function isExpiry(err: unknown, network: NetworkId, lastLedgerSequence?: number, node?: string): Promise<boolean> {
  // Read structurally, not by `instanceof XrplError` (see `narrow.ts`): an
  // expiry missed here would be rethrown as a failure.
  const { name, message } = isRecord(err) ? err : {}
  if (name === 'XrplError' && typeof message === 'string' && message.includes('LastLedgerSequence')) {
    return true
  }
  if (lastLedgerSequence === undefined) return false
  try {
    const client = await getXrplClient(network, node)
    const res = await client.request({ command: 'ledger', ledger_index: 'validated' })
    const validatedIndex = res.result.ledger_index
    return typeof validatedIndex === 'number' && validatedIndex > lastLedgerSequence
  } catch {
    return false
  }
}

export async function submitXrpPayment(
  network: NetworkId,
  signing: SigningHandle,
  params: {
    destination: string
    amountDrops: string
    destinationTag?: number
    /** The fee to sign, as a drops string — the figure the operator was shown.
     * Pinned on the transaction so autofill does not compute its own. Still
     * subject to the choke point's cap. */
    feeDrops?: string
  },
  node?: string,
): Promise<SubmitOutcome> {
  const tx: Payment = {
    TransactionType: 'Payment',
    Account: signing.address,
    Destination: params.destination,
    Amount: params.amountDrops,
    ...(params.destinationTag !== undefined ? { DestinationTag: params.destinationTag } : {}),
    ...(params.feeDrops !== undefined ? { Fee: params.feeDrops } : {}),
  }
  return submitAndClassify(network, signing, tx, node)
}

export async function submitIssuedPayment(
  network: NetworkId,
  signing: SigningHandle,
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
  node?: string,
): Promise<SubmitOutcome> {
  const tx: Payment = {
    TransactionType: 'Payment',
    Account: signing.address,
    Destination: params.destination,
    Amount: { currency: params.currency, issuer: params.issuer, value: params.value },
    ...(params.destinationTag !== undefined ? { DestinationTag: params.destinationTag } : {}),
    ...(params.feeDrops !== undefined ? { Fee: params.feeDrops } : {}),
  }
  return submitAndClassify(network, signing, tx, node)
}

export async function submitTrustSet(
  network: NetworkId,
  signing: SigningHandle,
  params: {
    currency: string
    issuer: string
    limit: string // "0" removes the line
    /** The fee to sign, as a drops string — the figure the operator was shown.
     * Pinned on the transaction so autofill does not compute its own. Still
     * subject to the choke point's cap. */
    feeDrops?: string
  },
  node?: string,
): Promise<SubmitOutcome> {
  const tx: TrustSet = {
    TransactionType: 'TrustSet',
    Account: signing.address,
    LimitAmount: { currency: params.currency, issuer: params.issuer, value: params.limit },
    // Holders should not let balances ripple through their trust lines —
    // rippling is for issuers. Without NoRipple a holder's balance can shift
    // as a side effect of unrelated payments between other parties.
    Flags: TrustSetFlags.tfSetNoRipple,
    ...(params.feeDrops !== undefined ? { Fee: params.feeDrops } : {}),
  }
  return submitAndClassify(network, signing, tx, node)
}

/** Sets the Account's single Regular Key (AD-29). `Account` is the Account the
 * handle signs for; the choke point is unchanged. */
export async function submitSetRegularKey(
  network: NetworkId,
  signing: SigningHandle,
  params: { regularKey: string },
  node?: string,
): Promise<SubmitOutcome> {
  const tx: SetRegularKey = {
    TransactionType: 'SetRegularKey',
    Account: signing.address,
    RegularKey: params.regularKey,
  }
  return submitAndClassify(network, signing, tx, node)
}

/** Turns the Account's master key off (`SetFlag`) or on (`ClearFlag`), `asfDisableMaster`
 * (AD-29). `Account` is the Account the handle signs for; the choke point is unchanged. */
export async function submitMasterKeyFlag(
  network: NetworkId,
  signing: SigningHandle,
  params: { enable: boolean },
  node?: string,
): Promise<SubmitOutcome> {
  const tx: AccountSet = {
    TransactionType: 'AccountSet',
    Account: signing.address,
    ...(params.enable
      ? { ClearFlag: AccountSetAsfFlags.asfDisableMaster }
      : { SetFlag: AccountSetAsfFlags.asfDisableMaster }),
  }
  return submitAndClassify(network, signing, tx, node)
}

/** The current validated ledger's index (AD-30). Throws if it cannot be read. */
export async function validatedLedgerIndex(network: NetworkId, node?: string): Promise<number> {
  const held = await holdXrplClient(network, node)
  try {
    const res = await held.client.request({ command: 'ledger', ledger_index: 'validated' })
    const index = res.result.ledger_index
    if (typeof index !== 'number') throw new Error('The current ledger could not be read.')
    return index
  } finally {
    held.release()
  }
}

/**
 * Builds a transaction for another device to sign (AD-30): autofill (Sequence,
 * Fee), the fee cap, then `LastLedgerSequence` set explicitly to the validated
 * ledger plus `TWO_DEVICE_LEDGER_WINDOW`. Nothing is signed or submitted.
 * `Fee`, if the caller set one, is left alone and still capped.
 */
export async function prepareUnsigned(
  network: NetworkId,
  tx: SubmittableTransaction,
  node?: string,
): Promise<SubmittableTransaction> {
  const held = await holdXrplClient(network, node)
  try {
    const prepared = await held.client.autofill(tx)
    if (!feeWithinCap(prepared.Fee)) throw new FeeAboveCapError(prepared.Fee)
    const res = await held.client.request({ command: 'ledger', ledger_index: 'validated' })
    const validated = res.result.ledger_index
    if (typeof validated !== 'number') throw new Error('The current ledger could not be read, so nothing was built.')
    return { ...prepared, LastLedgerSequence: validated + TWO_DEVICE_LEDGER_WINDOW }
  } finally {
    held.release()
  }
}

/**
 * Signs an already-prepared transaction once, on the offline device (AD-30). It
 * opens the Wallet's Signing Check, signs, and disposes the Signer in `finally`.
 * No network is used. Refuses a fee over the cap, or an `Account` that is not
 * the handle's. Returns the blob only; nothing is submitted.
 */
export async function signPrepared(signing: SigningHandle, tx: SubmittableTransaction): Promise<{ tx_blob: string; hash: string }> {
  if (!feeWithinCap(tx.Fee)) throw new FeeAboveCapError(tx.Fee)
  if (tx.Account !== signing.address) throw new Error('This transaction is not for this wallet’s account. Nothing was signed.')
  const signer = await signing.open()
  try {
    return signer.sign(tx)
  } finally {
    signer.dispose()
  }
}

/**
 * Submits a blob another device signed (AD-30), through the one choke point
 * unchanged: the Signer returns the received blob instead of signing, so the
 * fee cap, in-flight signal and classification all still apply. `tx` is the
 * unsigned transaction the blob was verified to equal, with its own Fee,
 * Sequence and `LastLedgerSequence`, which autofill and the choke point leave alone.
 */
export function submitSignedBlob(
  network: NetworkId,
  tx: SubmittableTransaction,
  txBlob: string,
  node?: string,
): Promise<SubmitOutcome> {
  const signing: SigningHandle = {
    address: tx.Account,
    open: async () => ({
      sign: () => ({ tx_blob: txBlob, hash: hashes.hashSignedTx(txBlob) }),
      dispose: () => {},
    }),
  }
  return submitAndClassify(network, signing, tx, node)
}
