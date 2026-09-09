import { Wallet, type Payment, type TrustSet, TrustSetFlags } from 'xrpl'
import { getXrplClient } from './client'
import type { NetworkId } from './networks'
import { useAppStore } from '@/store/app-store'

/** Cap on the fee autofill is allowed to attach, so a fee-escalation spike
 * can never quietly turn a small payment into an expensive one. xrpl.js
 * otherwise defaults to 2 XRP. */
const MAX_FEE_XRP = '0.01'

export type SubmitOutcome =
  | { status: 'validated'; hash: string; resultCode: string; ledgerIndex?: number }
  /** In a validated ledger, but the transaction did NOT do what was asked and
   * the fee WAS consumed (`tec*`). Materially different from 'failed' and must
   * be reported differently — the user has been charged. */
  | { status: 'claimed'; hash: string; resultCode: string; ledgerIndex?: number }
  /** Rejected before being applied (`tef*`/`tem*`/`ter*`) — no fee consumed. */
  | { status: 'failed'; hash: string; resultCode: string }
  | { status: 'expired'; hash: string } // LastLedgerSequence passed with no validated result — see docs/decisions.md

function classify(resultCode: string): 'validated' | 'claimed' | 'failed' {
  if (resultCode === 'tesSUCCESS') return 'validated'
  if (resultCode.startsWith('tec')) return 'claimed'
  return 'failed'
}

async function submitAndClassify(network: NetworkId, wallet: Wallet, tx: Payment | TrustSet): Promise<SubmitOutcome> {
  // app-versioning-and-updates.md US-5: the single choke point every write
  // passes through, so the update flow always sees an accurate "is anything
  // in flight right now" signal regardless of which tab is mounted. Set
  // before the first network call (autofill needs the current sequence, so
  // signing has effectively already started) and cleared in `finally` so a
  // thrown/expired outcome still releases the flag.
  useAppStore.getState().setTxInFlight(true)
  try {
    const client = await getXrplClient(network)
    const prepared = await client.autofill(tx as any, { maxFeeXRP: MAX_FEE_XRP } as any)
    const signed = wallet.sign(prepared)
    const lastLedgerSequence = (prepared as any).LastLedgerSequence as number | undefined
    try {
      const res = await client.submitAndWait(signed.tx_blob)
      const meta = res.result.meta
      const resultCode = typeof meta === 'object' && meta ? (meta as any).TransactionResult : 'unknown'
      const status = classify(resultCode)
      return status === 'failed'
        ? { status, hash: signed.hash, resultCode }
        : { status, hash: signed.hash, resultCode, ledgerIndex: res.result.ledger_index }
    } catch (err: any) {
      // The "stuck/expired" case from docs/decisions.md: the network moved past
      // this transaction's LastLedgerSequence without it appearing in a
      // validated ledger. It may simply never have been included. NEVER
      // resubmit this exact signed blob — the caller must build a fresh
      // transaction with a new sequence.
      //
      // Detected structurally (comparing the validated ledger index against the
      // tx's own LastLedgerSequence) rather than by matching on error-message
      // text, which silently reclassifies whenever xrpl.js rewords it.
      if (await isExpiry(err, network, lastLedgerSequence)) {
        return { status: 'expired', hash: signed.hash }
      }
      throw err
    }
  } finally {
    useAppStore.getState().setTxInFlight(false)
  }
}

async function isExpiry(err: any, network: NetworkId, lastLedgerSequence?: number): Promise<boolean> {
  if (err?.name === 'XrplError' && typeof err?.message === 'string' && err.message.includes('LastLedgerSequence')) {
    return true
  }
  if (lastLedgerSequence === undefined) return false
  try {
    const client = await getXrplClient(network)
    const res = await client.request({ command: 'ledger', ledger_index: 'validated' })
    const validatedIndex = res.result.ledger_index
    return typeof validatedIndex === 'number' && validatedIndex > lastLedgerSequence
  } catch {
    return false
  }
}

export async function submitXrpPayment(
  network: NetworkId,
  wallet: Wallet,
  params: { destination: string; amountDrops: string; destinationTag?: number },
): Promise<SubmitOutcome> {
  const tx: Payment = {
    TransactionType: 'Payment',
    Account: wallet.address,
    Destination: params.destination,
    Amount: params.amountDrops,
    ...(params.destinationTag !== undefined ? { DestinationTag: params.destinationTag } : {}),
  }
  return submitAndClassify(network, wallet, tx)
}

export async function submitIssuedPayment(
  network: NetworkId,
  wallet: Wallet,
  params: { destination: string; currency: string; issuer: string; value: string; destinationTag?: number },
): Promise<SubmitOutcome> {
  const tx: Payment = {
    TransactionType: 'Payment',
    Account: wallet.address,
    Destination: params.destination,
    Amount: { currency: params.currency, issuer: params.issuer, value: params.value },
    ...(params.destinationTag !== undefined ? { DestinationTag: params.destinationTag } : {}),
  }
  return submitAndClassify(network, wallet, tx)
}

export async function submitTrustSet(
  network: NetworkId,
  wallet: Wallet,
  params: { currency: string; issuer: string; limit: string }, // limit "0" removes the line
): Promise<SubmitOutcome> {
  const tx: TrustSet = {
    TransactionType: 'TrustSet',
    Account: wallet.address,
    LimitAmount: { currency: params.currency, issuer: params.issuer, value: params.limit },
    // Holders should not let balances ripple through their trust lines —
    // rippling is for issuers. Without NoRipple a holder's balance can shift
    // as a side effect of unrelated payments between other parties.
    Flags: TrustSetFlags.tfSetNoRipple,
  }
  return submitAndClassify(network, wallet, tx)
}
