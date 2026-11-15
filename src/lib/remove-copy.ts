import type { WalletMeta } from '@/lib/crypto/keystore'

/** The shipped Remove sentences (Settings' dialog says the same), and the chooser's last-wallet one. */
export const REMOVE_TITLE = 'Remove this wallet?'
export const REMOVE_SOLE = 'This app will no longer hold the encrypted seed for this wallet.'
export const REMOVE_LAST = 'This is the last wallet on this device. Removing it returns the app to setup, and the App PIN is removed too.'
export const REMOVE_BACKUP = 'Make sure you have your own backup — this cannot be undone from within the app.'
export const REMOVE_DONE = 'Wallet removed from this device.'
export const REMOVE_PIN_NOT_DISCARDED = 'The wallet was removed, but the App PIN could not be removed.'
export const REMOVE_FAILED = 'The wallet could not be removed completely. The Wallets list shows what this device still holds.'

/** A Transmitter holds no Seed (OS-FR-3), so no Seed sentence is said for it. */
export type RemoveBody = 'sole' | 'last' | 'transmitter' | 'transmitter-last'

/** Which consequence the dialog states, read from the Wallets as they are now:
 * the last Wallet on the device, else the Seed's only Wallet. A Seed record holds one
 * Wallet the app lists (FR-75's controlled views were dropped by story 12), so its
 * Seed always goes with it. `holdsUnlisted`: the device also stores a Seed record that
 * lists no Wallet; it stays, so removing the last listed Wallet does not empty the
 * device and the "last wallet" sentence is not said. */
export function removeBodyFor(wallets: readonly WalletMeta[], walletId: string, holdsUnlisted = false): RemoveBody {
  const target = wallets.find((w) => w.id === walletId)
  const last = wallets.length <= 1 && !holdsUnlisted
  if (target?.kind === 'transmitter') return last ? 'transmitter-last' : 'transmitter'
  return last ? 'last' : 'sole'
}

/** The dialog's sentences, in order. Exactly one of the two bodies, then the backup line. */
export function removeSentences(body: RemoveBody): string[] {
  // No approved sentence states a Transmitter's consequence beyond the title and the
  // plate's own line; the Seed and backup sentences are not true for it (story 4).
  if (body === 'transmitter') return []
  if (body === 'transmitter-last') return [REMOVE_LAST]
  const first = body === 'sole' ? [REMOVE_SOLE] : [REMOVE_LAST, REMOVE_SOLE]
  return [...first, REMOVE_BACKUP]
}
