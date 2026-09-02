import { getXrplClient } from './client'
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
  /** True when the ledger could not tell us the exact delivered amount
   * (`delivered_amount: "unavailable"`, only possible for very old partial
   * payments). The amount shown is then an UPPER BOUND, not what actually
   * arrived — the skill's security guidance says to treat it as partial. */
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
    const isPayment = tx.TransactionType === 'Payment'
    const delivered = (meta as any).delivered_amount
    const deliveredUnavailable = delivered === 'unavailable'
    const amount = isPayment ? (delivered && !deliveredUnavailable ? delivered : (tx.DeliverMax ?? tx.Amount)) : undefined
    items.push({
      hash: (entry as any).hash ?? tx.hash ?? '',
      type: tx.TransactionType,
      direction: isSender ? 'sent' : 'received',
      counterparty: isSender ? (tx.Destination ?? '') : tx.Account,
      amountDrops: typeof amount === 'string' ? amount : undefined,
      amountIssued:
        typeof amount === 'object' && amount
          ? { currency: amount.currency, issuer: amount.issuer, value: amount.value }
          : undefined,
      amountIsUpperBound: isPayment && deliveredUnavailable ? true : undefined,
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

/** Wraps `tx` for a single transaction's full detail. */
export async function fetchTx(network: NetworkId, hash: string) {
  const client = await getXrplClient(network)
  return client.request({ command: 'tx', transaction: hash })
}
