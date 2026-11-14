import type { QueryClient } from '@tanstack/react-query'
import type { Prompts, TransmitterMeta } from '@/lib/crypto/keystore'
import { decodeSigned } from '@/lib/qr-codec'
import type { NetworkId } from '@/lib/xrpl/networks'
import { invalidateAccountScoped } from '@/lib/xrpl/query-keys'
import { UNCONFIRMED_SUBMIT_WORDS } from '@/lib/xrpl/result-codes'
import {
  expectedAccountFor,
  previewSignedTransaction,
  transmitSignedTransaction,
  type CheckedSignedTransaction,
  type SignedForReview,
  type TransmitOutcome,
} from '@/lib/xrpl/writes'

/**
 * The Transmit step for a scanned Signed Transaction (OS-FR-9, OS-FR-10), shared
 * by Transmit and by the Synced Transmitter's New transaction (story 9): ready it
 * with the P-25 checks and no ledger read, then Send, which runs every check again
 * with the window on a fresh read and submits once. The Network passed is the one
 * the signed envelope names, never this Wallet's own.
 */

/** The scanned Signed Transaction, held only while it is shown: never stored. */
export interface Ready {
  txBlob: string
  envelopeNetwork: NetworkId
  checked: CheckedSignedTransaction
  /** The Account the Transmit step expects; `null`: confirmed on Send (P-27). */
  expected: string | null
}

/** A Regular Key change the ledger validated: the Account, the new key and the Network it was sent on. */
export interface RegularKeySet {
  account: string
  regularKey: string
  network: NetworkId
}

/** P-54's trigger (OS-FR-20): a validated SetRegularKey that sets a key (not one that removes it). */
export function regularKeySetBy(tx: Record<string, unknown>, outcome: TransmitOutcome, network: NetworkId): RegularKeySet | undefined {
  if (outcome.status !== 'validated' || tx.TransactionType !== 'SetRegularKey') return undefined
  if (typeof tx.Account !== 'string' || typeof tx.RegularKey !== 'string' || tx.RegularKey === '') return undefined
  return { account: tx.Account, regularKey: tx.RegularKey, network }
}

/** What follows a Send. */
export type StepResult =
  | { kind: 'refused'; text: string }
  | { kind: 'declined'; text: string }
  /** `regularKeySet`: a validated SetRegularKey that set a key, for P-54 (OS-FR-20). */
  | { kind: 'outcome'; outcome: TransmitOutcome; regularKeySet?: RegularKeySet }
  | { kind: 'expired' }
  | { kind: 'unconfirmed' }

/**
 * A scanned signed code made ready for Send, or its refusal in the codec's or the
 * Transmit step's words. Expected Account: the Synced address; else one this screen
 * answered a request for (`answered`); else none (P-27, confirmed on Send).
 */
export function readySigned(wallet: TransmitterMeta, text: string, answered: ReadonlySet<string> = new Set()): { kind: 'ready'; ready: Ready } | { kind: 'refused'; text: string } {
  const decoded = decodeSigned(text)
  if (!decoded.ok) return { kind: 'refused', text: decoded.reason }
  let expected = expectedAccountFor({ syncedAddress: wallet.address ?? undefined })
  try {
    const signed = { txBlob: decoded.value.tx_blob, network: decoded.value.network }
    let checked = previewSignedTransaction(wallet.network, signed, expected)
    // Unsynced: an Account this screen answered a request for is the expected one.
    if (expected === null && answered.has(checked.account)) {
      expected = expectedAccountFor({ requestAccount: checked.account })
      checked = previewSignedTransaction(wallet.network, signed, expected)
    }
    return { kind: 'ready', ready: { txBlob: decoded.value.tx_blob, envelopeNetwork: decoded.value.network, checked, expected } }
  } catch (err) {
    return { kind: 'refused', text: err instanceof Error ? err.message : UNCONFIRMED_SUBMIT_WORDS }
  }
}

/** Send: the Transmit step runs every check again with the window on a fresh read, submits once, and the outcome is classified as today. */
export async function sendReady(wallet: TransmitterMeta, ready: Ready, ctx: { prompts: Prompts; queryClient: QueryClient }): Promise<StepResult> {
  // Send confirms the blob's own Account when none was expected (P-27).
  const expected = ready.expected ?? expectedAccountFor({ confirmedAccount: ready.checked.account })!
  const review = wallet.showBeforeSending
    ? (signed: SignedForReview) => ctx.prompts.reviewSignedTransaction?.(signed) ?? Promise.resolve(false)
    : undefined
  try {
    const outcome = await transmitSignedTransaction(wallet.network, { txBlob: ready.txBlob, network: ready.envelopeNetwork }, expected, wallet.node, review)
    await invalidateAccountScoped(ctx.queryClient, wallet.network, ready.checked.account).catch(() => {})
    if (outcome.status === 'expired') return { kind: 'expired' }
    const regularKeySet = regularKeySetBy(ready.checked.tx, outcome, wallet.network)
    return regularKeySet ? { kind: 'outcome', outcome, regularKeySet } : { kind: 'outcome', outcome }
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    if (name === 'TransmitDeclinedError') return { kind: 'declined', text: (err as Error).message }
    if (name === 'TransmitRefusedError' || name === 'FeeAboveCapError') return { kind: 'refused', text: (err as Error).message }
    // It may have reached the ledger: never "not sent", and never offered again.
    await invalidateAccountScoped(ctx.queryClient, wallet.network, ready.checked.account).catch(() => {})
    return { kind: 'unconfirmed' }
  }
}

