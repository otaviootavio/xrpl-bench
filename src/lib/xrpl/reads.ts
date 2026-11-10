import { getXrplClient } from './client'
import { isPositiveDrops, isPositiveLedgerDecimalString } from './money'
import { isRecord, rippledErrorCode } from './narrow'
import type { NetworkId } from './networks'

export interface AccountState {
  exists: boolean
  address: string
  balanceDrops: string
  ownerCount: number
  sequence: number
  requireDestTag: boolean
  disableMasterKey: boolean
  regularKey?: string
}

/** Wraps `account_info`. Returns exists:false (never throws) for an
 * unfunded/not-yet-activated address — see account-onboarding.md US-4. */
export async function fetchAccountState(network: NetworkId, address: string, node?: string): Promise<AccountState> {
  const client = await getXrplClient(network, node)
  try {
    const res = await client.request({ command: 'account_info', account: address, ledger_index: 'validated' })
    const data = res.result.account_data
    const flags = data.Flags ?? 0
    // lsfRequireDestTag = 0x00020000, lsfDisableMaster = 0x00100000
    return {
      exists: true,
      address,
      balanceDrops: data.Balance ?? '0',
      ownerCount: data.OwnerCount ?? 0,
      sequence: data.Sequence ?? 0,
      requireDestTag: (flags & 0x00020000) !== 0,
      disableMasterKey: (flags & 0x00100000) !== 0,
      regularKey: data.RegularKey,
    }
  } catch (err: unknown) {
    if (rippledErrorCode(err) === 'actNotFound') {
      return {
        exists: false,
        address,
        balanceDrops: '0',
        ownerCount: 0,
        sequence: 0,
        requireDestTag: false,
        disableMasterKey: false,
      }
    }
    throw err
  }
}

export interface TrustLine {
  account: string // issuer
  currency: string
  balance: string
  limit: string
  limitPeer: string
  noRipple: boolean
  /** THIS account froze the line. */
  freeze: boolean
  /** The PEER (i.e. the issuer, from a holder's perspective) froze the line.
   * This — not `freeze` — is the "frozen by issuer" case that
   * docs/decisions.md §2 wants badged and blocked from sending. See
   * xrpl.js `AccountLinesTrustline`: `freeze` = "this account has frozen this
   * trust line", `freeze_peer` = "the peer account has frozen this trust line". */
  freezePeer: boolean
}

/** Wraps `account_lines`, following `marker` to completion — the response is
 * paginated (~200 lines per page), and stopping at the first page silently
 * under-reported balances, tokens and the Send asset picker for any account
 * with more trust lines than that. */
export async function fetchAccountLines(network: NetworkId, address: string, node?: string): Promise<TrustLine[]> {
  const client = await getXrplClient(network, node)
  try {
    const lines: TrustLine[] = []
    let marker: unknown = undefined
    do {
      const res = await client.request({
        command: 'account_lines',
        account: address,
        ledger_index: 'validated',
        marker,
      })
      for (const l of res.result.lines) {
        lines.push({
          account: l.account,
          currency: l.currency,
          balance: l.balance,
          limit: l.limit,
          limitPeer: l.limit_peer,
          noRipple: !!l.no_ripple,
          freeze: !!l.freeze,
          freezePeer: !!l.freeze_peer,
        })
      }
      marker = res.result.marker
    } while (marker !== undefined)
    return lines
  } catch (err: unknown) {
    if (rippledErrorCode(err) === 'actNotFound') return []
    throw err
  }
}

/** One delegate of an Account (OS-FR-22): who may act, and the permissions the
 * ledger names (transaction types or granular permissions), as written there. */
export interface AccountDelegate {
  authorize: string
  permissions: string[]
}

/**
 * Wraps `account_objects` of type `delegate` (XLS-75, `PermissionDelegationV1_1`),
 * following `marker` to completion. `actNotFound` is an Account with no delegates;
 * every other error (a server that does not know the type included) is a failed
 * read and is thrown, so it is shown as unknown, never as "none".
 */
export async function fetchAccountDelegates(network: NetworkId, address: string, node?: string): Promise<AccountDelegate[]> {
  const client = await getXrplClient(network, node)
  try {
    const delegates: AccountDelegate[] = []
    let marker: unknown = undefined
    // Every page reads the ledger the first page read: a later validated ledger could
    // move entries between pages, so one is listed twice or not at all.
    let ledger: number | 'validated' = 'validated'
    do {
      const res: { result: { account_objects: unknown[]; marker?: unknown; ledger_index?: number } } = await client.request({
        command: 'account_objects',
        account: address,
        type: 'delegate',
        ledger_index: ledger,
        marker,
      })
      const pinned = res.result.ledger_index
      if (ledger === 'validated' && typeof pinned === 'number') ledger = pinned
      for (const o of res.result.account_objects) {
        if (!isRecord(o) || o.LedgerEntryType !== 'Delegate' || o.Account !== address || typeof o.Authorize !== 'string') continue
        if (delegates.some((d) => d.authorize === o.Authorize)) continue
        const permissions = Array.isArray(o.Permissions)
          ? o.Permissions.flatMap((p: unknown) => {
              const value = isRecord(p) && isRecord(p.Permission) ? p.Permission.PermissionValue : undefined
              return typeof value === 'string' || typeof value === 'number' ? [String(value)] : []
            })
          : []
        delegates.push({ authorize: o.Authorize, permissions })
      }
      marker = res.result.marker
    } while (marker !== undefined)
    return delegates
  } catch (err: unknown) {
    if (rippledErrorCode(err) === 'actNotFound') return []
    throw err
  }
}

export interface ServerReserves {
  baseReserveDrops: string
  ownerReserveDrops: string
}

/** Wraps `server_state` for live reserve values (never hardcoded — they can
 * change via network amendment; see docs/user-stories/INDEX.md Quick Reference). */
export async function fetchServerReserves(network: NetworkId, node?: string): Promise<ServerReserves> {
  const client = await getXrplClient(network, node)
  const res = await client.request({ command: 'server_state' })
  const vl = res.result.state.validated_ledger
  // A syncing node has no validated ledger, so no reserve to report. A
  // remembered default would be a figure the ledger never stated, shown and
  // guarded on as if read: the read fails instead, and every consumer fails closed.
  if (vl?.reserve_base == null || vl.reserve_inc == null) {
    throw new Error('The node has no validated ledger, so the reserves could not be read.')
  }
  return {
    baseReserveDrops: String(vl.reserve_base),
    ownerReserveDrops: String(vl.reserve_inc),
  }
}

/** Wraps `fee` for the current recommended open-ledger fee, in drops. */
export async function fetchRecommendedFeeDrops(network: NetworkId, node?: string): Promise<string> {
  const client = await getXrplClient(network, node)
  const res = await client.request({ command: 'fee' })
  return res.result.drops.open_ledger_fee
}

export interface TxSummary {
  hash: string
  type: string
  direction: 'sent' | 'received'
  counterparty: string
  amountDrops?: string
  amountIssued?: { currency: string; issuer: string; value: string }
  /** True when the figure is NOT a known delivered amount but the requested
   * `DeliverMax`/`Amount` shown in its place — an UPPER BOUND, not what
   * actually arrived. Set for every Payment without a positive, well-formed
   * `delivered_amount`: the legacy `"unavailable"`, a missing field, a zero or
   * negative figure, a malformed one, and any failed (non-`tesSUCCESS`)
   * Payment, where nothing arrived at all. See `paymentAmountOf`. */
  amountIsUpperBound?: boolean
  /** Unix epoch seconds, or undefined when the ledger didn't supply a date
   * (rendering 0 would date the row to 1970/2000). */
  date?: number
  validated: boolean
  resultCode: string
  ledgerIndex?: number
  destinationTag?: number
  feeDrops?: string
}

/** The fields `fetchAccountTx` reads off a listed transaction. Each is a type
 * every xrpl.js `Transaction` already satisfies, so an entry is assigned to
 * this view, not cast. */
interface ListedTx {
  Account: string
  TransactionType: string
  Destination?: string
  DestinationTag?: number
  Fee?: string
  hash?: string
  date?: number
}

/** An `account_tx` entry under either API version: v2 nests the transaction
 * in `tx_json` beside `hash`, v1 in `tx`. */
interface ListedEntry {
  tx_json?: ListedTx
  tx?: ListedTx
  hash?: string
}

/** Wraps `account_tx`, paginated via `marker`.
 *
 * `actNotFound` on the FIRST page is an empty history, not a failed read — the
 * same not-activated ≠ failed distinction `fetchAccountState` and
 * `fetchAccountLines` already draw. A server that answers an unactivated
 * address that way would otherwise have History call every new wallet "could
 * not be read", and the incoming-payment watch retry a read that has nothing to
 * fail about.
 *
 * On a continuation page (`marker` set) it is rethrown: the account had history
 * a page ago, so "not found" there is not "nothing more", and answering empty
 * with no marker would end the list early and make it look complete. */
export async function fetchAccountTx(
  network: NetworkId,
  address: string,
  marker?: unknown,
  node?: string,
): Promise<{ items: TxSummary[]; marker?: unknown }> {
  const client = await getXrplClient(network, node)
  let res
  try {
    res = await client.request({
      command: 'account_tx',
      account: address,
      ledger_index_min: -1,
      ledger_index_max: -1,
      limit: 25,
      marker,
    })
  } catch (err: unknown) {
    if (marker === undefined && rippledErrorCode(err) === 'actNotFound') return { items: [], marker: undefined }
    throw err
  }

  const items: TxSummary[] = []
  for (const entry of res.result.transactions) {
    // xrpl.js normalizes responses to API-v2-style `tx_json`, where the
    // legacy `Amount` field on a Payment is named `DeliverMax` (the amount
    // renamed to disambiguate from the actual `delivered_amount` in meta,
    // which differs for partial payments) — verified live against the
    // testnet 2026-08-31; older/raw rippled responses may still use `tx`
    // and `Amount`, so both are supported here. xrpl.js types the entry for
    // v2 only (`tx` is `never`), so it is read through `ListedEntry`, which
    // admits both, rather than cast.
    const listed: ListedEntry = entry
    const tx = listed.tx_json ?? listed.tx
    const meta = entry.meta
    if (!tx) continue
    // A row whose meta is missing, `null` or carries no `TransactionResult` is
    // kept, never skipped: a skipped row makes the page look complete when it
    // is not. A validated one is marked `'unknown'` ("Result not read"), never
    // `''` (which reads as "Failed"); an unvalidated one stays Pending.
    const validated = !!entry.validated
    const readCode = isRecord(meta) && typeof meta.TransactionResult === 'string' && meta.TransactionResult !== '' ? meta.TransactionResult : undefined
    // Every transaction type this account was involved in is listed, not just
    // Payments. Filtering to Payment hid the wallet's own TrustSet activity
    // entirely, and made `limit`-based pagination return near-empty pages.
    const isSender = tx.Account === address
    items.push({
      hash: listed.hash ?? tx.hash ?? '',
      type: tx.TransactionType,
      direction: isSender ? 'sent' : 'received',
      counterparty: isSender ? (tx.Destination ?? '') : tx.Account,
      ...paymentAmountOf(tx, meta),
      date: typeof tx.date === 'number' ? tx.date + 946684800 : undefined, // ripple epoch -> unix epoch
      validated,
      resultCode: readCode ?? (validated ? 'unknown' : ''),
      ledgerIndex: entry.ledger_index ?? undefined,
      destinationTag: tx.DestinationTag,
      feeDrops: tx.Fee,
    })
  }
  return { items, marker: res.result.marker }
}

/** Wraps `tx` for a single transaction's full detail. The raw response is
 * returned unchanged, with the same normalised payment amount `fetchAccountTx`
 * produces laid beside it — so no caller ever reads a raw `DeliverMax` as if
 * it arrived. There is no account here, so there is no direction. */
export async function fetchTx(network: NetworkId, hash: string, node?: string) {
  const client = await getXrplClient(network, node)
  const res = await client.request({ command: 'tx', transaction: hash })
  // API v2 nests the transaction under `tx_json`; v1 lays it flat on `result`.
  // Typed as the two fields read, so a v1 response (no `tx_json`) is admitted
  // without a cast; `paymentAmountOf` checks whatever arrives.
  const result: { tx_json?: unknown; meta?: unknown } | undefined = res.result
  const tx = result?.tx_json ?? result
  return { ...res, ...paymentAmountOf(tx, result?.meta) }
}

export type PaymentAmount = Pick<TxSummary, 'amountDrops' | 'amountIssued' | 'amountIsUpperBound'>

type IssuedAmount = NonNullable<TxSummary['amountIssued']>

/** An issued-currency amount object with all three fields as strings. MPT
 * amounts (`mpt_issuance_id`) have no currency/issuer and are not rendered. */
function asIssued(value: unknown): IssuedAmount | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { currency, issuer, value: v } = value as Record<string, unknown>
  if (typeof currency !== 'string' || typeof issuer !== 'string' || typeof v !== 'string') return undefined
  return { currency, issuer, value: v }
}

/** Maps a raw ledger amount (drops string or issued object) to the summary
 * fields, dropping anything that is neither. */
function toSummaryAmount(amount: unknown): Pick<TxSummary, 'amountDrops' | 'amountIssued'> {
  if (typeof amount === 'string') return { amountDrops: amount }
  const issued = asIssued(amount)
  return issued ? { amountIssued: issued } : {}
}

/**
 * The one place that decides what figure a Payment shows and whether that
 * figure is exact (FR-57, docs/agents/money.md).
 *
 * Only a successful Payment with a POSITIVE, well-formed `delivered_amount` is
 * exact: drops by `BigInt > 0n`, an issued `value` by string inspection that
 * also accepts the ledger's exponent notation. Anything else — the legacy
 * `"unavailable"`, a missing, zero, negative or malformed field, or a failed
 * Payment (which delivers nothing) — falls back to the requested
 * `DeliverMax`/`Amount`, flagged as an upper bound. A non-Payment gets no
 * amount and no flag.
 */
export function paymentAmountOf(tx: unknown, meta: unknown): PaymentAmount {
  if (!isRecord(tx) || tx.TransactionType !== 'Payment') return {}
  const m = isRecord(meta) ? meta : {}
  const succeeded = m.TransactionResult === 'tesSUCCESS'
  const delivered = m.delivered_amount

  if (succeeded) {
    if (isPositiveDrops(delivered)) return { amountDrops: delivered }
    const issued = asIssued(delivered)
    if (issued && isPositiveLedgerDecimalString(issued.value)) return { amountIssued: issued }
  }

  return { ...toSummaryAmount(tx.DeliverMax ?? tx.Amount), amountIsUpperBound: true }
}
