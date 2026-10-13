import type { QueryClient } from '@tanstack/react-query'
import { AccountSetAsfFlags, decode, deriveAddress, isValidClassicAddress, verifySignature, type SubmittableTransaction } from 'xrpl'
import { describeFailure, setRegularKeyBlockedReason } from '@/lib/control'
import { listWallets, SigningCheckError, signingHandleFor, type Prompts, type WalletMeta } from '@/lib/crypto/keystore'
import { decodeSigned, decodeUnsigned, encodeSigned, encodeUnsigned } from '@/lib/qr-codec'
import { fetchAccountStateFresh, fetchDestinationInfoOnce } from '@/lib/xrpl/query-reads'
import { invalidateAccountScoped, queryKeys } from '@/lib/xrpl/query-keys'
import { fetchServerReserves, type AccountState } from '@/lib/xrpl/reads'
import { NETWORKS } from '@/lib/xrpl/networks'
import { MAX_FEE_DROPS, amountPlusFeeFits, feeWithinCap, formatXrp, isCanonicalPositiveDrops, reserveRequirementDrops, spendableAfterReserve } from '@/lib/xrpl/money'
import {
  FeeAboveCapError,
  prepareUnsigned,
  signPrepared,
  submitSignedBlob,
  validatedLedgerIndex,
  type SubmitOutcome,
} from '@/lib/xrpl/writes'

/**
 * Two-device signing (FR-78, CAP-13; AD-30). The online device builds a
 * transaction for a key that lives on an offline device, the offline device
 * confirms and signs it, and the online device verifies what came back before
 * it submits. Holds no Seed, key, signed blob or PIN beyond a call; the caller
 * keeps the payload text in component state only while its dialog is open.
 */

export type TwoDeviceRequest =
  | { kind: 'payment'; destination: string; amountDrops: string; destinationTag?: number }
  | { kind: 'regular-key'; regularKey: string }
  | { kind: 'master-key'; enable: boolean }

export type TwoDeviceKind = TwoDeviceRequest['kind']

/** The expiry, stated as a window and never as a promised duration. Shown on
 * both devices before the Signing Check. */
export function expiryWords(lastLedgerSequence: number, offline = false): string {
  if (offline) {
    return `This transaction is valid until ledger ${lastLedgerSequence}. That figure is the real limit. This device is offline and cannot check it against the ledger; when it was built it was set roughly four to six minutes ahead, which is a window and not a promised time. If the window passes before it is submitted, nothing is applied and a new one has to be built.`
  }
  return `This transaction is valid until ledger ${lastLedgerSequence}, which is a window of roughly four to six minutes from when it was built, not a promised time. If the window passes before it is submitted, nothing is applied and a new one has to be built.`
}

/** Why the action cannot be built on this read, in words; `null` when it may be.
 * An errored or loading read blocks (AD-29). Judged again on a fresh read. */
export function twoDeviceBlockedReason(
  kind: TwoDeviceKind,
  accountState: AccountState | null | undefined,
  readFailed: boolean,
  masterKeyEnable?: boolean,
): string | null {
  if (kind === 'regular-key') return setRegularKeyBlockedReason(accountState, readFailed)
  if (readFailed) return 'The ledger could not be read, so nothing can be built. Try again.'
  if (!accountState) return 'Reading the account from the ledger.'
  if (!accountState.exists) return 'This account is not on the ledger yet.'
  if (kind === 'master-key') {
    if (masterKeyEnable) {
      return accountState.disableMasterKey ? null : 'The master key is already on.'
    }
    if (accountState.disableMasterKey) return 'The master key is already off.'
    if (!accountState.regularKey) return 'This account has no Regular Key yet, so turning the master key off would leave nothing able to sign.'
  }
  return null
}

export type BuildResult =
  | { status: 'built'; text: string; tx: SubmittableTransaction; lastLedgerSequence: number }
  | { status: 'refused'; reason: string }

const readFail = (what: string) => ({ status: 'refused', reason: `The ledger could not be read (${what}), so nothing was built. Try again.` }) as const

/**
 * The online side. Live-read guards run first, on a fresh read; any errored
 * read, missing Account or failed guard blocks and builds nothing. Then
 * `prepareUnsigned` builds, and the codec carries it.
 */
export async function buildUnsigned(walletId: string, request: TwoDeviceRequest, ctx: { queryClient: QueryClient }): Promise<BuildResult> {
  const wallet = (await listWallets()).find((w) => w.id === walletId)
  if (!wallet) return { status: 'refused', reason: 'That wallet is no longer on this device.' }
  const { network, node, address } = wallet

  let state: AccountState
  try {
    state = await fetchAccountStateFresh(ctx.queryClient, network, address, node)
  } catch {
    return readFail('the account')
  }
  const blocked = twoDeviceBlockedReason(request.kind, state, false, request.kind === 'master-key' ? request.enable : undefined)
  if (blocked) return { status: 'refused', reason: `${blocked} Nothing was built.` }

  let tx: SubmittableTransaction
  let spendable = ''
  if (request.kind === 'payment') {
    if (!isValidClassicAddress(request.destination)) return { status: 'refused', reason: 'The destination is not a valid XRP Ledger address.' }
    if (request.destination === address) return { status: 'refused', reason: 'The destination is this account itself.' }
    if (!isCanonicalPositiveDrops(request.amountDrops)) return { status: 'refused', reason: 'The amount is not a valid XRP amount.' }
    if (request.destinationTag !== undefined && !(Number.isInteger(request.destinationTag) && request.destinationTag >= 0 && request.destinationTag <= 4294967295)) {
      return { status: 'refused', reason: 'The destination tag is not a valid number.' }
    }
    let base: string
    try {
      const reserves = await ctx.queryClient.fetchQuery({
        queryKey: queryKeys.serverReserves(network),
        queryFn: () => fetchServerReserves(network, node),
        staleTime: 0,
        networkMode: 'always',
      })
      base = reserves.baseReserveDrops
      spendable = spendableAfterReserve(state.balanceDrops, reserveRequirementDrops(reserves.baseReserveDrops, reserves.ownerReserveDrops, state.ownerCount))
    } catch {
      return readFail('the reserves')
    }
    if (BigInt(request.amountDrops) > BigInt(spendable)) {
      return { status: 'refused', reason: `The amount is more than this account can spend after its reserve (${formatXrp(spendable)}). Nothing was built.` }
    }
    let dest
    try {
      dest = await fetchDestinationInfoOnce(ctx.queryClient, network, request.destination, 'XRP', node)
    } catch {
      return readFail('the destination')
    }
    if (dest.requireDestTag && request.destinationTag === undefined) {
      return { status: 'refused', reason: 'The destination requires a destination tag. Nothing was built.' }
    }
    if (!dest.exists && BigInt(request.amountDrops) < BigInt(base)) {
      return { status: 'refused', reason: `The destination is not on the ledger yet and needs at least ${formatXrp(base)} to be created. Nothing was built.` }
    }
    tx = {
      TransactionType: 'Payment',
      Account: address,
      Destination: request.destination,
      Amount: request.amountDrops,
      ...(request.destinationTag !== undefined ? { DestinationTag: request.destinationTag } : {}),
    }
  } else if (request.kind === 'regular-key') {
    if (!isValidClassicAddress(request.regularKey)) return { status: 'refused', reason: 'The Regular Key is not a valid XRP Ledger address.' }
    if (request.regularKey === address) return { status: 'refused', reason: 'The Regular Key cannot be the account itself.' }
    tx = { TransactionType: 'SetRegularKey', Account: address, RegularKey: request.regularKey }
  } else {
    tx = {
      TransactionType: 'AccountSet',
      Account: address,
      ...(request.enable ? { ClearFlag: AccountSetAsfFlags.asfDisableMaster } : { SetFlag: AccountSetAsfFlags.asfDisableMaster }),
    }
  }

  let prepared: SubmittableTransaction
  try {
    prepared = await prepareUnsigned(network, tx, node)
  } catch (err) {
    if (err instanceof FeeAboveCapError) return { status: 'refused', reason: err.message }
    return readFail('the fee and sequence')
  }
  if (request.kind === 'payment' && !amountPlusFeeFits(request.amountDrops, String(prepared.Fee), spendable)) {
    return { status: 'refused', reason: 'The amount plus the network fee is more than this account can spend after its reserve. Nothing was built.' }
  }
  const lastLedgerSequence = prepared.LastLedgerSequence
  if (typeof lastLedgerSequence !== 'number') return { status: 'refused', reason: 'The transaction window could not be set. Nothing was built.' }

  const encoded = encodeUnsigned({ network, tx: prepared as unknown as Record<string, unknown> })
  if (!encoded.ok) return { status: 'refused', reason: encoded.reason }
  return { status: 'built', text: encoded.text, tx: prepared, lastLedgerSequence }
}

export interface UnsignedReview {
  kind: 'payment' | 'regular-key' | 'master-key-off' | 'master-key-on'
  /** What the transaction does, in words. */
  title: string
  account: string
  destination?: string
  destinationTag?: number
  amountXrp?: string
  regularKey?: string
  feeXrp: string
  lastLedgerSequence: number
  network: WalletMeta['network']
  networkLabel: string
  mainnet: boolean
  tx: SubmittableTransaction
}

export type ReviewResult = { status: 'ok'; review: UnsignedReview } | { status: 'refused'; reason: string }

const COMMON = new Set(['TransactionType', 'Account', 'Sequence', 'Fee', 'LastLedgerSequence', 'Flags', 'NetworkID'])
const EXTRA: Record<string, readonly string[]> = {
  Payment: ['Destination', 'Amount', 'DestinationTag'],
  SetRegularKey: ['RegularKey'],
  AccountSet: ['SetFlag', 'ClearFlag'],
}

const refuse = (what: string): ReviewResult => ({ status: 'refused', reason: `${what} Nothing was signed.` })
const isUint32 = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 4294967295

/**
 * The offline side's judgement of a payload, with no network. Refuses a network
 * that is not the Wallet's, an Account that is not the Wallet's address, a type
 * outside the three kinds, a non-XRP amount, a missing Sequence, Fee or
 * LastLedgerSequence, a Fee over the cap or non-canonical, a field this wallet
 * does not sign, or any signature already present.
 */
export function reviewUnsigned(text: string, wallet: Pick<WalletMeta, 'address' | 'network'>): ReviewResult {
  const decoded = decodeUnsigned(text)
  if (!decoded.ok) return refuse(decoded.reason)
  const { network, tx } = decoded.value
  if (network !== wallet.network) {
    return refuse(`This transaction is for ${NETWORKS[network].label}, but this wallet is on ${NETWORKS[wallet.network].label}.`)
  }
  if ('SigningPubKey' in tx || 'TxnSignature' in tx || 'Signers' in tx) return refuse('This transaction already carries a signature.')
  if (tx.Account !== wallet.address) return refuse('This transaction is for a different account than this wallet’s.')
  const type = tx.TransactionType
  if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(EXTRA, type)) return refuse('This kind of transaction is not one this wallet signs offline.')
  for (const key of Object.keys(tx)) {
    if (!COMMON.has(key) && !EXTRA[type].includes(key)) return refuse(`This transaction carries a field this wallet does not sign (${key}).`)
  }
  if (tx.Flags !== undefined && tx.Flags !== 0) return refuse('This transaction carries flags this wallet does not sign.')
  if (tx.NetworkID !== undefined && !isUint32(tx.NetworkID)) return refuse('This transaction’s NetworkID is not valid.')
  if (!isUint32(tx.Sequence)) return refuse('This transaction has no Sequence.')
  if (tx.Fee === undefined) return refuse('This transaction has no fee.')
  if (!isCanonicalPositiveDrops(tx.Fee)) return refuse('This transaction’s fee is not a valid amount.')
  if (!feeWithinCap(tx.Fee)) return refuse(`This transaction’s fee is more than this wallet’s limit of ${formatXrp(MAX_FEE_DROPS)}.`)
  if (!isUint32(tx.LastLedgerSequence)) return refuse('This transaction has no LastLedgerSequence.')

  const base = {
    account: wallet.address,
    feeXrp: formatXrp(tx.Fee),
    lastLedgerSequence: tx.LastLedgerSequence,
    network,
    networkLabel: NETWORKS[network].label,
    mainnet: network === 'mainnet',
    tx: tx as unknown as SubmittableTransaction,
  }

  if (type === 'Payment') {
    if (typeof tx.Amount !== 'string') return refuse('This payment is not in XRP, which this wallet does not sign offline.')
    if (!isCanonicalPositiveDrops(tx.Amount)) return refuse('This payment’s amount is not a valid XRP amount.')
    if (typeof tx.Destination !== 'string' || !isValidClassicAddress(tx.Destination)) return refuse('This payment’s destination is not a valid address.')
    if (tx.DestinationTag !== undefined && !isUint32(tx.DestinationTag)) return refuse('This payment’s destination tag is not valid.')
    return {
      status: 'ok',
      review: {
        ...base,
        kind: 'payment',
        title: 'Send XRP',
        destination: tx.Destination,
        ...(tx.DestinationTag !== undefined ? { destinationTag: tx.DestinationTag } : {}),
        amountXrp: formatXrp(tx.Amount),
      },
    }
  }
  if (type === 'SetRegularKey') {
    if (typeof tx.RegularKey !== 'string' || !isValidClassicAddress(tx.RegularKey)) return refuse('This transaction’s Regular Key is not a valid address.')
    return { status: 'ok', review: { ...base, kind: 'regular-key', title: 'Set the Regular Key', regularKey: tx.RegularKey } }
  }
  // AccountSet: exactly the master-key flag, set or cleared, and nothing else.
  const set = tx.SetFlag
  const clear = tx.ClearFlag
  if (set === AccountSetAsfFlags.asfDisableMaster && clear === undefined) {
    return { status: 'ok', review: { ...base, kind: 'master-key-off', title: 'Turn the master key off' } }
  }
  if (clear === AccountSetAsfFlags.asfDisableMaster && set === undefined) {
    return { status: 'ok', review: { ...base, kind: 'master-key-on', title: 'Turn the master key on' } }
  }
  return refuse('This account setting is not one this wallet signs offline.')
}

export type SignResult =
  | { status: 'signed'; text: string }
  | { status: 'refused'; reason: string }
  /** The Signing Check was dismissed. Nothing was signed; never a failed PIN. */
  | { status: 'cancelled'; reason: string }
  | { status: 'check-failed'; reason: string }

export interface SignContext {
  openKey?: CryptoKey
  prompts: Prompts
}

/** The offline side: judges the payload again, runs the Wallet's Signing Check
 * and signs once. The caller shows `reviewUnsigned` and asks for the confirm
 * (FR-20) before calling this. */
export async function signUnsigned(walletId: string, text: string, ctx: SignContext): Promise<SignResult> {
  const wallet = (await listWallets()).find((w) => w.id === walletId)
  if (!wallet) return { status: 'refused', reason: 'That wallet is no longer on this device.' }
  const reviewed = reviewUnsigned(text, wallet)
  if (reviewed.status === 'refused') return reviewed
  try {
    const signing = await signingHandleFor(walletId, { openKey: ctx.openKey ?? null, prompts: ctx.prompts })
    const signed = await signPrepared(signing, reviewed.review.tx)
    const encoded = encodeSigned(signed.tx_blob)
    return encoded.ok ? { status: 'signed', text: encoded.text } : { status: 'refused', reason: `${encoded.reason} Nothing was sent.` }
  } catch (err) {
    if (err instanceof SigningCheckError) {
      return err.result.status === 'cancelled'
        ? { status: 'cancelled', reason: 'Cancelled. Nothing was signed.' }
        : { status: 'check-failed', reason: err.message }
    }
    return { status: 'refused', reason: err instanceof Error ? err.message : 'Could not sign. Nothing was signed.' }
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => k in b && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

function withoutSignature(tx: Record<string, unknown>): Record<string, unknown> {
  const { SigningPubKey: _k, TxnSignature: _s, ...rest } = tx
  return rest
}

export type VerifyResult = { status: 'ok'; txBlob: string } | { status: 'refused'; reason: string }

/**
 * The online side's check of what came back: the blob decodes to exactly the
 * transaction that was sent, ignoring only `SigningPubKey` and `TxnSignature`,
 * and the key is the Account's master key (only while it is not off) or its
 * Regular Key, from a fresh read. An errored read blocks. Nothing is submitted here.
 */
export async function verifySigned(
  wallet: Pick<WalletMeta, 'network' | 'node' | 'address'>,
  sent: SubmittableTransaction,
  signedText: string,
  ctx: { queryClient: QueryClient },
): Promise<VerifyResult> {
  const decoded = decodeSigned(signedText)
  if (!decoded.ok) return { status: 'refused', reason: `${decoded.reason} Nothing was submitted.` }
  const { tx_blob } = decoded.value
  let returned: Record<string, unknown>
  try {
    returned = decode(tx_blob) as unknown as Record<string, unknown>
  } catch {
    return { status: 'refused', reason: 'The signed transaction could not be read. Nothing was submitted.' }
  }
  if (!deepEqual(withoutSignature(returned), withoutSignature(sent as unknown as Record<string, unknown>))) {
    return { status: 'refused', reason: 'The signed transaction is not the one that was sent. Nothing was submitted.' }
  }
  let signatureOk = false
  try {
    signatureOk = verifySignature(tx_blob)
  } catch {
    signatureOk = false
  }
  if (!signatureOk) return { status: 'refused', reason: 'The signature on the returned transaction is not valid. Nothing was submitted.' }
  const pubKey = returned.SigningPubKey
  if (typeof pubKey !== 'string' || pubKey === '' || typeof returned.TxnSignature !== 'string') {
    return { status: 'refused', reason: 'The transaction is not signed by a single key. Nothing was submitted.' }
  }
  let signer: string
  try {
    signer = deriveAddress(pubKey)
  } catch {
    return { status: 'refused', reason: 'The signing key could not be read. Nothing was submitted.' }
  }
  let state: AccountState
  try {
    state = await fetchAccountStateFresh(ctx.queryClient, wallet.network, wallet.address, wallet.node)
  } catch {
    return { status: 'refused', reason: 'The ledger could not be read, so the signing key could not be checked. Nothing was submitted. Try again.' }
  }
  if (!state.exists) return { status: 'refused', reason: 'This account is not on the ledger. Nothing was submitted.' }
  const isMaster = signer === wallet.address && !state.disableMasterKey
  const isRegular = state.regularKey !== undefined && signer === state.regularKey
  if (!isMaster && !isRegular) {
    return { status: 'refused', reason: 'The key that signed is not this account’s master key or Regular Key. Nothing was submitted.' }
  }
  return { status: 'ok', txBlob: tx_blob }
}

export type ReturnedResult =
  | { status: 'validated'; outcome: Extract<SubmitOutcome, { status: 'validated' }> }
  /** Past `LastLedgerSequence`, or `tefMAX_LEDGER`. Not applied, not failed; the blob is never resubmitted. */
  | { status: 'expired'; reason: string }
  | { status: 'not-validated'; outcome: Exclude<SubmitOutcome, { status: 'validated' | 'expired' }>; reason: string }
  /** Verification or a pre-submit read refused. Nothing was submitted. */
  | { status: 'refused'; reason: string }
  /** The submit threw: it may or may not have reached the ledger. */
  | { status: 'unconfirmed'; reason: string }

export const EXPIRED_WORDS =
  'This transaction expired before it validated. It was not applied, and the signed copy cannot be used again. Build a new one.'

async function refresh(wallet: Pick<WalletMeta, 'network' | 'address'>, queryClient: QueryClient): Promise<void> {
  try {
    await invalidateAccountScoped(queryClient, wallet.network, wallet.address)
  } catch {
    // A failed invalidation only leaves a screen to refresh.
  }
}

/** Verifies, then submits through `submitSignedBlob` and the choke point. Only `validated` is success. */
export async function submitReturned(
  wallet: Pick<WalletMeta, 'network' | 'node' | 'address'>,
  sent: SubmittableTransaction,
  signedText: string,
  ctx: { queryClient: QueryClient },
): Promise<ReturnedResult> {
  const verified = await verifySigned(wallet, sent, signedText, ctx)
  if (verified.status === 'refused') return verified
  const lastLedgerSequence = sent.LastLedgerSequence
  if (typeof lastLedgerSequence !== 'number') return { status: 'refused', reason: 'The transaction has no window. Nothing was submitted.' }
  try {
    if ((await validatedLedgerIndex(wallet.network, wallet.node)) > lastLedgerSequence) return { status: 'expired', reason: EXPIRED_WORDS }
  } catch {
    return { status: 'refused', reason: 'The current ledger could not be read, so nothing was submitted. Try again.' }
  }
  let outcome: SubmitOutcome
  try {
    outcome = await submitSignedBlob(wallet.network, sent, verified.txBlob, wallet.node)
  } catch (err) {
    if (err instanceof FeeAboveCapError) return { status: 'refused', reason: err.message }
    if (err instanceof Error && err.message.includes('tefMAX_LEDGER')) return { status: 'expired', reason: EXPIRED_WORDS }
    // The outcome is unknown: re-read so balance and sequence are not stale.
    await refresh(wallet, ctx.queryClient)
    return {
      status: 'unconfirmed',
      reason: 'The transaction may have been sent, but the wallet could not confirm what happened. Check the account’s history before building another, and do not send this one again.',
    }
  }
  await refresh(wallet, ctx.queryClient)
  if (outcome.status === 'validated') return { status: 'validated', outcome }
  if (outcome.status === 'expired' || (outcome.status === 'failed' && outcome.resultCode === 'tefMAX_LEDGER')) {
    return { status: 'expired', reason: EXPIRED_WORDS }
  }
  return { status: 'not-validated', outcome, reason: describeFailure(outcome) }
}
