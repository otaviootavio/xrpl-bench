import type { QueryClient } from '@tanstack/react-query'
import { NotAnOnlineWalletError, SigningCheckError, signingHandleFor, SignsForChangedError, type KeyWalletMeta, type Prompts } from '@/lib/crypto/keystore'
import { NOT_SIGNED } from '@/lib/offline-round-words'
import { NOT_SENT } from '@/lib/transmit-words'
import type { RegularKeySet, StepResult } from '@/lib/transmit-step'
import { invalidateAccountScoped } from '@/lib/xrpl/query-keys'
import {
  FeeAboveCapError,
  MasterKeyOffError,
  submitMasterKeyFlag,
  submitNoChangeAccountSet,
  submitSetRegularKey,
  TransmitDeclinedError,
  TransmitRefusedError,
  type SigningHandle,
  type SubmitOutcome,
} from '@/lib/xrpl/writes'

/**
 * The Online Wallet's key actions (offline signing story 11, OS-FR-21, CAP-14): set,
 * replace or remove the Regular Key, turn the master key off or on, and W4's "Test the
 * Regular Key". The app refuses none of them: whatever the key state, the address or the
 * key that signs, the transaction goes to the ledger and the ledger's answer is the
 * outcome (P-31 for its key refusals, `result-codes.ts`). Replaces FR-75's "on-device
 * target only" and FR-77's "only after a validated Regular Key held here" for this Wallet
 * kind (product-prd-changes.md). Holds no Seed, key or PIN: signing is the Wallet's own
 * Signing Check through `signingHandleFor`, for the Account it Signs for.
 */

export type KeyAction = { type: 'set'; regularKey: string } | { type: 'remove' } | { type: 'master'; enable: boolean }

export interface KeyActionContext {
  queryClient: QueryClient
  /** The signing Wallet's lock's Open Key. */
  openKey: CryptoKey | null
  prompts: Prompts
}

/** A key action's result, in the Transmit step's shapes so `ResultView` shows it in today's
 * words: `refused` (nothing sent; the caller's alert), `declined`, `outcome`, `unconfirmed`. */
export type KeyActionResult = Exclude<StepResult, { kind: 'expired' }>

/** Runs `action` for `wallet`'s Account, signed by `wallet`'s key. */
export async function runKeyAction(wallet: KeyWalletMeta, action: KeyAction, ctx: KeyActionContext): Promise<KeyActionResult> {
  const result = await submitWith(wallet, wallet.address, ctx, (signing) => {
    if (action.type === 'master') return submitMasterKeyFlag(wallet.network, signing, { enable: action.enable }, wallet.node)
    return submitSetRegularKey(wallet.network, signing, { regularKey: action.type === 'set' ? action.regularKey : null }, wallet.node)
  })
  // P-54 (OS-FR-20): a validated change that sets a key is offered to that key's Wallet.
  if (result.kind === 'outcome' && result.outcome.status === 'validated' && action.type === 'set') {
    const regularKeySet: RegularKeySet = { account: wallet.address, regularKey: action.regularKey, network: wallet.network }
    return { ...result, regularKeySet }
  }
  return result
}

/**
 * W4's "Test the Regular Key" run in place: an AccountSet with no changes for `account`'s
 * Account, signed by `tester` (`key-warnings.ts` `regularKeyTester`: an Online Wallet here
 * whose key is the Regular Key and which Signs for that Account). Offered, never required.
 */
export async function testRegularKey(account: KeyWalletMeta, tester: KeyWalletMeta, ctx: KeyActionContext): Promise<KeyActionResult> {
  return submitWith(tester, account.address, ctx, (signing) => submitNoChangeAccountSet(tester.network, signing, tester.node))
}

async function submitWith(
  signer: KeyWalletMeta,
  account: string,
  ctx: KeyActionContext,
  submit: (signing: SigningHandle) => Promise<SubmitOutcome>,
): Promise<KeyActionResult> {
  // Whether the Signing Check was reached (before it nothing was signed), and whether the
  // blob was handed to the ledger (before that nothing was sent: a window read or a check
  // that throws after signing is not "may have been sent").
  let opened = false
  let submitted = false
  try {
    const handle = await signingHandleFor(signer.id, { openKey: ctx.openKey, prompts: ctx.prompts }, account)
    const signing: SigningHandle = {
      ...handle,
      open: () => {
        opened = true
        return handle.open()
      },
      onSubmitting: () => {
        submitted = true
      },
    }
    const outcome = await submit(signing)
    await invalidateAccountScoped(ctx.queryClient, signer.network, account).catch(() => {})
    return { kind: 'outcome', outcome }
  } catch (err) {
    if (err instanceof TransmitDeclinedError) return { kind: 'declined', text: err.message }
    if (
      err instanceof SigningCheckError ||
      err instanceof TransmitRefusedError ||
      err instanceof FeeAboveCapError ||
      err instanceof MasterKeyOffError ||
      err instanceof SignsForChangedError
    ) {
      return { kind: 'refused', text: err.message }
    }
    if (err instanceof NotAnOnlineWalletError || !opened) return { kind: 'refused', text: NOT_SIGNED }
    if (!submitted) return { kind: 'refused', text: NOT_SENT }
    // Submitted, then a throw: it may have reached the ledger. Never "not sent", never offered again.
    await invalidateAccountScoped(ctx.queryClient, signer.network, account).catch(() => {})
    return { kind: 'unconfirmed' }
  }
}
