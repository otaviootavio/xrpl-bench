import { sha256 } from '@noble/hashes/sha2.js'
import type { SubmittableTransaction } from 'xrpl'
import { NETWORKS, type NetworkId } from '@/lib/xrpl/networks'
import { feeWithinCap } from '@/lib/xrpl/money'
import { signPrepared } from '@/lib/xrpl/writes'
import { offlineSigningHandleFor, type SigningContext } from '@/lib/crypto/keystore'
import { ASF_DISABLE_MASTER, decodeDataToSign, encodeRequest, encodeSigned, isCanonicalLimit, payloadKindOf, TF_SET_NO_RIPPLE, type DataToSignPayload, type KeyState, type PayloadKind, type SignerListState, type RequestTx } from '@/lib/qr-codec'
import { LEDGER_FLOORS, MAX_RECEIVED_LEDGER_INDEX, OFFLINE_LEDGER_WINDOW } from '@/lib/offline-window'
import { WRONG_KIND } from '@/lib/transmitter-words'
import { DATA_REFUSAL, SIGNER_LIST_VALUE } from '@/lib/offline-round-words'
import { NONE, VALUE_UNKNOWN } from '@/lib/transmitter-words'
import { fill } from '@/lib/transmit-words'
import type { SignedRecord } from '@/lib/signed-list'

/**
 * The Offline-builds round on the Offline Wallet (OS-FR-13 to OS-FR-16,
 * route-checks.md "Offline Wallet, Offline-builds route"). It never reads from or
 * sends to the ledger: the only values from the online device are the exact Data
 * to Sign set, and the signed transaction is made from the kept Build plus that
 * set, nothing else.
 */

export { OFFLINE_LEDGER_WINDOW } from '@/lib/offline-window'

/**
 * The ledger-jump warning (P-14, "~4 s per ledger plus an architecture margin";
 * decided in story 6): a received index may be at most `elapsed / 3 s` plus 30
 * ledgers above the highest seen. Three seconds, not four, so a run of fast
 * closes does not warn; 30 ledgers (about two minutes) for the clock and the
 * time the Transmitter took to answer. A warning, never a refusal.
 */
export const LEDGER_JUMP_SECONDS_PER_LEDGER = 3
export const LEDGER_JUMP_MARGIN = 30

/** What the user Built. Every Build names the Account the Wallet Signs for: the transaction's `Account`. */
export interface PaymentBuild {
  type: 'payment'
  account: string
  destination: string
  amountDrops: string
  destinationTag?: number
}
/** A TrustSet with the online screen's fields (story 8): add or change with a limit, close with "0". */
export interface TrustLineBuild {
  type: 'trust-line'
  account: string
  /** As typed (codes are case-sensitive): a 3-character code or 40 hex digits (not 00…). */
  currency: string
  issuer: string
  /** `canonicalLimit`'s form; "0" closes the line. */
  limit: string
}
/** Set (an address typed or scanned on this device, OS-FR-21) or remove (`null`) the Regular Key. */
export interface RegularKeyBuild {
  type: 'regular-key'
  account: string
  regularKey: string | null
}
/** Turn the master key off (`enable: false`, `SetFlag`) or on (`ClearFlag`). */
export interface MasterKeyBuild {
  type: 'master-key'
  account: string
  enable: boolean
}
export type OfflineBuild = PaymentBuild | TrustLineBuild | RegularKeyBuild | MasterKeyBuild

/** A key change: its Data to Sign carries the Account's key state, for display (route-checks). */
export function isKeyChange(build: OfflineBuild): build is RegularKeyBuild | MasterKeyBuild {
  return build.type === 'regular-key' || build.type === 'master-key'
}

/**
 * A typed trust-line limit in one canonical form, or `null` when it is not a plain
 * non-negative decimal an issued-currency amount can hold: leading zeros and trailing
 * fractional zeros dropped, "0" for zero. String operations only (money rule). The
 * same limit typed as "100" or "100.00" is one Build and one Build hash.
 */
export function canonicalLimit(typed: string): string | null {
  const t = typed.trim()
  if (!/^[0-9]*\.?[0-9]*$/.test(t) || !/[0-9]/.test(t)) return null
  let [int, frac = ''] = t.split('.')
  int = int.replace(/^0+/, '') || '0'
  frac = frac.replace(/0+$/, '')
  const out = frac ? `${int}.${frac}` : int
  if (!/[1-9]/.test(out)) return '0'
  return isCanonicalLimit(out) ? out : null
}

/** The Built transaction the request carries: the Build's fields only. */
export function builtTransaction(build: OfflineBuild): RequestTx {
  switch (build.type) {
    case 'payment':
      return {
        TransactionType: 'Payment',
        Account: build.account,
        Destination: build.destination,
        Amount: build.amountDrops,
        ...(build.destinationTag !== undefined ? { DestinationTag: build.destinationTag } : {}),
      }
    case 'trust-line':
      // The online TrustSet (`writes.ts` `submitTrustSet`): a holder's line with NoRipple.
      return {
        TransactionType: 'TrustSet',
        Account: build.account,
        LimitAmount: { currency: build.currency, issuer: build.issuer, value: build.limit },
        Flags: TF_SET_NO_RIPPLE,
      }
    case 'regular-key':
      return { TransactionType: 'SetRegularKey', Account: build.account, ...(build.regularKey !== null ? { RegularKey: build.regularKey } : {}) }
    case 'master-key':
      return build.enable
        ? { TransactionType: 'AccountSet', Account: build.account, ClearFlag: ASF_DISABLE_MASTER }
        : { TransactionType: 'AccountSet', Account: build.account, SetFlag: ASF_DISABLE_MASTER }
  }
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/**
 * The Build hash: SHA-256 of the Same Build content in one fixed order (glossary "Same
 * Build": type, destination, amount, token, tag, flags). The same Build typed again after
 * a lock has the same hash (story 7 compares it). A Payment's content is unchanged from
 * story 6, so records signed before story 8 still match. Each other type leads with its
 * own transaction type, so no two types share content, and carries every field it signs:
 * the trust line's currency, issuer, limit and flag; the new Regular Key (or none); which
 * master key flag. These are what make two Builds the same transaction (story 8).
 */
export function buildHashOf(build: OfflineBuild): string {
  let content: unknown[]
  switch (build.type) {
    case 'payment':
      content = ['Payment', build.destination, build.amountDrops, null, build.destinationTag ?? null, 0]
      break
    case 'trust-line':
      content = ['TrustSet', build.currency, build.issuer, build.limit, TF_SET_NO_RIPPLE]
      break
    case 'regular-key':
      content = ['SetRegularKey', build.regularKey]
      break
    case 'master-key':
      content = ['AccountSet', build.enable ? 'ClearFlag' : 'SetFlag', ASF_DISABLE_MASTER]
      break
  }
  return toHex(sha256(new TextEncoder().encode(JSON.stringify(content))))
}

/**
 * Whether W5 applies (EXPERIENCE "Approved strings": a Regular Key is set and the
 * transaction replaces it): a SetRegularKey that sets a key, when the key state says
 * another key is set. An unknown state shows P-29 and no W5: the app cannot say.
 */
export function replacesRegularKey(newKey: string | null | undefined, keyState: KeyState | undefined): boolean {
  if (!newKey || !keyState || keyState === 'unknown') return false
  return keyState.regular_key !== null && keyState.regular_key !== newKey
}

/** A signer list's value: "None.", "{n} signers, quorum {q}", or P-29 when unread. */
export function signerListWords(list: SignerListState): string {
  if (list === 'unknown') return VALUE_UNKNOWN
  if (list === null) return NONE
  return fill(SIGNER_LIST_VALUE, list.signers, list.quorum)
}

/** A new request ID: 16 random bytes. A new one for every request shown. */
export function newRequestId(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)))
}

/** The Data-to-Sign Request for a Build (OS-FR-14). */
export function requestText(network: NetworkId, build: OfflineBuild, requestId: string): string {
  return encodeRequest({ network, requestId, buildHash: buildHashOf(build), account: build.account, tx: builtTransaction(build) }).text
}

/** The request this Wallet is waiting for an answer to: `null` after a lock or before one is shown. */
export interface KeptRequest {
  requestId: string
  buildHash: string
}

/** The kinds' names in P-36's `{kind}` slots: the approved plate titles (2026-11-10) for
 * Data to Sign and the Signed Transaction, and the glossary's names for the other two, in lower case. */
export const PAYLOAD_NAMES: Record<PayloadKind, string> = {
  r: 'data-to-sign request',
  d: 'data to sign',
  s: 'signed transaction',
  u: 'unsigned transaction',
}

export type DataJudgement = { ok: true; data: DataToSignPayload } | { ok: false; reason: string }

/**
 * Judges a scanned Data to Sign (route-checks "Offline Wallet, Offline-builds
 * route"): the exact set (else malformed), the Wallet's own Network, the kept
 * request's ID and Build hash (any answer after a lock has none to match), the
 * fee cap, and the Account the Wallet Signs for. Returns the reason in P-17's
 * words; P-16 is the heading the screen puts above it.
 */
export function judgeDataToSign(
  text: string,
  wallet: { network: NetworkId; address: string },
  kept: KeptRequest | null,
  build: OfflineBuild | null,
): DataJudgement {
  // A code of another kind of this app: P-36 names both kinds (story 6 review).
  const kind = payloadKindOf(text)
  if (kind !== null && kind !== 'd') return { ok: false, reason: fill(WRONG_KIND, PAYLOAD_NAMES[kind], PAYLOAD_NAMES.d) }
  const decoded = decodeDataToSign(text)
  if (!decoded.ok) return { ok: false, reason: DATA_REFUSAL.malformed }
  const data = decoded.value
  // The exact set depends on the Build: a key change's Data to Sign carries the key state,
  // any other has none (route-checks "What travels by QR"). After a lock there is no Build,
  // and the request refusal below says so.
  if (build && (data.key_state !== undefined) !== isKeyChange(build)) return { ok: false, reason: DATA_REFUSAL.malformed }
  if (data.network !== wallet.network) {
    return { ok: false, reason: fill(DATA_REFUSAL.network, NETWORKS[data.network].label, NETWORKS[wallet.network].label) }
  }
  if (!kept || !build || data.request_id !== kept.requestId || data.build_hash !== kept.buildHash || buildHashOf(build) !== kept.buildHash) {
    return { ok: false, reason: DATA_REFUSAL.request }
  }
  if (!feeWithinCap(data.fee)) return { ok: false, reason: DATA_REFUSAL.fee }
  if (build.account !== wallet.address) return { ok: false, reason: fill(DATA_REFUSAL.account, build.account, wallet.address) }
  return { ok: true, data }
}

/**
 * The transaction the Offline Wallet signs: the kept Build plus Sequence and Fee
 * from the Data to Sign, and LastLedgerSequence set here from the received index
 * (OS-FR-16). No `NetworkID`: Mainnet, Testnet and Devnet omit it.
 */
export function assembleTransaction(build: OfflineBuild, data: Pick<DataToSignPayload, 'sequence' | 'fee' | 'ledger_index'>): SubmittableTransaction {
  // Bound again here: a LastLedgerSequence past UInt32 cannot be encoded (story 6 review).
  if (!Number.isInteger(data.ledger_index) || data.ledger_index < 1 || data.ledger_index > MAX_RECEIVED_LEDGER_INDEX) {
    throw new RangeError('The ledger index is out of range. Nothing was signed.')
  }
  // The key state, if any, is display only: it is never a value of the transaction.
  return {
    ...builtTransaction(build),
    Sequence: data.sequence,
    Fee: data.fee,
    LastLedgerSequence: data.ledger_index + OFFLINE_LEDGER_WINDOW,
  } as SubmittableTransaction
}

/**
 * The highest-seen ledger warning (P-14): `lower` when the received index is
 * below the highest this Wallet signed with, `too-high` when it is further above
 * it than the time since allows, `null` otherwise. Before this Wallet has signed
 * anything, the reference is the Network's floor baked into this build
 * (`LEDGER_FLOORS`), so a first answer is bounded too (story 6 review).
 */
export function ledgerJumpWarning(
  received: number,
  seen: { index: number; at: number } | null,
  now: number,
  network: NetworkId,
): 'lower' | 'too-high' | null {
  const reference = seen ?? LEDGER_FLOORS[network]
  if (received < reference.index) return 'lower'
  const elapsedSeconds = Math.max(0, (now - reference.at) / 1000)
  const allowed = Math.ceil(elapsedSeconds / LEDGER_JUMP_SECONDS_PER_LEDGER) + LEDGER_JUMP_MARGIN
  return received - reference.index > allowed ? 'too-high' : null
}

/** The signed QR and what its plate states. The blob is held in memory only, while the round lasts. */
export interface SignedRound {
  text: string
  hash: string
  sequence: number
  fee: string
  lastLedgerSequence: number
  signedAt: number
}

/**
 * Signs the assembled transaction once (OS-FR-16): the Offline Wallet's own
 * handle (refused for any other kind), then `writes.ts` `signPrepared`, which
 * refuses a fee over the cap or an Account that is not the handle's, runs the
 * Signing Check and disposes the Signer. Returns the signed QR, whose envelope
 * names the Wallet's Network (OS-FR-11). Throws `SigningCheckError` when the
 * check is dismissed or fails: nothing was signed then.
 */
export async function signRound(
  wallet: { id: string; network: NetworkId },
  build: OfflineBuild,
  data: Pick<DataToSignPayload, 'sequence' | 'fee' | 'ledger_index'>,
  ctx: SigningContext,
  now: () => number = Date.now,
): Promise<SignedRound> {
  const tx = assembleTransaction(build, data)
  const signing = await offlineSigningHandleFor(wallet.id, ctx, build.account)
  const signed = await signPrepared(signing, tx)
  return {
    text: encodeSigned({ network: wallet.network, txBlob: signed.tx_blob }).text,
    hash: signed.hash,
    sequence: tx.Sequence as number,
    fee: tx.Fee as string,
    lastLedgerSequence: tx.LastLedgerSequence as number,
    signedAt: now(),
  }
}

/** The signed list's record of one signing (OS-FR-16): no blob, no key. */
export function signedRecordOf(build: OfflineBuild, signed: SignedRound, ledgerIndex: number): SignedRecord {
  return {
    buildHash: buildHashOf(build),
    sequence: signed.sequence,
    hash: signed.hash,
    lastLedgerSequence: signed.lastLedgerSequence,
    ledgerIndex,
    signedAt: signed.signedAt,
    account: build.account,
  }
}

// ---------------------------------------------------------------------------
// The kept round: in memory only, per Wallet, erased when its lock closes
// (OS-FR-13, OS-FR-16: "Kept Build and its request ID live only while the Wallet
// is unlocked; a lock erases both"). Never persisted.
// ---------------------------------------------------------------------------

export type RoundPhase =
  /** Back on the form after "Change the transaction" (P-10), its values kept. */
  | { name: 'editing' }
  | { name: 'reviewed' }
  | { name: 'request'; requestId: string; notice?: 'not-signed' }
  /**
   * The signing review. `data` is the Data to Sign as received; `sequence` is the
   * one signed with: the received one, or the earlier signing's in retry case (c)
   * (`signed-list.ts` `retryCaseOf`). `retry` names the notice (P-21, P-22).
   */
  | {
      name: 'signing'
      requestId: string
      data: DataToSignPayload
      sequence: number
      warning: 'lower' | 'too-high' | null
      retry?: 'passed' | 'same-sequence'
    }
  /** Retry case (a), P-20: a higher Sequence was received for a Same Build. Nothing is signed yet. */
  | { name: 'retry-higher'; requestId: string; data: DataToSignPayload; warning: 'lower' | 'too-high' | null; earlier: SignedRecord }
  | { name: 'signed' }

export interface Round {
  lockId: string
  build: OfflineBuild
  phase: RoundPhase
  /** The last signing of this Build in this round (P-18's Kept transaction), kept
   * across "Start the request again" until the outcome is marked, cancelled or a
   * lock erases it. The signed QR's text lives here, in memory only. */
  kept?: SignedRound
}

const rounds = new Map<string, Round>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function roundOf(walletId: string): Round | null {
  return rounds.get(walletId) ?? null
}

export function setRound(walletId: string, round: Round): void {
  rounds.set(walletId, round)
  notify()
}

export function clearRound(walletId: string): void {
  if (rounds.delete(walletId)) notify()
}

/** A lock closed: every round of a Wallet on it is gone, Build, request ID and signed QR. */
export function eraseRoundsOfLocks(lockIds: readonly string[]): void {
  let changed = false
  for (const [walletId, round] of rounds) {
    if (lockIds.includes(round.lockId)) {
      rounds.delete(walletId)
      changed = true
    }
  }
  if (changed) notify()
}

export function subscribeRounds(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Test seam: no rounds. */
export function resetRounds(): void {
  rounds.clear()
  notify()
}
