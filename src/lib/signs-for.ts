import { isValidClassicAddress } from 'xrpl'
import type { KeyWalletMeta, WalletMeta } from '@/lib/crypto/keystore'
import type { RegularKeySet } from '@/lib/transmit-step'
import { isKeyWallet } from '@/lib/wallet-meta'

/** What a typed Signs-for address is (OS-FR-20): empty, not an address, or one. */
export function signsForDraftState(draft: string): 'empty' | 'invalid' | 'valid' {
  const typed = draft.trim()
  if (typed === '') return 'empty'
  return isValidClassicAddress(typed) ? 'valid' : 'invalid'
}

/** The ids `SignsForFields` gives its field, its reason and its P-40 note, for a key that points at them. */
export const signsForIds = (idPrefix: string) => ({ field: `${idPrefix}-signs-for`, error: `${idPrefix}-signs-for-error`, note: `${idPrefix}-signs-for-note` })

/** The key Wallet P-54 offers to set, or `null` when the key is not a Wallet here on
 * that Network. A Wallet with that key that already signs for the Account is `'done'`:
 * there is nothing to offer. Pure. */
export function signsForTarget(wallets: readonly WalletMeta[], set: RegularKeySet): KeyWalletMeta | 'done' | null {
  const holders = wallets.filter(isKeyWallet).filter((w) => w.keyAddress === set.regularKey && w.network === set.network)
  if (holders.some((w) => w.address === set.account)) return 'done'
  return holders[0] ?? null
}
