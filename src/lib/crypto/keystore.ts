import { decodeSeed, ECDSA, Wallet } from 'xrpl'
import { canonicalNodeUrl, type NetworkId } from '@/lib/xrpl/networks'
import { aesDecrypt, aesEncrypt } from './aes'
import { HKDF_INFO } from './auth'
import { bufToB64 } from './encoding'
import { PBKDF2_ITERATIONS } from './pin'
import { PRF_SALT } from './webauthn'
import {
  LEGACY_LOCK_ID,
  legacyOpenCheck,
  listStoredWallets,
  migrateLegacyVault as migrateLegacyVaultRecords,
  mutateStoredWallet,
  putStoredWallet,
  type OpenCheck,
  type SeedAlgorithm,
  type SigningCheck,
  type StoredWallet,
  type WalletView,
} from './db'

/** A Wallet as the rest of the app sees it: one view over a Seed record.
 * `id` is the walletId — selection state is never an address (AD-18). */
export interface WalletMeta {
  id: string
  seedId: string
  label: string
  address: string
  createdAt: number
  network: NetworkId
  /** A custom Node's `wss://` URL, proven for `network` when it was saved.
   * Absent: the network's built-in Nodes. */
  node?: string
  algorithm: SeedAlgorithm
  openCheck: OpenCheck
  signingCheck: SigningCheck
}

/** Only reachable for a record the migration has not reached yet (it failed or
 * has not run): its one view is shown on the caller's `fallbackNetwork` (the
 * app-wide network) and is never persisted. */
function viewsOf(w: StoredWallet, fallbackNetwork: NetworkId = 'testnet'): WalletView[] {
  return w.views && w.views.length > 0 ? w.views : [{ walletId: w.id, network: fallbackNetwork }]
}

function toMetas(w: StoredWallet, fallbackNetwork?: NetworkId): WalletMeta[] {
  return viewsOf(w, fallbackNetwork).map((v) => ({
    id: v.walletId,
    seedId: w.id,
    label: w.label,
    address: w.address,
    createdAt: w.createdAt,
    network: v.network,
    ...(v.node ? { node: v.node } : {}),
    algorithm: w.algorithm ?? 'unresolved',
    openCheck: w.openCheck ?? 'pin',
    signingCheck: w.signingCheck ?? 'standard',
  }))
}

function findSeedRecord(all: StoredWallet[], walletId: string): StoredWallet | undefined {
  return all.find((w) => viewsOf(w).some((v) => v.walletId === walletId))
}

export async function listWallets(fallbackNetwork: NetworkId = 'testnet'): Promise<WalletMeta[]> {
  const wallets = await listStoredWallets()
  return wallets.flatMap((w) => toMetas(w, fallbackNetwork))
}

/** Relabels every legacy Seed record onto the legacy lock — AD-27. Run once, at
 * app start, after the app store has hydrated (its `network` and
 * `autoLockMinutes` are the inputs). Holds no Seed and no key. */
export async function migrateLegacyVault(input: { network: NetworkId; autoLockMinutes: number }): Promise<boolean> {
  return migrateLegacyVaultRecords({
    ...input,
    hkdfInfo: HKDF_INFO,
    prfSaltB64: bufToB64(PRF_SALT.slice().buffer),
    pbkdf2Iterations: PBKDF2_ITERATIONS,
  })
}

/** The algorithm a Seed's own encoding names. */
function algorithmOfSeed(seed: string): 'ed25519' | 'secp256k1' {
  return decodeSeed(seed).type === 'ed25519' ? 'ed25519' : 'secp256k1'
}

/** Generates a brand-new XRPL keypair locally (no network call) and stores
 * the seed encrypted under the given vault key — account-onboarding.md US-1. */
export async function generateAndStoreWallet(label: string, vaultKey: CryptoKey, network: NetworkId): Promise<{ meta: WalletMeta; seed: string }> {
  const wallet = Wallet.generate()
  const meta = await storeWallet(label, wallet.seed!, vaultKey, network)
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
export async function importAndStoreWallet(label: string, seed: string, vaultKey: CryptoKey, network: NetworkId): Promise<WalletMeta> {
  const wallet = Wallet.fromSeed(seed) // throws on malformed seed
  return storeWallet(label, wallet.seed!, vaultKey, network)
}

async function storeWallet(label: string, seed: string, vaultKey: CryptoKey, network: NetworkId): Promise<WalletMeta> {
  const wallet = Wallet.fromSeed(seed)
  const encryptedSeed = await aesEncrypt(vaultKey, seed)
  const walletId = crypto.randomUUID()
  const stored: StoredWallet = {
    id: walletId,
    label,
    address: wallet.address,
    encryptedSeed: { ivB64: encryptedSeed.ivB64, ciphertextB64: encryptedSeed.ciphertextB64 },
    createdAt: Date.now(),
    // The legacy shape (story 12.1): under the app-wide key until story 14.1.
    seedMethod: 'stored',
    algorithm: algorithmOfSeed(wallet.seed!),
    lockId: LEGACY_LOCK_ID,
    openCheck: await legacyOpenCheck(),
    signingCheck: 'standard',
    views: [{ walletId, network }],
  }
  await putStoredWallet(stored)
  return toMetas(stored)[0]
}

/** Decrypts a wallet's seed transiently to build a signing Wallet instance.
 * The caller must not store the returned Wallet/seed beyond the immediate
 * signing operation — see docs/decisions.md guardrail #3 (memory hygiene).
 *
 * `walletId` names a view; it is resolved to its Seed record. A record whose
 * algorithm is still `unresolved` has it derived here, from the Seed, and
 * stored only if the address it gives equals the stored address — otherwise
 * this throws and stores nothing (fails closed, AD-18). */
export async function unlockWalletForSigning(walletId: string, vaultKey: CryptoKey): Promise<Wallet> {
  const all = await listStoredWallets()
  const stored = findSeedRecord(all, walletId)
  if (!stored) throw new Error('Wallet not found in local vault.')
  const seed = await aesDecrypt(vaultKey, stored.encryptedSeed.ivB64, stored.encryptedSeed.ciphertextB64)
  if (stored.algorithm && stored.algorithm !== 'unresolved') return Wallet.fromSeed(seed)

  const algorithm = algorithmOfSeed(seed)
  const wallet = Wallet.fromSeed(seed, { algorithm: algorithm === 'ed25519' ? ECDSA.ed25519 : ECDSA.secp256k1 })
  if (wallet.address !== stored.address) {
    throw new Error('This seed does not match the address stored for this wallet.')
  }
  try {
    await mutateStoredWallet(stored.id, (current) =>
      current.algorithm && current.algorithm !== 'unresolved' ? current : { ...current, algorithm },
    )
  } catch {
    // Best-effort: the decrypt and the address check have already succeeded,
    // so a failed write (quota, abort) must not block signing or reveal. The
    // algorithm is simply resolved again next time.
  }
  return wallet
}

/** Reveals the plaintext seed for backup/re-verification, behind the same
 * unlock gate — account-onboarding.md US-6. */
export async function revealSeed(walletId: string, vaultKey: CryptoKey): Promise<string> {
  const wallet = await unlockWalletForSigning(walletId, vaultKey)
  return wallet.seed!
}

/** Removes one Wallet. Its Seed record goes with its last view and not before:
 * another network's view of the same Seed keeps working. */
export async function removeWallet(walletId: string): Promise<void> {
  const record = findSeedRecord(await listStoredWallets(), walletId)
  if (!record) return
  await mutateStoredWallet(record.id, (current) => {
    const remaining = viewsOf(current).filter((v) => v.walletId !== walletId)
    return remaining.length === 0 ? null : { ...current, views: remaining }
  })
}

/** "Use on another network": a second Wallet over the SAME Seed record — own
 * walletId, no new ciphertext. Rejects a network the Seed already has a view
 * on. */
export async function addNetworkView(walletId: string, network: NetworkId): Promise<WalletMeta> {
  const record = findSeedRecord(await listStoredWallets(), walletId)
  if (!record) throw new Error('Wallet not found in local vault.')
  if (!record.views || record.views.length === 0) {
    throw new Error('This wallet is not migrated yet. Restart the app and try again.')
  }
  const newWalletId = crypto.randomUUID()
  let added = false
  await mutateStoredWallet(record.id, (current) => {
    const views = viewsOf(current)
    if (views.some((v) => v.network === network)) return current
    added = true
    return { ...current, views: [...views, { walletId: newWalletId, network }] }
  })
  if (!added) throw new Error('This wallet is already set up on that network.')
  const meta = (await listWallets(network)).find((w) => w.id === newWalletId)
  if (!meta) throw new Error('Wallet not found in local vault.')
  return meta
}

/** Sets or clears (`undefined`) the custom Node on one Wallet's view only —
 * AD-18/19. The caller has already proven `node` for the Wallet's network
 * (`verifyNode`); this stores it and touches nothing else, ciphertext
 * included. Returns the Wallet's refreshed meta. */
export async function setWalletNode(walletId: string, node: string | undefined): Promise<WalletMeta> {
  const canonical = node === undefined ? undefined : canonicalNodeUrl(node)
  if (node !== undefined && !canonical) {
    throw new Error('A custom Node must be a wss:// address with no username, password, query or fragment.')
  }
  const record = findSeedRecord(await listStoredWallets(), walletId)
  if (!record) throw new Error('Wallet not found in local vault.')
  await mutateStoredWallet(record.id, (current) => ({
    ...current,
    views: viewsOf(current).map((v) => {
      if (v.walletId !== walletId) return v
      const { node: _previous, ...rest } = v
      return canonical ? { ...rest, node: canonical } : rest
    }),
  }))
  const meta = (await listWallets()).find((w) => w.id === walletId)
  if (!meta) throw new Error('Wallet not found in local vault.')
  return meta
}
