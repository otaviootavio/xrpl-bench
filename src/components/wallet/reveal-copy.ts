import type { WalletMeta } from '@/lib/crypto/keystore'

/** Which check the reveal will ask next, in plain words (FR-69). Mirrors
 * `keystore.revealSeed`: a sealed Wallet its Signing Check, a Passkey-Derived one
 * its passkey, a Standard one its Open Check (none: nothing more). */
export function revealCheckSentence(wallet: WalletMeta | undefined): string {
  if (!wallet) return ''
  if (wallet.seedMethod === 'passkey-derived') return 'After you confirm, your passkey will be asked.'
  if (wallet.signingCheck === 'pin') return 'After you confirm, your App PIN will be asked.'
  if (wallet.signingCheck === 'passkey') return 'After you confirm, your passkey will be asked.'
  switch (wallet.openCheck) {
    case 'pin':
      return 'After you confirm, your App PIN will be asked.'
    case 'passkey':
      return 'After you confirm, your passkey will be asked.'
    default:
      return 'After you confirm, nothing more will be asked and the Seed is shown.'
  }
}
