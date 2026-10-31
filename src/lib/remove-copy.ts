import type { WalletMeta } from '@/lib/crypto/keystore'

/** The shipped Remove sentences (Settings' dialog says the same), and the chooser's last-wallet one. */
export const REMOVE_TITLE = 'Remove this wallet?'
export const REMOVE_SIBLING = 'This removes only this one wallet. The encrypted seed stays, because the same key is still set up as another wallet on this device.'
export const REMOVE_SOLE = 'This app will no longer hold the encrypted seed for this wallet.'
export const REMOVE_LAST = 'This is the last wallet on this device. Removing it returns the app to setup, and the App PIN is removed too.'
export const REMOVE_BACKUP = 'Make sure you have your own backup — this cannot be undone from within the app.'
export const REMOVE_LOCKED_REASON = 'Open this wallet to remove it.'
export const REMOVE_DONE = 'Wallet removed from this device.'
export const REMOVE_PIN_NOT_DISCARDED = 'The wallet was removed, but the App PIN could not be removed.'
export const REMOVE_FAILED = 'The wallet could not be removed completely. The Wallets list shows what this device still holds.'

export type RemoveBody = 'sibling' | 'sole' | 'last'

/** Which consequence the dialog states, read from the Wallets as they are now:
 * the last Wallet on the device, else another network view of the same Seed, else
 * the Seed's only view. */
export function removeBodyFor(wallets: readonly WalletMeta[], walletId: string): RemoveBody {
  if (wallets.length <= 1) return 'last'
  const seedId = wallets.find((w) => w.id === walletId)?.seedId
  return wallets.filter((w) => w.seedId === seedId).length > 1 ? 'sibling' : 'sole'
}

/** The dialog's sentences, in order. Exactly one of the three bodies, then the backup line. */
export function removeSentences(body: RemoveBody): string[] {
  const first = body === 'sibling' ? [REMOVE_SIBLING] : body === 'sole' ? [REMOVE_SOLE] : [REMOVE_LAST, REMOVE_SOLE]
  return [...first, REMOVE_BACKUP]
}
