import { getXrplClient } from './client'
import { isPositiveDrops, isPositiveLedgerDecimalString } from './money'
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
export async function fetchAccountState(network: NetworkId, address: string): Promise<AccountState> {
  const client = await getXrplClient(network)
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
  } catch (err: any) {
    if (err?.data?.error === 'actNotFound') {
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
export async function fetchAccountLines(network: NetworkId, address: string): Promise<TrustLine[]> {
  const client = await getXrplClient(network)
  try {
    const lines: TrustLine[] = []
    let marker: unknown = undefined
    do {
      const res = await client.request({
        command: 'account_lines',
        account: address,
        ledger_index: 'validated',
        marker: marker as never,
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
  } catch (err: any) {
    if (err?.data?.error === 'actNotFound') return []
    throw err
  }
}

export interface ServerReserves {
  baseReserveDrops: string
  ownerReserveDrops: string
}

/** Wraps `server_state` for live reserve values (never hardcoded — they can
 * change via network amendment; see docs/user-stories/INDEX.md Quick Reference). */
export async function fetchServerReserves(network: NetworkId): Promise<ServerReserves> {
  const client = await getXrplClient(network)
  const res = await client.request({ command: 'server_state' })
  const vl = res.result.state.validated_ledger
  return {
    baseReserveDrops: String(vl?.reserve_base ?? 1_000_000),
    ownerReserveDrops: String(vl?.reserve_inc ?? 200_000),
  }
}

/** Wraps `fee` for the current recommended open-ledger fee, in drops. */
export async function fetchRecommendedFeeDrops(network: NetworkId): Promise<string> {
  const client = await getXrplClient(network)
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

/** Wraps `account_tx`, paginated via `marker`. */
export async function fetchAccountTx(
  network: NetworkId,
  address: string,
  marker?: unknown,
): Promise<{ items: TxSummary[]; marker?: unknown }> {
  const client = await getXrplClient(network)
  const res = await client.request({
    command: 'account_tx',
    account: address,
    ledger_index_min: -1,
    ledger_index_max: -1,
    limit: 25,
    marker: marker as never,
  })

  const items: TxSummary[] = []
  for (const entry of res.result.transactions) {
    // xrpl.js normalizes responses to API-v2-style `tx_json`, where the
    // legacy `Amount` field on a Payment is named `DeliverMax` (the amount
    // renamed to disambiguate from the actual `delivered_amount` in meta,
    // which differs for partial payments) — verified live against the
    // testnet 2026-08-31; older/raw rippled responses may still use `tx`
    // and `Amount`, so both are supported here.
    const tx = (entry as any).tx_json ?? (entry as any).tx
    const meta = entry.meta
    if (!tx || typeof meta !== 'object') continue
    // Every transaction type this account was involved in is listed, not just
    // Payments. Filtering to Payment hid the wallet's own TrustSet activity
    // entirely, and made `limit`-based pagination return near-empty pages.
    const isSender = tx.Account === address
    items.push({
      hash: (entry as any).hash ?? tx.hash ?? '',
      type: tx.TransactionType,
      direction: isSender ? 'sent' : 'received',
      counterparty: isSender ? (tx.Destination ?? '') : tx.Account,
      ...paymentAmountOf(tx, meta),
      date: typeof tx.date === 'number' ? tx.date + 946684800 : undefined, // ripple epoch -> unix epoch
      validated: !!entry.validated,
      resultCode: typeof meta === 'object' ? (meta as any).TransactionResult ?? '' : '',
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
export async function fetchTx(network: NetworkId, hash: string) {
  const client = await getXrplClient(network)
  const res = await client.request({ command: 'tx', transaction: hash })
  // API v2 nests the transaction under `tx_json`; v1 lays it flat on `result`.
  const result = res.result as any
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
export function paymentAmountOf(tx: any, meta: unknown): PaymentAmount {
  if (!tx || tx.TransactionType !== 'Payment') return {}
  const m = typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>) : {}
  const succeeded = m.TransactionResult === 'tesSUCCESS'
  const delivered = m.delivered_amount

  if (succeeded) {
    if (isPositiveDrops(delivered)) return { amountDrops: delivered }
    const issued = asIssued(delivered)
    if (issued && isPositiveLedgerDecimalString(issued.value)) return { amountIssued: issued }
  }

  return { ...toSummaryAmount(tx.DeliverMax ?? tx.Amount), amountIsUpperBound: true }
}
