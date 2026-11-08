import type { WalletKind } from '@/lib/crypto/db'

/**
 * The approved words for Wallet kinds (OS-FR-1, OS-FR-12). Every string here is
 * copied character for character from the offline signing UX spine
 * (`_bmad-output/planning-artifacts/ux-designs/ux-xrpl-wallet-2026-11-07/EXPERIENCE.md`):
 * the kind words, and P-3, P-5 and P-62, which the owner approved on 2026-11-08.
 * `wallet-kind-words.test.ts` compares each one with that file. No other P-n is
 * approved, so none is here: a screen not built yet shows its title only.
 */

/** The kind stamp's word (EXPERIENCE "Chooser card, per kind"). */
export const KIND_WORDS: Record<WalletKind, string> = {
  online: 'Online',
  offline: 'Offline',
  transmitter: 'Transmitter',
}

/** P-3: the Offline Sign screen title (selector label "Sign"). */
export const OFFLINE_SIGN_TITLE = 'Sign a transaction from your Transmitter wallet'

/** P-5: the Transmitter card and This wallet plate, unsynced. */
export const NOT_SYNCED = 'Not synced'

/** P-62, Offline: selector labels, then the screen titles (P-3 for Sign). */
export const OFFLINE_SCREENS = {
  newTransaction: { label: 'New transaction', title: 'New transaction' },
  signFromTransmitter: { label: 'Sign', title: OFFLINE_SIGN_TITLE },
  receive: { label: 'Receive', title: 'Receive' },
  signed: { label: 'Signed', title: 'Signed by this wallet' },
} as const

/** P-62, Transmitter, unsynced. Account, History and New transaction come with Sync (story 4). */
export const TRANSMITTER_SCREENS = {
  transmit: { label: 'Transmit', title: 'Transmit' },
} as const
