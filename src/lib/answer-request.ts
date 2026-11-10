import type { QueryClient } from '@tanstack/react-query'
import { NETWORKS } from '@/lib/xrpl/networks'
import { queryKeys } from '@/lib/xrpl/query-keys'
import { fetchAccountStateFresh, fetchDestinationInfoOnce } from '@/lib/xrpl/query-reads'
import { fetchServerReserves, type AccountState } from '@/lib/xrpl/reads'
import { amountPlusFeeFits, formatXrp, reserveRequirementDrops, spendableAfterReserve } from '@/lib/xrpl/money'
import { FeeAboveCapError, prepareDataToSign, type DataToSignValues } from '@/lib/xrpl/writes'
import { encodeDataToSign, type RequestPayload } from '@/lib/qr-codec'
import type { TransmitterMeta } from '@/lib/crypto/keystore'
import { ANSWER_REFUSAL, SHIPPED } from '@/lib/offline-round-words'
import { fill } from '@/lib/transmit-words'

/**
 * The Transmitter Wallet's answer to a Data-to-Sign Request (OS-FR-15,
 * route-checks.md "Transmitter Wallet"). It answers whether Synced or not (the
 * request carries the address), runs online Send's pre-flight checks on that
 * address, refuses in online Send's words whatever online Send refuses, never
 * answers from a failed read, and puts its own Network in the Data to Sign. It
 * signs nothing.
 */
export type AnswerResult =
  | {
      status: 'answered'
      /** The Data to Sign QR. */
      text: string
      /** The Account of the answered request: the Transmit step's expected Account (OS-FR-9). */
      account: string
      values: DataToSignValues
      /** What passed, shown as the "Checked on {Network}" list (P-57). */
      checks: { tagSupplied: boolean; destinationExists: boolean }
    }
  /** A check refused, or the request is not for this Wallet: the words to show; no Data to Sign. */
  | { status: 'refused'; reason: string }
  /** A read failed: P-28 and "Read again"; no Data to Sign. */
  | { status: 'read-failed' }

export async function answerRequest(wallet: TransmitterMeta, request: RequestPayload, ctx: { queryClient: QueryClient }): Promise<AnswerResult> {
  const { network, node } = wallet
  // Its own Network only (OS-FR-15), and only its Synced address when it has one.
  if (request.network !== network) {
    return { status: 'refused', reason: fill(ANSWER_REFUSAL.network, NETWORKS[request.network].label, NETWORKS[network].label) }
  }
  if (wallet.address !== null && wallet.address !== request.account) {
    return { status: 'refused', reason: fill(ANSWER_REFUSAL.address, request.account, wallet.address) }
  }
  const { tx } = request
  if (tx.Destination === request.account) return { status: 'refused', reason: SHIPPED.selfSend }

  let state: AccountState
  let spendable: string
  try {
    state = await fetchAccountStateFresh(ctx.queryClient, network, request.account, node)
    if (!state.exists) return { status: 'refused', reason: SHIPPED.accountNotActivated }
    const reserves = await ctx.queryClient.fetchQuery({
      queryKey: queryKeys.serverReserves(network),
      queryFn: () => fetchServerReserves(network, node),
      staleTime: 0,
      networkMode: 'always',
    })
    spendable = spendableAfterReserve(state.balanceDrops, reserveRequirementDrops(reserves.baseReserveDrops, reserves.ownerReserveDrops, state.ownerCount))
  } catch {
    return { status: 'read-failed' }
  }

  let destination
  try {
    destination = await fetchDestinationInfoOnce(ctx.queryClient, network, tx.Destination, 'XRP', node)
  } catch {
    return { status: 'read-failed' }
  }
  if (destination.requireDestTag && tx.DestinationTag === undefined) return { status: 'refused', reason: SHIPPED.tagRequired }

  let values: DataToSignValues
  try {
    values = await prepareDataToSign(network, { ...tx }, node)
  } catch (err) {
    // The fee cap in online Send's own words; any other failure is a failed read.
    if (err instanceof FeeAboveCapError) return { status: 'refused', reason: err.message }
    return { status: 'read-failed' }
  }
  if (!amountPlusFeeFits(tx.Amount, values.fee, spendable)) {
    return { status: 'refused', reason: fill(SHIPPED.overSpendable, formatXrp(spendable)) }
  }

  const text = encodeDataToSign({
    network,
    requestId: request.request_id,
    buildHash: request.build_hash,
    sequence: values.sequence,
    fee: values.fee,
    ledgerIndex: values.ledgerIndex,
  }).text
  return {
    status: 'answered',
    text,
    account: request.account,
    values,
    checks: { tagSupplied: tx.DestinationTag !== undefined, destinationExists: destination.exists },
  }
}
