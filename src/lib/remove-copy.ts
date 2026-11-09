import type { WalletMeta } from '@/lib/crypto/keystore'

/** The shipped Remove sentences (Settings' dialog says the same), and the chooser's last-wallet one. */
export const REMOVE_TITLE = 'Remove this wallet?'
export const REMOVE_SIBLING = 'This removes only this one wallet. The encrypted seed stays, because the same key is still set up as another wallet on this device.'
export const REMOVE_SOLE = 'This app will no longer hold the encrypted seed for this wallet.'
export const REMOVE_LAST = 'This is the last wallet on this device. Removing it returns the app to setup, and the App PIN is removed too.'
export const REMOVE_BACKUP = 'Make sure you have your own backup — this cannot be undone from within the app.'
export const REMOVE_DONE = 'Wallet removed from this device.'
export const REMOVE_PIN_NOT_DISCARDED = 'The wallet was removed, but the App PIN could not be removed.'
export const REMOVE_FAILED = 'The wallet could not be removed completely. The Wallets list shows what this device still holds.'

/** A Transmitter holds no Seed (OS-FR-3), so no Seed sentence is said for it. */
export type RemoveBody = 'sibling' | 'sole' | 'last' | 'transmitter' | 'transmitter-last'

/** Which consequence the dialog states, read from the Wallets as they are now:
 * the last Wallet on the device, else a controlled account sharing the Seed, else
 * the Seed's only view. */
export function removeBodyFor(wallets: readonly WalletMeta[], walletId: string): RemoveBody {
  const target = wallets.find((w) => w.id === walletId)
  if (target?.kind === 'transmitter') return wallets.length <= 1 ? 'transmitter-last' : 'transmitter'
  if (wallets.length <= 1) return 'last'
  const others = wallets.filter((w) => w.seedId === target?.seedId && w.id !== walletId)
  const controlled = (w: WalletMeta) => w.kind !== 'transmitter' && w.address !== w.keyAddress
  return others.length > 0 && (controlled(target as WalletMeta) || others.some(controlled)) ? 'sibling' : 'sole'
}

/** The dialog's sentences, in order. Exactly one of the three bodies, then the backup line. */
export function removeSentences(body: RemoveBody): string[] {
  // No approved sentence states a Transmitter's consequence beyond the title and the
  // plate's own line; the Seed and backup sentences are not true for it (story 4).
  if (body === 'transmitter') return []
  if (body === 'transmitter-last') return [REMOVE_LAST]
  const first = body === 'sibling' ? [REMOVE_SIBLING] : body === 'sole' ? [REMOVE_SOLE] : [REMOVE_LAST, REMOVE_SOLE]
  return [...first, REMOVE_BACKUP]
}
