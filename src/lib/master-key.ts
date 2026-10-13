import type { QueryClient } from '@tanstack/react-query'
import { controlStatus, describeFailure, holdsMasterKey } from '@/lib/control'
import { listWallets, SigningCheckError, signingHandleFor, type Prompts, type WalletMeta } from '@/lib/crypto/keystore'
import { fetchAccountStateFresh } from '@/lib/xrpl/query-reads'
import { invalidateAccountScoped } from '@/lib/xrpl/query-keys'
import type { AccountState } from '@/lib/xrpl/reads'
import { submitMasterKeyFlag, type SubmitOutcome } from '@/lib/xrpl/writes'

/**
 * Turning the Account Master Key off and on (FR-77; AD-29).
 *
 * The state is READ from the ledger and never stored. Which key may do which is
 * decided here from the Wallet's view, never by the caller: a view whose key is
 * its Account holds the master key and may turn it off; a view that operates
 * another Account signs as its Regular Key and may turn it on. Holds no Seed,
 * key or PIN.
 */

export type MasterKeyStatus = 'on' | 'off' | 'unknown'

/** `unknown`: the read errored or is still loading (pass `null`/`undefined`), or
 * the Account does not exist. Never `on` or `off` by default. */
export function masterKeyStatus(accountState: AccountState | null | undefined): MasterKeyStatus {
  if (!accountState || !accountState.exists) return 'unknown'
  return accountState.disableMasterKey ? 'off' : 'on'
}

export interface MasterKeyAction {
  /** What this Wallet's role could do: `off` from the master key, `on` from the Regular Key. */
  action: 'off' | 'on'
  /** Why it cannot be offered right now, in words; `null` when it may be. */
  reason: string | null
}

/** The one place that judges the offer. An errored or loading read blocks it. */
export function masterKeyAction(
  wallet: Pick<WalletMeta, 'address' | 'keyAddress'>,
  accountState: AccountState | null | undefined,
  readFailed: boolean,
): MasterKeyAction {
  const action = holdsMasterKey(wallet) ? 'off' : 'on'
  if (readFailed) return { action, reason: 'The ledger could not be read, so the wallet cannot tell whether the master key is on. Try again.' }
  if (!accountState) return { action, reason: 'Reading the account from the ledger.' }
  if (!accountState.exists) return { action, reason: 'This account is not on the ledger yet, so it has no master key setting to change.' }
  if (action === 'off') {
    if (accountState.disableMasterKey) {
      return { action, reason: 'The master key is already off. Turn it back on from the wallet that signs as this account’s Regular Key.' }
    }
    if (!accountState.regularKey) {
      return { action, reason: 'This account has no Regular Key yet. Set one first, or turning the master key off would leave nothing able to sign.' }
    }
    return { action, reason: null }
  }
  if (controlStatus(accountState, wallet.keyAddress) !== 'controlled') {
    return { action, reason: 'This wallet’s key is not this account’s Regular Key, so it cannot turn the master key on.' }
  }
  if (!accountState.disableMasterKey) {
    return { action, reason: 'The master key is already on. Turning it off is done from the wallet that holds the master key.' }
  }
  return { action, reason: null }
}

export interface SetMasterKeyContext {
  queryClient: QueryClient
  /** The Wallet's lock's Open Key. */
  openKey?: CryptoKey
  prompts: Prompts
  /** Must be `true`, from the UI's confirm step; anything else refuses. */
  confirmed?: boolean
}

export type MasterKeyResult =
  /** Validated. `state` is what the re-read shows, not what was asked for. */
  | { status: 'validated'; state: MasterKeyStatus }
  | { status: 'refused'; reason: string }
  /** A Signing Check was cancelled. Nothing was sent. */
  | { status: 'cancelled'; reason: string }
  /** The Signing Check was not passed (wrong PIN, locked out, unsupported). */
  | { status: 'check-failed'; reason: string }
  | { status: 'not-validated'; outcome: Exclude<SubmitOutcome, { status: 'validated' }>; reason: string; state: MasterKeyStatus }
  /** Submitted, but the re-read failed: the state is unknown. */
  | { status: 'unconfirmed'; reason: string }

export const MASTER_KEY_UNCONFIRMED = 'The change was submitted, but the wallet could not confirm it from the ledger, so the master key state is unknown. Check again.'

async function reread(ctx: SetMasterKeyContext, wallet: WalletMeta): Promise<AccountState | null> {
  try {
    await invalidateAccountScoped(ctx.queryClient, wallet.network, wallet.address)
    return await fetchAccountStateFresh(ctx.queryClient, wallet.network, wallet.address, wallet.node)
  } catch {
    return null
  }
}

/** Turns the master key on (`enable`) or off for `walletId`'s Account, signed by
 * that Wallet's Signing Check. The guard is judged again on a fresh read. */
export async function setMasterKey(walletId: string, enable: boolean, ctx: SetMasterKeyContext): Promise<MasterKeyResult> {
  if (ctx.confirmed !== true) return { status: 'refused', reason: 'The change was not confirmed. Nothing was signed.' }
  const wallet = (await listWallets()).find((w) => w.id === walletId)
  if (!wallet) return { status: 'refused', reason: 'That wallet is no longer on this device.' }
  // Turn off needs the master key; turn on needs a view that does not hold it.
  if (holdsMasterKey(wallet) === enable) {
    return {
      status: 'refused',
      reason: enable
        ? 'Only the wallet that signs as the Regular Key can turn the master key on. Nothing was signed.'
        : 'Only a wallet that holds the master key can turn it off. Nothing was signed.',
    }
  }

  let state: AccountState
  try {
    state = await fetchAccountStateFresh(ctx.queryClient, wallet.network, wallet.address, wallet.node)
  } catch {
    return { status: 'refused', reason: 'The ledger could not be read, so nothing was signed. Try again.' }
  }
  const { reason } = masterKeyAction(wallet, state, false)
  if (reason) return { status: 'refused', reason: `${reason} Nothing was signed.` }

  let outcome: SubmitOutcome
  try {
    const signing = await signingHandleFor(walletId, { openKey: ctx.openKey ?? null, prompts: ctx.prompts })
    outcome = await submitMasterKeyFlag(wallet.network, signing, { enable }, wallet.node)
  } catch (err) {
    if (err instanceof SigningCheckError) {
      return err.result.status === 'cancelled'
        ? { status: 'cancelled', reason: err.message }
        : { status: 'check-failed', reason: err.message }
    }
    // The transaction may have been sent before the throw: only an unchanged re-read proves it was not.
    const after = await reread(ctx, wallet)
    if (!after || masterKeyStatus(after) !== masterKeyStatus(state)) return { status: 'unconfirmed', reason: MASTER_KEY_UNCONFIRMED }
    return { status: 'refused', reason: err instanceof Error ? err.message : 'Could not change the master key.' }
  }

  const after = await reread(ctx, wallet)
  const shown = masterKeyStatus(after)
  if (outcome.status !== 'validated') return { status: 'not-validated', outcome, reason: describeFailure(outcome), state: shown }
  if (shown === 'unknown') return { status: 'unconfirmed', reason: MASTER_KEY_UNCONFIRMED }
  return { status: 'validated', state: shown }
}
