import type { QueryClient } from '@tanstack/react-query'
import { NETWORKS } from '@/lib/xrpl/networks'
import { queryKeys } from '@/lib/xrpl/query-keys'
import { fetchAccountStateFresh, fetchDestinationInfoOnce } from '@/lib/xrpl/query-reads'
import { fetchAccountLines, fetchServerReserves, fetchSignerList, type AccountState, type TrustLine } from '@/lib/xrpl/reads'
import { amountPlusFeeFits, coversOwnerReserveAndFee, formatXrp, reserveRequirementDrops, spendableAfterReserve } from '@/lib/xrpl/money'
import { FeeAboveCapError, prepareDataToSign, type DataToSignValues } from '@/lib/xrpl/writes'
import type { SubmittableTransaction } from 'xrpl'
import {
  encodeDataToSign,
  type AccountSetRequestTx,
  type KeyState,
  type PaymentRequestTx,
  type RequestPayload,
  type RequestTx,
  type SetRegularKeyRequestTx,
  type SignerListState,
  type TrustSetRequestTx,
} from '@/lib/qr-codec'
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
/** What passed, shown as the "Checked on {Network}" list (P-57), per type. */
export type AnswerChecks =
  | { type: 'payment'; tagSupplied: boolean; destinationExists: boolean }
  /** `spendable`: the add guard ran (a new line takes an owner reserve). */
  | { type: 'trust-line'; spendable: boolean }
  | { type: 'key' }

export type AnswerResult =
  | {
      status: 'answered'
      /** The Data to Sign QR. */
      text: string
      /** The Account of the answered request: the Transmit step's expected Account (OS-FR-9). */
      account: string
      values: DataToSignValues
      checks: AnswerChecks
      /** The request's Built transaction, for the warnings the answer shows (W4, W5). */
      tx: RequestTx
      /** For a key change only: the Account's key state the Data to Sign carries (display). */
      keyState?: KeyState
    }
  /** A check refused, or the request is not for this Wallet: the words to show; no Data to Sign. */
  | { status: 'refused'; reason: string }
  /** A read failed: P-28 and "Read again"; no Data to Sign. */
  | { status: 'read-failed' }

type Ctx = { queryClient: QueryClient }
type Answered = Extract<AnswerResult, { status: 'answered' }>

export async function answerRequest(wallet: TransmitterMeta, request: RequestPayload, ctx: Ctx): Promise<AnswerResult> {
  const { network } = wallet
  // Its own Network only (OS-FR-15), and only its Synced address when it has one.
  if (request.network !== network) {
    return { status: 'refused', reason: fill(ANSWER_REFUSAL.network, NETWORKS[request.network].label, NETWORKS[network].label) }
  }
  if (wallet.address !== null && wallet.address !== request.account) {
    return { status: 'refused', reason: fill(ANSWER_REFUSAL.address, request.account, wallet.address) }
  }
  const { tx } = request
  switch (tx.TransactionType) {
    case 'Payment':
      return answerPayment(wallet, request, tx, ctx)
    case 'TrustSet':
      return answerTrustSet(wallet, request, tx, ctx)
    case 'SetRegularKey':
    case 'AccountSet':
      return answerKeyChange(wallet, request, tx, ctx)
  }
}

/** The Data to Sign values, or the refusal: the fee cap in the choke point's own words, any other failure a failed read. */
async function dataToSign(wallet: TransmitterMeta, tx: RequestTx): Promise<{ values: DataToSignValues } | AnswerResult> {
  try {
    return { values: await prepareDataToSign(wallet.network, { ...tx } as SubmittableTransaction, wallet.node) }
  } catch (err) {
    if (err instanceof FeeAboveCapError) return { status: 'refused', reason: err.message }
    return { status: 'read-failed' }
  }
}

function answered(wallet: TransmitterMeta, request: RequestPayload, values: DataToSignValues, checks: AnswerChecks, keyState?: KeyState): Answered {
  const text = encodeDataToSign({
    network: wallet.network,
    requestId: request.request_id,
    buildHash: request.build_hash,
    sequence: values.sequence,
    fee: values.fee,
    ledgerIndex: values.ledgerIndex,
    ...(keyState !== undefined ? { keyState } : {}),
  }).text
  return { status: 'answered', text, account: request.account, values, checks, tx: request.tx, ...(keyState !== undefined ? { keyState } : {}) }
}

function serverReserves(wallet: TransmitterMeta, ctx: Ctx) {
  return ctx.queryClient.fetchQuery({
    queryKey: queryKeys.serverReserves(wallet.network),
    queryFn: () => fetchServerReserves(wallet.network, wallet.node),
    staleTime: 0,
    networkMode: 'always',
  })
}

/** Online Send's pre-flight (story 6), unchanged. */
async function answerPayment(wallet: TransmitterMeta, request: RequestPayload, tx: PaymentRequestTx, ctx: Ctx): Promise<AnswerResult> {
  const { network, node } = wallet
  if (tx.Destination === request.account) return { status: 'refused', reason: SHIPPED.selfSend }

  let state: AccountState
  let spendable: string
  let baseReserve: string
  try {
    state = await fetchAccountStateFresh(ctx.queryClient, network, request.account, node)
    if (!state.exists) return { status: 'refused', reason: SHIPPED.accountNotActivated }
    const reserves = await serverReserves(wallet, ctx)
    baseReserve = reserves.baseReserveDrops
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
  // Below the base reserve, a destination not on the ledger is not created: the ledger
  // answers tecNO_DST_INSUF_XRP and the fee is burned (route-checks "reserve").
  if (!destination.exists && BigInt(tx.Amount) < BigInt(baseReserve)) {
    return { status: 'refused', reason: fill(SHIPPED.belowReserve, formatXrp(baseReserve)) }
  }

  const prepared = await dataToSign(wallet, tx)
  if (!('values' in prepared)) return prepared
  const { values } = prepared
  if (!amountPlusFeeFits(tx.Amount, values.fee, spendable)) {
    return { status: 'refused', reason: fill(SHIPPED.overSpendable, formatXrp(spendable)) }
  }
  return answered(wallet, request, values, { type: 'payment', tagSupplied: tx.DestinationTag !== undefined, destinationExists: destination.exists })
}

/**
 * The online trust-line screen's refusals (`TrustLinesTab`), on a fresh read. The
 * online screen offers "Add trust line" for a line that is not there and "Edit" or
 * "Close" for one that is; here the ledger says which: a line not on the ledger with a
 * limit above zero is an add, and gets the add guard (reserve, account, fee cap,
 * spendable covers one more owner reserve and the fee). Anything else gets the fee
 * guard only, as the edit and close dialogs do. Every read is fresh; any failed read
 * is P-28, never an answer (FR-59).
 */
async function answerTrustSet(wallet: TransmitterMeta, request: RequestPayload, tx: TrustSetRequestTx, ctx: Ctx): Promise<AnswerResult> {
  const { network, node } = wallet
  let state: AccountState
  let lines: TrustLine[]
  try {
    state = await fetchAccountStateFresh(ctx.queryClient, network, request.account, node)
    if (!state.exists) return { status: 'refused', reason: SHIPPED.trustLineNotActivated }
    lines = await ctx.queryClient.fetchQuery({
      queryKey: queryKeys.trustLines(network, request.account),
      // Every page (`marker` followed to the end): a list cut short would read as "no line".
      queryFn: () => fetchAccountLines(network, request.account, node),
      staleTime: 0,
      networkMode: 'always',
    })
  } catch {
    return { status: 'read-failed' }
  }
  const { currency, issuer, value } = tx.LimitAmount
  // Hex codes compare by value (rippled writes them in upper case); 3-character codes are case-sensitive.
  const sameCode = (c: string) => (currency.length === 40 ? c.toUpperCase() === currency.toUpperCase() : c === currency)
  const exists = lines.some((l) => l.account === issuer && sameCode(l.currency))
  const adds = !exists && value !== '0'

  let ownerReserve = '0'
  let spendable = '0'
  if (adds) {
    try {
      const reserves = await serverReserves(wallet, ctx)
      ownerReserve = reserves.ownerReserveDrops
      spendable = spendableAfterReserve(state.balanceDrops, reserveRequirementDrops(reserves.baseReserveDrops, reserves.ownerReserveDrops, state.ownerCount))
    } catch {
      return { status: 'read-failed' }
    }
  }
  const prepared = await dataToSign(wallet, tx)
  if (!('values' in prepared)) return prepared
  const { values } = prepared
  if (adds && !coversOwnerReserveAndFee(spendable, ownerReserve, values.fee)) return { status: 'refused', reason: SHIPPED.trustLineNotEnough }
  return answered(wallet, request, values, { type: 'trust-line', spendable: adds })
}

/**
 * A key change (Regular Key or master key). The app warns, never refuses, on key
 * actions (SPEC "Trust the user", OS-FR-21): the online screens' guards that this
 * feature replaces ("no Regular Key yet", "already off", "no wallet here holds the
 * Regular Key", "master key turned off") are not applied; the ledger refuses what it
 * refuses. What stays: an Account not on the ledger (it has no Sequence; the online
 * words), the fee cap, and P-28 on any failed read. The key state comes from the same
 * fresh account read that proves the Account exists, so a failed read is P-28, never a
 * Data to Sign with an unknown state (story 8 record).
 */
async function answerKeyChange(wallet: TransmitterMeta, request: RequestPayload, tx: SetRegularKeyRequestTx | AccountSetRequestTx, ctx: Ctx): Promise<AnswerResult> {
  let state: AccountState
  try {
    state = await fetchAccountStateFresh(ctx.queryClient, wallet.network, request.account, wallet.node)
  } catch {
    return { status: 'read-failed' }
  }
  if (!state.exists) {
    return { status: 'refused', reason: tx.TransactionType === 'SetRegularKey' ? SHIPPED.noKeysToChange : SHIPPED.noMasterKeySetting }
  }
  // The signer list is its own read, for display only: a failed read is "unknown" (P-29),
  // never "none" and never a reason not to answer (route-checks "Transmitter Wallet").
  let signerList: SignerListState
  try {
    signerList = await ctx.queryClient.fetchQuery({
      queryKey: queryKeys.signerList(wallet.network, request.account),
      queryFn: () => fetchSignerList(wallet.network, request.account, wallet.node),
      staleTime: 0,
      networkMode: 'always',
    })
  } catch {
    signerList = 'unknown'
  }
  const keyState: KeyState = { regular_key: state.regularKey ?? null, master_key: state.disableMasterKey ? 'off' : 'on', signer_list: signerList }
  const prepared = await dataToSign(wallet, tx)
  if (!('values' in prepared)) return prepared
  return answered(wallet, request, prepared.values, { type: 'key' }, keyState)
}
