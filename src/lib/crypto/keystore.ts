import { Wallet } from 'xrpl'
import { aesDecrypt, aesEncrypt } from './aes'
import { listStoredWallets, putStoredWallet, deleteStoredWallet, type StoredWallet } from './db'

export interface WalletMeta {
  id: string
  label: string
  address: string
  createdAt: number
}

function toMeta(w: StoredWallet): WalletMeta {
  return { id: w.id, label: w.label, address: w.address, createdAt: w.createdAt }
}

export async function listWallets(): Promise<WalletMeta[]> {
  const wallets = await listStoredWallets()
  return wallets.map(toMeta)
}

/** Generates a brand-new XRPL keypair locally (no network call) and stores
 * the seed encrypted under the given vault key — account-onboarding.md US-1. */
export async function generateAndStoreWallet(label: string, vaultKey: CryptoKey): Promise<{ meta: WalletMeta; seed: string }> {
  const wallet = Wallet.generate()
  const meta = await storeWallet(label, wallet.seed!, vaultKey)
  return { meta, seed: wallet.seed! }
}

/**
 * Derives an account's classic address from a seed, with no storage side
 * effect and no network call — AD-3: screens that need an address before a
 * wallet exists (the disabled-master-key pre-flight probe on both import
 * paths) ask the keystore for it instead of importing `Wallet` themselves.
 *
 * Throws on a malformed seed, exactly as `Wallet.fromSeed` does. The seed
 * stays a parameter and a local: nothing here stores or logs it.
 */
export function addressFromSeed(seed: string): string {
  return Wallet.fromSeed(seed).address
}

/**
 * True if a string is a seed this wallet can sign with — AD-3: the check
 * lives with the key material, so a screen validating typed input never has
 * to construct a `Wallet` (or call a derivation it does not want the result
 * of) to find out. Offline, and it neither stores nor logs the seed.
 */
export function isValidSeed(seed: string): boolean {
  try {
    Wallet.fromSeed(seed)
    return true
  } catch {
    return false
  }
}

/**
 * Turns what the operator typed or pasted into the Seed field into a Seed, or
 * `null` if it is not one — the single place both import screens normalise
 * their input (Epic 11, story 11.2).
 *
 * Leading and trailing whitespace is removed, because a password manager or a
 * copied line routinely brings a newline or a space with it, and a correct
 * backup must not read as a corrupt one. Whitespace *inside* the value is not
 * removed: that is a different string, and guessing at it is not this
 * function's job. A value that is whitespace only trims to `''`, which is not
 * a Seed, so it is reported as malformed rather than ignored.
 *
 * Offline; neither stores nor logs the value. The caller holds the result in a
 * ref, never in React state (guardrail #3).
 */
export function parseSeedInput(raw: string): string | null {
  const seed = raw.trim()
  return isValidSeed(seed) ? seed : null
}

/** Imports an existing wallet from a seed — account-onboarding.md US-2. */
export async function importAndStoreWallet(label: string, seed: string, vaultKey: CryptoKey): Promise<WalletMeta> {
  const wallet = Wallet.fromSeed(seed) // throws on malformed seed
  return storeWallet(label, wallet.seed!, vaultKey)
}

async function storeWallet(label: string, seed: string, vaultKey: CryptoKey): Promise<WalletMeta> {
  const wallet = Wallet.fromSeed(seed)
  const encryptedSeed = await aesEncrypt(vaultKey, seed)
  const stored: StoredWallet = {
    id: crypto.randomUUID(),
    label,
    address: wallet.address,
    encryptedSeed: { ivB64: encryptedSeed.ivB64, ciphertextB64: encryptedSeed.ciphertextB64 },
    createdAt: Date.now(),
  }
  await putStoredWallet(stored)
  return toMeta(stored)
}

/** Decrypts a wallet's seed transiently to build a signing Wallet instance.
 * The caller must not store the returned Wallet/seed beyond the immediate
 * signing operation — see docs/decisions.md guardrail #3 (memory hygiene). */
export async function unlockWalletForSigning(walletId: string, vaultKey: CryptoKey): Promise<Wallet> {
  const all = await listStoredWallets()
  const stored = all.find((w) => w.id === walletId)
  if (!stored) throw new Error('Wallet not found in local vault.')
  const seed = await aesDecrypt(vaultKey, stored.encryptedSeed.ivB64, stored.encryptedSeed.ciphertextB64)
  return Wallet.fromSeed(seed)
}

/** Reveals the plaintext seed for backup/re-verification, behind the same
 * unlock gate — account-onboarding.md US-6. */
export async function revealSeed(walletId: string, vaultKey: CryptoKey): Promise<string> {
  const wallet = await unlockWalletForSigning(walletId, vaultKey)
  return wallet.seed!
}

export async function removeWallet(walletId: string): Promise<void> {
  await deleteStoredWallet(walletId)
}
