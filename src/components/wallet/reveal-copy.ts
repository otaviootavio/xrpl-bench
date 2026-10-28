import { LEGACY_LOCK_ID } from '@/lib/crypto/db'
import type { WalletMeta } from '@/lib/crypto/keystore'

/** Which check the reveal will ask next, in plain words (FR-69). Mirrors
 * `keystore.revealSeed`: a sealed Wallet its Signing Check, a Passkey-Derived one
 * its passkey, a Standard one its Open Check (none: nothing more). */
export function revealCheckSentence(wallet: WalletMeta | undefined): string {
  if (!wallet) return ''
  if (wallet.seedMethod === 'passkey-derived') return 'After you confirm, your passkey will be asked.'
  // The legacy lock's real check is read from the lock at reveal time, not from this meta.
  const standard = !wallet.signingCheck || wallet.signingCheck === 'standard'
  if (wallet.lockId === LEGACY_LOCK_ID && standard) {
    return "After you confirm, your passkey or App PIN will be asked, whichever this wallet's lock uses."
  }
  if (wallet.signingCheck === 'pin') return 'After you confirm, your App PIN will be asked.'
  if (wallet.signingCheck === 'passkey') return 'After you confirm, your passkey will be asked.'
  switch (wallet.openCheck) {
    case 'pin':
      return 'After you confirm, your App PIN will be asked.'
    case 'passkey':
      return 'After you confirm, your passkey will be asked.'
    case 'either':
      return 'After you confirm, your passkey will be asked, or your App PIN if this device cannot use one.'
    default:
      return 'After you confirm, nothing more will be asked and the Seed is shown.'
  }
}
