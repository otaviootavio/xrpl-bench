import type { KeyWalletMeta, WalletMeta } from '@/lib/crypto/keystore'
import type { KeyState } from '@/lib/qr-codec'
import { isKeyWallet } from '@/lib/wallet-meta'

/**
 * Which key warning applies where (OS-FR-21, CAP-14; `consequence-texts.md` W1 to W5).
 * Every rule here warns; none refuses (SPEC "Trust the user"). Pure: the screens pass
 * the Wallets on this device and the key state they read.
 */

/** W2's two black-hole addresses (`consequence-texts.md`): nobody holds their keys. */
export const BLACK_HOLES = ['rrrrrrrrrrrrrrrrrrrrrhoLvTp', 'rrrrrrrrrrrrrrrrrrrrBZbvji'] as const

export function isBlackHole(address: string | null | undefined): boolean {
  return typeof address === 'string' && (BLACK_HOLES as readonly string[]).includes(address)
}

/**
 * The key Wallet on this device whose key is `address` (P-30), or `undefined` (W1). Any
 * kind that holds a key and any Network: the key is the same on every Network, so this
 * app can sign with it (story 9's rule on the Offline Sign review).
 */
export function keyWalletHere(wallets: readonly WalletMeta[], address: string | null | undefined): KeyWalletMeta | undefined {
  if (!address) return undefined
  return wallets.filter(isKeyWallet).find((w) => w.keyAddress === address)
}

/**
 * W5 (`consequence-texts.md`): the transaction ends a Regular Key that is set, by replacing
 * it with another key or removing it (`newKey` null or absent). Only when the key state was
 * read: unknown says nothing (the rows already say P-29), and re-setting the same key
 * changes nothing.
 */
export function endsSetRegularKey(newKey: string | null | undefined, keyState: KeyState | null | undefined): boolean {
  if (!keyState || keyState === 'unknown' || keyState.regular_key === null) return false
  return (newKey ?? null) !== keyState.regular_key
}

/** W2 on master key off: the Regular Key the key state shows is a black hole. */
export function masterOffToBlackHole(keyState: KeyState | null | undefined): boolean {
  return !!keyState && keyState !== 'unknown' && isBlackHole(keyState.regular_key)
}

/**
 * The Wallet that can run W4's "Test the Regular Key" in place for `account`: an Online
 * Wallet on this device, on the Account's Network, whose key is the Regular Key and which
 * already Signs for the Account (so its own Signing Check signs for it; no other signing
 * path exists), and whose lock is open. `null`: the test points to the wallet that has the
 * key (P-50). Of several, one that is not `account` itself comes first.
 */
export function regularKeyTester(
  wallets: readonly WalletMeta[],
  account: Pick<KeyWalletMeta, 'id' | 'address' | 'network'>,
  regularKey: string | null | undefined,
  openLocks: Readonly<Record<string, unknown>>,
): KeyWalletMeta | null {
  if (!regularKey) return null
  const able = wallets
    .filter(isKeyWallet)
    .filter(
      (w) =>
        w.kind === 'online' &&
        w.network === account.network &&
        w.keyAddress === regularKey &&
        w.address === account.address &&
        Object.prototype.hasOwnProperty.call(openLocks, w.lockId),
    )
  return able.find((w) => w.id !== account.id) ?? able[0] ?? null
}

/**
 * Owner decision 2026-11-15: a SetRegularKey to a black-hole address while the master key is
 * known off, with no signer list, is irreversible-class like master key off (nobody can ever
 * sign again): on Mainnet the signing key is held until "turn off" is typed. A signer list
 * whose read is unknown counts as none (the safe side). A master key state that is unknown
 * does not trigger it: the decision names "known off" (the warnings W2 and P-29 still show).
 */
export function blackHoleLockout(newKey: string | null | undefined, keyState: KeyState | null | undefined): boolean {
  if (!isBlackHole(newKey) || !keyState || keyState === 'unknown') return false
  return keyState.master_key === 'off' && (keyState.signer_list === null || keyState.signer_list === 'unknown')
}
