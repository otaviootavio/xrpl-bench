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
