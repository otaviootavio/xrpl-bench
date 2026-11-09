import type { WalletMeta } from '@/lib/crypto/keystore'

/** Shipped words (TrustLinesTab, SendTab) for an address that does not check. */
export const INVALID_ADDRESS = "That doesn't look like a valid XRPL address."

/**
 * P-8 (OS-FR-3): the same address as an Offline and a Transmitter Wallet on one
 * device is warned about, never refused. The address alone is compared, on any
 * Network: a Transmitter makes this device an online one, and that is the risk
 * for the offline key whatever Network either Wallet is on. Pure.
 */

/** An Offline Wallet on this device has `address` (first form: Add Transmitter, Sync). */
export function offlineWalletHas(wallets: readonly WalletMeta[], address: string): boolean {
  return address !== '' && wallets.some((w) => w.kind === 'offline' && w.address === address)
}

/** A Transmitter on this device is synced to `address` (second form: an Offline
 * import; an Offline create makes a fresh random key, which no Transmitter can hold). */
export function transmitterSyncedTo(wallets: readonly WalletMeta[], address: string): boolean {
  return address !== '' && wallets.some((w) => w.kind === 'transmitter' && w.address === address)
}
