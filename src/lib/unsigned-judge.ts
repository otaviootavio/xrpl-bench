import { sha256 } from '@noble/hashes/sha2.js'
import { AccountSetAsfFlags, decode, encode, isValidClassicAddress, validate, type SubmittableTransaction } from 'xrpl'
import { NETWORKS, type NetworkId } from '@/lib/xrpl/networks'
import { compareDecimalStrings, feeWithinCap, isCanonicalPositiveDrops } from '@/lib/xrpl/money'
import { fieldValue } from '@/lib/tx-fields'
import { ASF_DISABLE_MASTER, decodeUnsignedForSigning, encodeSigned, isCurrencyCode, payloadKindOf, TF_SET_NO_RIPPLE } from '@/lib/qr-codec'
import { offlineSigningHandleFor, type SigningContext } from '@/lib/crypto/keystore'
import { signPrepared } from '@/lib/xrpl/writes'
import type { SignedRecord } from '@/lib/signed-list'
import { LEDGER_FLOORS, MAX_RECEIVED_LEDGER_INDEX, OFFLINE_LEDGER_WINDOW } from '@/lib/offline-window'
import { buildHashOf, LEDGER_JUMP_MARGIN, LEDGER_JUMP_SECONDS_PER_LEDGER, PAYLOAD_NAMES } from '@/lib/offline-round'
import { DATA_REFUSAL, RISKY, SIGN_REFUSAL, fillRisky } from '@/lib/offline-round-words'
import { WRONG_KIND } from '@/lib/transmitter-words'
import { fill } from '@/lib/transmit-words'

/**
 * The Offline Wallet's judgement of an Unsigned Transaction (OS-FR-18,
 * route-checks.md "Offline Wallet, Transmitter-builds route"). It reads nothing
 * from the ledger. It accepts only what it can show in words: an allow-list of
 * transaction types, of fields per type, of flags and of amount forms. Anything
 * else is refused, never shown in part. It refuses a Network that is not the
 * Wallet's, an Account the Wallet does not sign for, a pre-set signature, a Fee
 * over the cap and a partial payment. What it shows is the bundled codec's own
 * reading of the judged transaction (`decode(encode(tx))`), and that same object
 * is what `signJudged` signs, so the rows are what is signed.
 */

/** The window this app sets on both routes: a longer one is P-15. */
export const USUAL_WINDOW = OFFLINE_LEDGER_WINDOW

/** Fields every accepted type may carry. `Flags` is judged per type. */
/**
 * `Delegate` is not here (round two): a delegated transaction is signed by the delegate's key,
 * never this Wallet's, so this route refuses it as one it cannot show in words.
 */
const COMMON = ['TransactionType', 'Account', 'Fee', 'Sequence', 'LastLedgerSequence', 'Flags', 'Memos', 'TicketSequence', 'SourceTag'] as const

/** The types it can show in words, and their own fields: every write the app builds, and the risky fields route-checks names. */
const TYPE_FIELDS: Record<string, readonly string[]> = {
  // No DeliverMin: it is valid only with tfPartialPayment, which is refused (round two).
  Payment: ['Destination', 'Amount', 'DestinationTag', 'SendMax', 'Paths', 'InvoiceID'],
  TrustSet: ['LimitAmount', 'QualityIn', 'QualityOut'],
  SetRegularKey: ['RegularKey'],
  AccountSet: ['SetFlag', 'ClearFlag'],
}

/** The `Flags` bits it can show per type, by the ledger's own names (xrpl.js 5.1.0). `tfPartialPayment` is refused on its own. */
const TF_PARTIAL_PAYMENT = 0x00020000
const TYPE_FLAGS: Record<string, Record<string, number>> = {
  Payment: { tfNoRippleDirect: 0x00010000, tfPartialPayment: TF_PARTIAL_PAYMENT, tfLimitQuality: 0x00040000 },
  TrustSet: {
    tfSetfAuth: 0x00010000,
    tfSetNoRipple: TF_SET_NO_RIPPLE,
    tfClearNoRipple: 0x00040000,
    tfSetFreeze: 0x00100000,
    tfClearFreeze: 0x00200000,
    tfSetDeepFreeze: 0x00400000,
    tfClearDeepFreeze: 0x00800000,
  },
  AccountSet: {
    tfRequireDestTag: 0x00010000,
    tfOptionalDestTag: 0x00020000,
    tfRequireAuth: 0x00040000,
    tfOptionalAuth: 0x00080000,
    tfDisallowXRP: 0x00100000,
    tfAllowXRP: 0x00200000,
  },
  SetRegularKey: {},
}

/** Flags that cannot be undone once set (route-checks: `asfNoFreeze`, `asfAllowTrustLineClawback`, `tfSetfAuth`). */
const IRREVERSIBLE_ASF = new Set<number>([AccountSetAsfFlags.asfNoFreeze, AccountSetAsfFlags.asfAllowTrustLineClawback])
const IRREVERSIBLE_TF: Record<string, readonly string[]> = { TrustSet: ['tfSetfAuth'] }

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isUint32 = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 4294967295
const isAddress = (v: unknown): v is string => typeof v === 'string' && isValidClassicAddress(v)
const isDecimal = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && /^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(v)
const isHex = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length % 2 === 0 && /^[0-9A-Fa-f]+$/.test(v)

/** An issued amount it can show: a currency code, an issuer, a plain decimal value. */
function isIssued(v: unknown): v is { currency: string; issuer: string; value: string } {
  return (
    isPlainObject(v) &&
    Object.keys(v).length === 3 &&
    isCurrencyCode(v.currency) &&
    isAddress(v.issuer) &&
    isDecimal(v.value)
  )
}
/** A Payment amount: positive XRP drops, or a positive issued amount. Any other form (MPT, exponent) cannot be shown. */
const isPaymentAmount = (v: unknown): boolean => (typeof v === 'string' ? isCanonicalPositiveDrops(v) : isIssued(v) && /[1-9]/.test(v.value))

/** A memo's hex as text, or `null` when it is not valid UTF-8 (then it cannot be shown in words). */
function hexText(hex: string): string | null {
  try {
    const bytes = Uint8Array.from(hex.match(/../g)!, (b) => parseInt(b, 16))
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/**
 * Characters that can make a memo look like another review line or hide text: control
 * characters (new lines included), format characters (bidi overrides, zero-width), and line or
 * paragraph separators. A memo with any of them cannot be shown in words (round two).
 */
const SPOOFING = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u

/** The memo field names, as the ledger names them, in its order. */
const MEMO_PARTS = ['MemoType', 'MemoData', 'MemoFormat'] as const

/** Each memo's parts as text, `[field name, text]`, or `null` when any part cannot be read or shown. */
function memoParts(memos: unknown): Array<Array<[string, string]>> | null {
  if (!Array.isArray(memos) || memos.length === 0) return null
  const out: Array<Array<[string, string]>> = []
  for (const m of memos) {
    if (!isPlainObject(m) || Object.keys(m).length !== 1 || !isPlainObject(m.Memo)) return null
    const memo = m.Memo
    const keys = Object.keys(memo)
    if (keys.length === 0 || !keys.every((k) => (MEMO_PARTS as readonly string[]).includes(k))) return null
    const parts: Array<[string, string]> = []
    for (const k of MEMO_PARTS) {
      if (memo[k] === undefined) continue
      if (!isHex(memo[k])) return null
      const t = hexText(memo[k] as string)
      if (t === null || SPOOFING.test(t)) return null
      parts.push([k, t])
    }
    out.push(parts)
  }
  return out
}

function isPaths(v: unknown): boolean {
  if (!Array.isArray(v) || v.length === 0 || v.length > 6) return false
  return v.every(
    (path) =>
      Array.isArray(path) &&
      path.length > 0 &&
      path.length <= 8 &&
      path.every(
        (step) =>
          isPlainObject(step) &&
          Object.keys(step).length > 0 &&
          Object.entries(step).every(([k, s]) => (k === 'account' || k === 'issuer' ? isAddress(s) : k === 'currency' ? s === 'XRP' || isCurrencyCode(s) : false)),
      ),
  )
}

/** Whether a field's value is one it can show in words; `false` names that field in the refusal. */
function fieldShowable(name: string, value: unknown): boolean {
  switch (name) {
    case 'Destination':
    case 'RegularKey':
      return isAddress(value)
    case 'Amount':
    case 'SendMax':
      return isPaymentAmount(value)
    case 'LimitAmount':
      return isIssued(value)
    case 'DestinationTag':
    case 'SourceTag':
    case 'QualityIn':
    case 'QualityOut':
      return isUint32(value)
    case 'TicketSequence':
      return isUint32(value) && value > 0
    case 'InvoiceID':
      return typeof value === 'string' && /^[0-9A-Fa-f]{64}$/.test(value)
    case 'Paths':
      return isPaths(value)
    case 'Memos':
      return memoParts(value) !== null
    case 'SetFlag':
    case 'ClearFlag':
      return isUint32(value) && typeof (AccountSetAsfFlags as unknown as Record<number, unknown>)[value] === 'string'
    default:
      return true
  }
}

/** The names of the set bits of `flags` for this type, or `null` when a bit has no name here. */
function flagNames(type: string, flags: number): string[] | null {
  const known = TYPE_FLAGS[type] ?? {}
  const names: string[] = []
  let rest = flags >>> 0
  for (const [name, bit] of Object.entries(known)) {
    if ((rest & bit) >>> 0 === bit) {
      names.push(name)
      rest = (rest & ~bit) >>> 0
    }
  }
  return rest === 0 ? names : null
}

/** One row of the field list: the ledger's field name, its value in words, and the cautions under it (P-53). */
export interface FieldRow {
  name: string
  value: string
  cautions: string[]
}

export interface JudgedUnsigned {
  ok: true
  network: NetworkId
  /** The envelope's validated ledger index: P-13's window and P-14's reference. */
  ledgerIndex: number
  /** The transaction the rows show and `signJudged` signs: the codec's reading of the judged object. */
  tx: SubmittableTransaction
  rows: FieldRow[]
  /** LastLedgerSequence less the envelope's index (P-13); above `USUAL_WINDOW` is P-15. */
  window: number
  /** The Same Build hash of this transaction, matching the Offline-builds hash where the shapes agree. */
  buildHash: string
}

export type UnsignedJudgement = JudgedUnsigned | { ok: false; reason: string }

const refuse = (reason: string): UnsignedJudgement => ({ ok: false, reason })
const cannotShow = (name: string) => refuse(fill(SIGN_REFUSAL.cannotShow, name))

/**
 * Judges a scanned Unsigned Transaction for an Offline Wallet that signs for
 * `wallet.address` on `wallet.network`. Returns the reason in P-17's words (P-16
 * is the heading the screen puts above it), or the rows to show.
 */
export function judgeUnsigned(text: string, wallet: { network: NetworkId; address: string }): UnsignedJudgement {
  const kind = payloadKindOf(text)
  if (kind !== null && kind !== 'u') return refuse(fill(WRONG_KIND, PAYLOAD_NAMES[kind], PAYLOAD_NAMES.u))
  const decoded = decodeUnsignedForSigning(text)
  if (!decoded.ok) return refuse(DATA_REFUSAL.malformed)
  const { network, ledger_index: ledgerIndex, tx } = decoded.value
  if (network !== wallet.network) return refuse(fill(DATA_REFUSAL.network, NETWORKS[network].label, NETWORKS[wallet.network].label))
  if ('SigningPubKey' in tx || 'TxnSignature' in tx || 'Signers' in tx) return refuse(SIGN_REFUSAL.presigned)
  if (!isAddress(tx.Account)) return refuse(DATA_REFUSAL.malformed)
  if (tx.Account !== wallet.address) return refuse(fill(DATA_REFUSAL.account, tx.Account, wallet.address))

  const type = tx.TransactionType
  if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(TYPE_FIELDS, type)) {
    return cannotShow(typeof type === 'string' ? type : 'TransactionType')
  }
  const allowed = new Set<string>([...COMMON, ...TYPE_FIELDS[type]])
  for (const [name, value] of Object.entries(tx)) {
    if (!allowed.has(name)) return cannotShow(name)
    if (!fieldShowable(name, value)) return cannotShow(name)
  }
  let flagList: string[] = []
  if (tx.Flags !== undefined) {
    if (!isUint32(tx.Flags)) return cannotShow('Flags')
    const names = flagNames(type, tx.Flags)
    if (names === null) return cannotShow('Flags')
    flagList = names
  }
  // FR-58 unchanged: the app never signs a partial payment. Payment only: the same
  // bit is `tfSetNoRipple` on a TrustSet and `tfOptionalDestTag` on an AccountSet.
  if (type === 'Payment' && flagList.includes('tfPartialPayment')) return refuse(SIGN_REFUSAL.partialPayment)
  if (type === 'Payment' && (tx.Amount === undefined || tx.Destination === undefined)) return refuse(DATA_REFUSAL.malformed)
  if (type === 'TrustSet' && tx.LimitAmount === undefined) return refuse(DATA_REFUSAL.malformed)

  if (typeof tx.Fee !== 'string' || !isCanonicalPositiveDrops(tx.Fee)) return refuse(DATA_REFUSAL.malformed)
  if (!feeWithinCap(tx.Fee)) return refuse(DATA_REFUSAL.fee)
  // A Ticket replaces the Sequence, which is then 0; otherwise a Sequence is required.
  if (!isUint32(tx.Sequence)) return refuse(DATA_REFUSAL.malformed)
  if (tx.TicketSequence !== undefined ? tx.Sequence !== 0 : tx.Sequence === 0) return refuse(DATA_REFUSAL.malformed)
  // The window: a LastLedgerSequence above the index the Transmitter built on, inside UInt32.
  if (!isUint32(tx.LastLedgerSequence) || ledgerIndex > MAX_RECEIVED_LEDGER_INDEX || tx.LastLedgerSequence <= ledgerIndex) {
    return refuse(DATA_REFUSAL.malformed)
  }

  // What is shown is the bundled codec's reading of exactly this object, and the same
  // object is signed. Anything it cannot encode, or reads back differently, is refused.
  let shown: Record<string, unknown>
  try {
    shown = decode(encode(tx as unknown as SubmittableTransaction)) as unknown as Record<string, unknown>
  } catch {
    return refuse(DATA_REFUSAL.malformed)
  }
  // Letter case aside (the codec writes hex in upper case), the reading must be the same
  // object: a field dropped, added or changed in value is refused, never signed.
  if (JSON.stringify(canonical(shown)).toUpperCase() !== JSON.stringify(canonical(tx)).toUpperCase()) return refuse(DATA_REFUSAL.malformed)
  // What xrpl.js would refuse at signing never reaches the review (round two).
  try {
    validate(shown)
  } catch {
    return refuse(DATA_REFUSAL.malformed)
  }

  const rows = rowsOf(shown)
  return {
    ok: true,
    network,
    ledgerIndex,
    tx: shown as unknown as SubmittableTransaction,
    rows,
    window: (tx.LastLedgerSequence as number) - ledgerIndex,
    buildHash: sameBuildHashOf(shown),
  }
}

/** The rows in the codec's field order, each with its P-53 cautions. Each memo part is its own row. */
function rowsOf(tx: Record<string, unknown>): FieldRow[] {
  const type = tx.TransactionType as string
  const rows: FieldRow[] = []
  for (const [name, value] of Object.entries(tx)) {
    if (name === 'Memos') {
      for (const parts of memoParts(value) ?? []) {
        for (const [part, text] of parts) rows.push({ name: part, value: text, cautions: [fillRisky(RISKY.memo, text)] })
      }
      continue
    }
    const cautions: string[] = []
    const shown = fieldValue(name, value, type)
    switch (name) {
      case 'SendMax':
        // P-53's words say "more than the amount above": only when that is true.
        if (sendMaxAbove(value, tx.Amount)) cautions.push(fillRisky(RISKY.sendMax, shown))
        break
      case 'Paths':
        cautions.push(RISKY.paths)
        break
      case 'TicketSequence':
        cautions.push(RISKY.ticket)
        break
      case 'SetFlag':
        if (IRREVERSIBLE_ASF.has(value as number)) cautions.push(fillRisky(RISKY.irreversible, shown))
        break
      case 'Flags':
        for (const f of flagNames(type, value as number) ?? []) {
          if (IRREVERSIBLE_TF[type]?.includes(f)) cautions.push(fillRisky(RISKY.irreversible, f))
        }
        break
    }
    rows.push({ name, value: shown, cautions })
  }
  return rows
}

/** SendMax in the same asset as Amount and more than it. */
function sendMaxAbove(sendMax: unknown, amount: unknown): boolean {
  if (typeof sendMax === 'string' && typeof amount === 'string') return BigInt(sendMax) > BigInt(amount)
  if (isIssued(sendMax) && isIssued(amount)) {
    return sendMax.currency === amount.currency && sendMax.issuer === amount.issuer && compareDecimalStrings(sendMax.value, amount.value) > 0
  }
  return false
}

/**
 * The window as this device can state it (round two). The envelope's index is the Transmitter's
 * word: shifted up together with the LastLedgerSequence, it would hide a long window behind
 * "150 ledgers". So the window counts from the lower of that index and this device's own upper
 * bound for the current ledger: its highest seen index, else the Network's floor, plus the time
 * since at 3 s a ledger plus 30 (story 6's ledger-jump allowance, the bound P-14 already uses).
 * `longer` is P-15: more than the usual window.
 *
 * Why the upper bound, not a low estimate at ~4.5 s a ledger: Testnet closed a ledger every
 * ~3.3 s between the floor (2026-11-10) and the round-two browser pass (2026-11-14), so a low
 * estimate from a floor four days old was ~29,000 ledgers behind and showed P-15 and "1962
 * minutes" on a correct round. The upper bound never warns on a correct round; a shift the
 * Transmitter keeps inside P-14's allowance stays hidden (recorded in the story).
 */
export function windowOf(
  judged: Pick<JudgedUnsigned, 'tx' | 'ledgerIndex'>,
  seen: { index: number; at: number } | null,
  now: number,
  network: NetworkId,
): { ledgers: number; longer: boolean } {
  const reference = seen ?? LEDGER_FLOORS[network]
  const upper = reference.index + Math.ceil(Math.max(0, now - reference.at) / 1000 / LEDGER_JUMP_SECONDS_PER_LEDGER) + LEDGER_JUMP_MARGIN
  const ledgers = (judged.tx.LastLedgerSequence as number) - Math.min(upper, judged.ledgerIndex)
  return { ledgers, longer: ledgers > USUAL_WINDOW }
}

/** Keys sorted at every level, so two readings of one object compare equal. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical)
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = canonical(v[k])
    return out
  }
  return v
}

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
/** Values the Transmitter sets per round: they never make two transactions different Builds. */
const ROUND_FIELDS = new Set(['Account', 'Fee', 'Sequence', 'LastLedgerSequence', 'TicketSequence'])

/**
 * The Same Build hash of a transaction signed by this route (EXPERIENCE "Transmitter-builds
 * round": the signing joins the signed list, and Same Build detection applies on later Builds).
 * Where the transaction has exactly a shape the Offline-builds route makes, it is that route's
 * Build hash (`buildHashOf`), so a later Offline Build of the same payment, trust line or key
 * action shows P-19. Any other content (a token, a flag, a risky field) is hashed whole, less
 * the values set per round, under its own tag so it never equals an Offline Build's hash.
 */
export function sameBuildHashOf(tx: Record<string, unknown>): string {
  const keys = Object.keys(tx).filter((k) => !ROUND_FIELDS.has(k) && k !== 'TransactionType')
  const flags = tx.Flags === undefined ? 0 : tx.Flags
  const only = (...allowed: string[]) => keys.every((k) => allowed.includes(k))
  const account = tx.Account as string
  if (tx.TicketSequence === undefined) {
    if (tx.TransactionType === 'Payment' && flags === 0 && typeof tx.Amount === 'string' && only('Destination', 'Amount', 'DestinationTag', 'Flags')) {
      return buildHashOf({
        type: 'payment',
        account,
        destination: tx.Destination as string,
        amountDrops: tx.Amount,
        ...(tx.DestinationTag !== undefined ? { destinationTag: tx.DestinationTag as number } : {}),
      })
    }
    if (tx.TransactionType === 'TrustSet' && flags === TF_SET_NO_RIPPLE && only('LimitAmount', 'Flags')) {
      const l = tx.LimitAmount as { currency: string; issuer: string; value: string }
      return buildHashOf({ type: 'trust-line', account, currency: l.currency, issuer: l.issuer, limit: l.value })
    }
    if (tx.TransactionType === 'SetRegularKey' && flags === 0 && only('RegularKey', 'Flags')) {
      return buildHashOf({ type: 'regular-key', account, regularKey: (tx.RegularKey as string | undefined) ?? null })
    }
    if (tx.TransactionType === 'AccountSet' && flags === 0 && only('Flags', 'SetFlag', 'ClearFlag')) {
      if (tx.SetFlag === ASF_DISABLE_MASTER && tx.ClearFlag === undefined) return buildHashOf({ type: 'master-key', account, enable: false })
      if (tx.ClearFlag === ASF_DISABLE_MASTER && tx.SetFlag === undefined) return buildHashOf({ type: 'master-key', account, enable: true })
    }
  }
  const content: Record<string, unknown> = {}
  for (const k of Object.keys(tx)) if (!ROUND_FIELDS.has(k)) content[k] = tx[k]
  return toHex(sha256(new TextEncoder().encode(JSON.stringify(['Unsigned', canonical(content)]))))
}

/** The signed QR of this route and the facts its plate and the signed list state. The blob is held in memory only. */
export interface SignedUnsigned {
  text: string
  hash: string
  sequence: number
  fee: string
  lastLedgerSequence: number
  signedAt: number
}

/**
 * Signs the judged transaction once (OS-FR-18): the Offline Wallet's own handle
 * (refused for any other kind), then `writes.ts` `signPrepared`, which refuses a
 * fee over the cap or an Account that is not the handle's, runs the Signing Check
 * and disposes the Signer. The object signed is `judged.tx`, the one the rows
 * show. The envelope names the Wallet's Network (OS-FR-11). Throws
 * `SigningCheckError` when the check is dismissed or fails: nothing was signed.
 */
export async function signJudged(
  wallet: { id: string; network: NetworkId },
  judged: JudgedUnsigned,
  ctx: SigningContext,
  now: () => number = Date.now,
): Promise<SignedUnsigned> {
  const signing = await offlineSigningHandleFor(wallet.id, ctx)
  const signed = await signPrepared(signing, judged.tx)
  return {
    text: encodeSigned({ network: wallet.network, txBlob: signed.tx_blob }).text,
    hash: signed.hash,
    sequence: judged.tx.Sequence as number,
    fee: judged.tx.Fee as string,
    lastLedgerSequence: judged.tx.LastLedgerSequence as number,
    signedAt: now(),
  }
}

/** The signed list's record of this signing (OS-FR-16): no blob, no key. */
export function recordOfJudged(judged: JudgedUnsigned, signed: SignedUnsigned): SignedRecord {
  return {
    buildHash: judged.buildHash,
    sequence: signed.sequence,
    hash: signed.hash,
    lastLedgerSequence: signed.lastLedgerSequence,
    ledgerIndex: judged.ledgerIndex,
    signedAt: signed.signedAt,
    account: judged.tx.Account,
  }
}
