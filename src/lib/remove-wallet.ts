import type { QueryClient } from '@tanstack/react-query'
import { REMOVE_DONE, REMOVE_FAILED, REMOVE_PIN_NOT_DISCARDED, removeBodyFor, type RemoveBody } from '@/lib/remove-copy'
import { listWallets, removeWallet, type RemoveWalletResult, type WalletMeta } from '@/lib/crypto/keystore'
import { notify } from '@/lib/notify'
import { removeWalletData } from '@/lib/teardown'
import { useAppStore } from '@/store/app-store'
import { nextActiveWalletId, walletIdsInChooserOrder } from '@/store/wallet-groups'

/**
 * The one removal path (AD-46). The chooser card and the Configure Remove plate both call
 * these two functions, so a guard cannot drift between them.
 */

/** The Wallet if its lock is open NOW: read from the store at the moment of the call, never from
 * what a card was rendered with. */
export function openWalletNow(walletId: string): WalletMeta | null {
  const { wallets, openLocks } = useAppStore.getState()
  const wallet = wallets.find((w) => w.id === walletId)
  return wallet && wallet.lockId in openLocks ? wallet : null
}

export interface RemoveCallbacks {
  /** Refused before anything ran (lock closed, wallets changed): close the dialog. */
  refused: () => void
  /**
   * Whatever the keystore did, called just before the store is written. `remaining` is how many
   * wallets the device holds afterwards, or null when the vault could not be read.
   */
  settling: (remaining: number | null) => void
  /** Called after the store is written. */
  settled: () => void
}

export async function confirmRemoveWallet(
  queryClient: QueryClient,
  walletId: string,
  shownBody: RemoveBody,
  { refused, settling, settled }: RemoveCallbacks,
): Promise<void> {
  // Again at confirm: the lock may have closed while the dialog was open.
  const removed = openWalletNow(walletId)
  if (!removed) {
    refused()
    notify.error('This wallet is locked. Open it to remove it.')
    return
  }
  // The dialog states a consequence; if the wallets changed under it, it no longer holds.
  if (removeBodyFor(useAppStore.getState().wallets, walletId) !== shownBody) {
    refused()
    notify.error('The wallets on this device changed. Open Remove again to see what it does now.')
    return
  }
  let result: RemoveWalletResult | null = null
  let teardownFailed = false
  let readFailed = false
  try {
    result = await removeWallet(walletId)
  } catch {
    result = null
  } finally {
    // Whatever the keystore did, the session, the cache and the Active Wallet stop naming it.
    const state = useAppStore.getState()
    let vault: WalletMeta[] | null
    try {
      vault = await listWallets(state.network)
    } catch {
      // The keystore said the removal went through: the store minus it is what we know. If it
      // threw AND the list cannot be read, nothing is known: never show that as the list.
      vault = result ? state.wallets.filter((w) => w.id !== walletId) : null
    }
    try {
      // Unread vault: only the removed wallet's data is shed (it is still listed), nothing else is torn down.
      removeWalletData(queryClient, removed, vault ? vault.filter((w) => w.id !== walletId) : state.wallets)
    } catch {
      teardownFailed = true
    }
    settling(vault ? vault.filter((w) => w.id !== walletId).length : null)
    if (vault) {
      const remaining = vault.filter((w) => w.id !== walletId)
      useAppStore.getState().setWallets(vault)
      useAppStore
        .getState()
        .setActiveWalletId(nextActiveWalletId(walletId, useAppStore.getState().activeWalletId, walletIdsInChooserOrder(remaining)))
    } else {
      readFailed = true
    }
    settled()
  }
  if (result === null || teardownFailed || readFailed) notify.error(REMOVE_FAILED)
  else if (result.appPin === 'failed') notify.error(REMOVE_PIN_NOT_DISCARDED)
  else notify.success(REMOVE_DONE)
}
