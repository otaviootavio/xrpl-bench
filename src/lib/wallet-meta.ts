import type { KeyWalletMeta, WalletMeta } from '@/lib/crypto/keystore'

/** An Online or Offline Wallet: it holds a key. A Transmitter never does (OS-FR-3).
 * Kept out of the keystore module so a screen can narrow without loading it. */
export function isKeyWallet(w: WalletMeta): w is KeyWalletMeta {
  return w.kind !== 'transmitter'
}
