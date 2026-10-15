import type { QueryClient } from '@tanstack/react-query'
import { addControlledView, listWallets, SigningCheckError, signingHandleFor, type Prompts, type WalletMeta } from '@/lib/crypto/keystore'
import { fetchAccountStateFresh } from '@/lib/xrpl/query-reads'
import { invalidateAccountScoped } from '@/lib/xrpl/query-keys'
import type { AccountState } from '@/lib/xrpl/reads'
import { describeResultCode } from '@/lib/xrpl/result-codes'
import { submitSetRegularKey, type SubmitOutcome } from '@/lib/xrpl/writes'

/**
 * Controlling Wallet, Regular Key (FR-75, FR-76; AD-18, AD-29).
 *
 * Whether a key controls an Account is READ from the ledger and never stored:
 * the view's `accountAddress` is only a claim that the app should show this key
 * operating that Account, added after a validated `SetRegularKey` and a fresh
 * read that shows the key. Holds no Seed, key or PIN.
 */

export type ControlStatus = 'controlled' | 'not-controlled' | 'unknown'

/** `unknown`: the read errored or is still loading (pass `null`/`undefined`), or
 * the Account does not exist. Never `controlled` or `not-controlled` by default. */
export function controlStatus(accountState: AccountState | null | undefined, keyAddress: string): ControlStatus {
  if (!accountState || !accountState.exists) return 'unknown'
  return accountState.regularKey === keyAddress ? 'controlled' : 'not-controlled'
}

/** Whether a Wallet holds the master key of its own Account: the only kind that
 * can set a Regular Key (AD-29). */
export function holdsMasterKey(wallet: Pick<WalletMeta, 'address' | 'keyAddress'>): boolean {
  return wallet.address === wallet.keyAddress
}

/** True when this Wallet operates an Account its own key does not derive (AD-18). */
export function operatesAnotherAccount(wallet: Pick<WalletMeta, 'address' | 'keyAddress'>): boolean {
  return wallet.address !== wallet.keyAddress
}

/** Why the action is unavailable on the Account's current read, in words; `null`
 * when it may be offered. An errored or loading read blocks it (AD-29). */
export function setRegularKeyBlockedReason(
  accountState: AccountState | null | undefined,
  readFailed: boolean,
): string | null {
  if (readFailed) return 'The ledger could not be read, so the wallet cannot tell what controls this account. Try again.'
  if (!accountState) return 'Reading the account from the ledger.'
  if (!accountState.exists) return 'This account is not on the ledger yet, so it has no keys to change.'
  if (accountState.disableMasterKey) return 'This account has its master key turned off, so this wallet can no longer sign for it.'
  return null
}

/** The wallets a Controlling Wallet may hand control to: another Seed, the same
 * network, a different key, and not already operating this Account. */
export function eligibleTargets(controller: WalletMeta, wallets: readonly WalletMeta[]): WalletMeta[] {
  const seen = new Set<string>()
  return wallets.filter(
    (w) =>
      w.seedId !== controller.seedId &&
      w.network === controller.network &&
      w.keyAddress !== controller.address &&
      !wallets.some((o) => o.seedId === w.seedId && o.network === w.network && o.address === controller.address) &&
      // One row per Seed: its own view and any controlled views share one key.
      (seen.has(w.seedId) ? false : (seen.add(w.seedId), true)),
  )
}

export interface SetRegularKeyContext {
  queryClient: QueryClient
  /** The controller's lock's Open Key. */
  openKey?: CryptoKey
  prompts: Prompts
  /** Asked only when the Account already has another Regular Key; `false` sends nothing. */
  confirmReplace?: (existingRegularKey: string) => Promise<boolean>
}

export type ControlResult =
  | { status: 'controlled'; meta: WalletMeta; sent: boolean }
  | { status: 'refused'; reason: string }
  /** The replacement confirm or a Signing Check was cancelled. Nothing was sent. */
  | { status: 'cancelled'; reason: string }
  /** The Signing Check was not passed (wrong PIN, locked out, unsupported). */
  | { status: 'check-failed'; reason: string }
  | { status: 'not-validated'; outcome: Exclude<SubmitOutcome, { status: 'validated' }>; reason: string }
  /** The transaction validated (or its key was already set) but the fresh read
   * could not confirm it. No view was added; `confirmControl` retries the read only. */
  | { status: 'unconfirmed'; reason: string }

const UNCONFIRMED = 'The change was submitted, but the wallet could not confirm it from the ledger. Check again.'

export function describeFailure(outcome: Exclude<SubmitOutcome, { status: 'validated' }>): string {
  switch (outcome.status) {
    case 'expired':
      return 'The change expired before it validated. It was not applied; you can try again.'
    case 'claimed':
      return `${describeResultCode(outcome.resultCode)} The network fee was still charged.`
    case 'failed':
      return describeResultCode(outcome.resultCode)
  }
}

function find(metas: WalletMeta[], id: string): WalletMeta | undefined {
  return metas.find((w) => w.id === id)
}

/** Re-reads the Account and, only if the read succeeded and shows the target's
 * key as the Regular Key, adds the target's view. The only claim path; "check
 * again" runs just this. */
export async function confirmControl(controllerId: string, targetId: string, ctx: Pick<SetRegularKeyContext, 'queryClient'>): Promise<ControlResult> {
  const metas = await listWallets()
  const controller = find(metas, controllerId)
  const target = find(metas, targetId)
  if (!controller || !target) return { status: 'refused', reason: 'That wallet is no longer on this device.' }
  let state: AccountState
  try {
    state = await fetchAccountStateFresh(ctx.queryClient, controller.network, controller.address, controller.node)
  } catch {
    return { status: 'unconfirmed', reason: UNCONFIRMED }
  }
  if (!state.exists || state.regularKey !== target.keyAddress) {
    return { status: 'unconfirmed', reason: 'The ledger does not show that wallet as this account’s Regular Key yet. Check again.' }
  }
  const existing = metas.find((w) => w.seedId === target.seedId && w.network === controller.network && w.address === controller.address)
  let meta = existing
  if (!meta) {
    try {
      meta = await addControlledView(target.id, {
        network: controller.network,
        ...(controller.node ? { node: controller.node } : {}),
        accountAddress: controller.address,
      })
    } catch (err) {
      // The key is already the Regular Key on the ledger: this must stay retryable.
      return { status: 'unconfirmed', reason: `${UNCONFIRMED} ${err instanceof Error ? err.message : ''}`.trim() }
    }
  }
  await invalidateAccountScoped(ctx.queryClient, controller.network, controller.address)
  return { status: 'controlled', meta, sent: false }
}

/**
 * Sets `target`'s key as the Regular Key of `controller`'s Account, signed by the
 * controller's Signing Check, and only after validation and a matching fresh
 * read gives the target a view of the Account.
 */
export async function setRegularKey(controllerId: string, targetId: string, ctx: SetRegularKeyContext): Promise<ControlResult> {
  const metas = await listWallets()
  const controller = find(metas, controllerId)
  const target = find(metas, targetId)
  if (!controller || !target) return { status: 'refused', reason: 'That wallet is no longer on this device.' }
  if (!holdsMasterKey(controller)) {
    return { status: 'refused', reason: 'Only a wallet that holds the account’s master key can set its Regular Key.' }
  }
  if (target.seedId === controller.seedId || target.keyAddress === controller.address) {
    return { status: 'refused', reason: 'Choose a different wallet: the same key cannot be its own Regular Key.' }
  }
  if (target.network !== controller.network) {
    return { status: 'refused', reason: 'Both wallets must be on the same network.' }
  }
  if (metas.some((w) => w.seedId === target.seedId && w.network === controller.network && w.address === controller.address)) {
    return { status: 'refused', reason: 'That wallet already operates this account.' }
  }

  let state: AccountState
  try {
    state = await fetchAccountStateFresh(ctx.queryClient, controller.network, controller.address, controller.node)
  } catch {
    return { status: 'refused', reason: 'The ledger could not be read, so nothing was signed. Try again.' }
  }
  const blocked = setRegularKeyBlockedReason(state, false)
  if (blocked) return { status: 'refused', reason: `${blocked} Nothing was signed.` }

  if (state.regularKey === target.keyAddress) {
    const claimed = await confirmControl(controllerId, targetId, ctx)
    return claimed.status === 'controlled' ? { ...claimed, sent: false } : claimed
  }
  if (state.regularKey) {
    if (!ctx.confirmReplace) return { status: 'refused', reason: 'This account already has a Regular Key and replacing it needs your confirmation. Nothing was signed.' }
    if (!(await ctx.confirmReplace(state.regularKey))) return { status: 'cancelled', reason: 'Cancelled. Nothing was signed.' }
  }

  let outcome: SubmitOutcome
  try {
    const signing = await signingHandleFor(controllerId, { openKey: ctx.openKey ?? null, prompts: ctx.prompts })
    outcome = await submitSetRegularKey(controller.network, signing, { regularKey: target.keyAddress }, controller.node)
  } catch (err) {
    if (err instanceof SigningCheckError) {
      return err.result.status === 'cancelled'
        ? { status: 'cancelled', reason: err.message }
        : { status: 'check-failed', reason: err.message }
    }
    // The transaction may have been sent before the throw: only a read that still
    // shows the old Regular Key proves it was not.
    let after: AccountState | null = null
    try {
      await invalidateAccountScoped(ctx.queryClient, controller.network, controller.address)
      after = await fetchAccountStateFresh(ctx.queryClient, controller.network, controller.address, controller.node)
    } catch {
      after = null
    }
    if (!after) return { status: 'unconfirmed', reason: UNCONFIRMED }
    if (after.regularKey !== state.regularKey) {
      const claimed = await confirmControl(controllerId, targetId, ctx)
      return claimed.status === 'controlled' ? { ...claimed, sent: true } : claimed
    }
    return { status: 'refused', reason: err instanceof Error ? err.message : 'Could not set the Regular Key.' }
  }
  if (outcome.status !== 'validated') return { status: 'not-validated', outcome, reason: describeFailure(outcome) }

  const claimed = await confirmControl(controllerId, targetId, ctx)
  return claimed.status === 'controlled' ? { ...claimed, sent: true } : claimed
}
