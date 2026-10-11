import { decodeSeed, ECDSA, Wallet } from 'xrpl'
import { canonicalNodeUrl, type NetworkId } from '@/lib/xrpl/networks'
import type { Signer, SigningHandle } from '@/lib/xrpl/writes'
import { aesDecrypt, aesEncrypt } from './aes'
import { deriveAesKeyFromBits, HKDF_INFO } from './derive'
import { createLock, deleteLock, discardUnusedAppPin, getLockInfo, hasAppPin, setAutoLockMinutes, withAppPin, type CheckResult } from './lock'
import { checkLockRequest, checkWalletRequest, type NewOpenCheck, type PasskeyCapability, type PolicyVerdict, type SigningKind } from './policy'
import { b64ToBuf, bufToB64 } from './encoding'
import { attemptPin, getLockoutState, PBKDF2_ITERATIONS, recordFailure, triesRemaining } from './pin'
import { assertPasskeyAndDeriveBits, isCancelled, isPrfUnsupported, isWebAuthnSupported, PRF_SALT, registerPasskey } from './webauthn'
import {
  getVaultMeta,
  LEGACY_LOCK_ID,
  listStoredWallets,
  migrateLegacyVault as migrateLegacyVaultRecords,
  mutateStoredWallet,
  putStoredWallet,
  type OpenCheck,
  type SeedAlgorithm,
  type SigningCheck,
  type SigningSeal,
  type StoredWallet,
  type WalletView,
} from './db'

/** A Wallet as the rest of the app sees it: one view over a Seed record.
 * `id` is the walletId — selection state is never an address (AD-18). */
export interface WalletMeta {
  id: string
  seedId: string
  /** The lock whose Open Key opens this Wallet's Seed (AD-21). Legacy Wallets
   * all share `legacy`. */
  lockId: string
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
    lockId: w.lockId ?? LEGACY_LOCK_ID,
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
export async function generateAndStoreWallet(
  label: string,
  vaultKey: CryptoKey,
  network: NetworkId,
  lockId: string = LEGACY_LOCK_ID,
): Promise<{ meta: WalletMeta; seed: string }> {
  const wallet = Wallet.generate()
  const meta = await storeWallet(label, wallet.seed!, vaultKey, network, lockId)
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
export async function importAndStoreWallet(
  label: string,
  seed: string,
  vaultKey: CryptoKey,
  network: NetworkId,
  lockId: string = LEGACY_LOCK_ID,
): Promise<WalletMeta> {
  const wallet = Wallet.fromSeed(seed) // throws on malformed seed
  return storeWallet(label, wallet.seed!, vaultKey, network, lockId)
}

/** Policy for putting a Wallet or view on `network` under an EXISTING lock
 * (AD-28): a Mainnet one may not sit under a lock with no Open Check or an
 * auto-lock under a minute. Throws the policy's plain reason, so nothing is
 * written. */
async function assertLockAllowsNetwork(lockId: string, network: NetworkId): Promise<void> {
  const info = await getLockInfo(lockId)
  const verdict = checkLockRequest({
    network,
    openCheck: info.openCheck === 'none' ? 'none' : info.openCheck === 'passkey' ? 'passkey' : 'pin',
    autoLockMinutes: info.autoLockMinutes,
  })
  if (!verdict.ok) throw new Error(verdict.reason)
}

/** `vaultKey` must be the Open Key of `lockId`: a Seed written under one lock's
 * key and labelled with another's could never be opened. Creating a Wallet under
 * a NEW lock is the creation flow's job (story 5). */
async function storeWallet(label: string, seed: string, vaultKey: CryptoKey, network: NetworkId, lockId: string): Promise<WalletMeta> {
  await assertLockAllowsNetwork(lockId, network)
  const wallet = Wallet.fromSeed(seed)
  const encryptedSeed = await aesEncrypt(vaultKey, seed)
  const walletId = crypto.randomUUID()
  const stored: StoredWallet = {
    id: walletId,
    label,
    address: wallet.address,
    encryptedSeed: { ivB64: encryptedSeed.ivB64, ciphertextB64: encryptedSeed.ciphertextB64 },
    createdAt: Date.now(),
    // Under the Open Key of the lock it is stored with: the legacy lock's, until
    // story 5 creates Wallets under their own.
    seedMethod: 'stored',
    algorithm: algorithmOfSeed(wallet.seed!),
    lockId,
    openCheck: (await getLockInfo(lockId)).openCheck,
    signingCheck: 'standard',
    views: [{ walletId, network }],
  }
  await putStoredWallet(stored)
  return toMetas(stored)[0]
}

// ---------------------------------------------------------------------------
// Signing (AD-22, AD-23, AD-25)
// ---------------------------------------------------------------------------

export type { CheckResult }

/** How the keystore asks the person for a credential without importing UI
 * (parent AD-1). `pin` resolves the PIN typed, or `null` if the prompt was
 * dismissed; it is told how many tries remain. A passkey needs no callback: its
 * prompt is the browser's own. */
export interface Prompts {
  pin(info: { triesRemaining: number }): Promise<string | null>
}

/** What a check needs. `openKey` is the session's key: it opens a Standard
 * Wallet and, by construction, nothing else (AD-23). */
export interface SigningContext {
  openKey: CryptoKey | null
  prompts: Prompts
}

/** A check that did not pass, thrown by a `SigningHandle.open` so the choke
 * point submits nothing. Carries the typed result, never a Seed or a key. */
export class SigningCheckError extends Error {
  readonly result: Exclude<CheckResult<unknown>, { status: 'ok' }>
  constructor(result: Exclude<CheckResult<unknown>, { status: 'ok' }>) {
    super(describeCheckFailure(result))
    this.name = 'SigningCheckError'
    this.result = result
  }
}

export function describeCheckFailure(result: Exclude<CheckResult<unknown>, { status: 'ok' }>): string {
  switch (result.status) {
    case 'cancelled':
      return 'Cancelled. Nothing was signed.'
    case 'unsupported':
      return 'This device or browser cannot use that passkey to sign. Nothing was signed.'
    case 'locked-out':
      return result.hard
        ? 'Too many failed PIN attempts. Nothing was signed.'
        : `Too many failed PIN attempts. Try again in ${Math.max(1, Math.ceil((result.lockedUntil - Date.now()) / 1000))}s.`
    case 'wrong-credential':
      return result.kind === 'passkey'
        ? 'Passkey verification failed. Nothing was signed.'
        : `Incorrect PIN. ${result.triesRemaining} ${result.triesRemaining === 1 ? 'try' : 'tries'} remaining.`
  }
}

/** The null prompts: a PIN prompt that is always dismissed. Until the prompt
 * dialogs exist, a Wallet with a Signing Check cannot be opened from a screen,
 * and fails closed as a cancellation. */
export const unavailablePrompts: Prompts = { pin: async () => null }

const SIGN_HKDF_PREFIX = 'xrpl-bench:sign:'

async function importSigningKey(rawB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', b64ToBuf(rawB64), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** Runs one Signing Check against a sealed record and, if it passes, returns
 * the Signing Key (non-extractable, local to the caller). The PIN or passkey
 * key is derived and used for one unwrap and dropped. A wrong credential is
 * proven by the unwrap failing, never by deriving. */
async function openSigningKey(seal: SigningSeal, ctx: SigningContext): Promise<CheckResult<CryptoKey>> {
  if (seal.kind === 'pin') {
    // Checked before prompting: a locked PIN must not be asked for. A
    // passkey-only check never reaches this branch, so a hard lock never blocks it.
    const lockout = await getLockoutState()
    if (lockout.hardLocked || lockout.locked) {
      return { status: 'locked-out', hard: lockout.hardLocked, lockedUntil: lockout.lockedUntil }
    }
    const pin = await ctx.prompts.pin({ triesRemaining: await triesRemaining() })
    if (pin === null) return { status: 'cancelled' }
    const attempt = await attemptPin(pin, async (bits) => {
      const methodKey = await deriveAesKeyFromBits(bits, seal.hkdfInfo)
      return importSigningKey(await aesDecrypt(methodKey, seal.wrappedSigningKey.ivB64, seal.wrappedSigningKey.ciphertextB64))
    })
    if (attempt.status === 'ok') return { status: 'ok', value: attempt.value }
    if (attempt.status === 'locked-out') return attempt
    return { status: 'wrong-credential', kind: 'pin', triesRemaining: attempt.triesRemaining }
  }

  if (!isWebAuthnSupported() || !seal.credentialIdB64 || !seal.prfSaltB64) return { status: 'unsupported' }
  let bits: ArrayBuffer
  try {
    bits = await assertPasskeyAndDeriveBits(seal.credentialIdB64, new Uint8Array(b64ToBuf(seal.prfSaltB64)))
  } catch (err) {
    if (isCancelled(err)) return { status: 'cancelled' }
    if (isPrfUnsupported(err)) return { status: 'unsupported' }
    throw err
  }
  try {
    const methodKey = await deriveAesKeyFromBits(bits, seal.hkdfInfo)
    return { status: 'ok', value: await importSigningKey(await aesDecrypt(methodKey, seal.wrappedSigningKey.ivB64, seal.wrappedSigningKey.ciphertextB64)) }
  } catch {
    // A presented assertion that cannot unwrap counts, as it does at unlock.
    await recordFailure()
    return { status: 'wrong-credential', kind: 'passkey', triesRemaining: await triesRemaining() }
  }
}

/** Decrypts one Seed record's Seed: under the Signing Key if it carries a
 * Signing Check, else under the session's Open key. There is no path that
 * decrypts a sealed record with `openKey` — it has no `encryptedSeed` to
 * decrypt, and the Signing Key is wrapped only by the credential (AD-23). */
async function openSeed(stored: StoredWallet, ctx: SigningContext): Promise<CheckResult<string>> {
  // A record that says it has a Signing Check but lacks its seal must never
  // fall through to the session key: fail closed.
  if (stored.signingCheck && stored.signingCheck !== 'standard' && !(stored.signing && stored.sealedSeed)) {
    throw new Error('This wallet record is incomplete. Nothing was signed.')
  }
  if (stored.signing || stored.sealedSeed) {
    if (!stored.signing || !stored.sealedSeed) throw new Error('This wallet record is incomplete. Nothing was signed.')
    const key = await openSigningKey(stored.signing, ctx)
    if (key.status !== 'ok') return key
    return { status: 'ok', value: await aesDecrypt(key.value, stored.sealedSeed.ivB64, stored.sealedSeed.ciphertextB64) }
  }
  if (!ctx.openKey) throw new Error('Wallet is locked.')
  if (!stored.encryptedSeed) throw new Error('Wallet not found in local vault.')
  return { status: 'ok', value: await aesDecrypt(ctx.openKey, stored.encryptedSeed.ivB64, stored.encryptedSeed.ciphertextB64) }
}

/** An `unresolved` algorithm is derived here, from the Seed, and stored only if
 * the address it gives equals the stored address — otherwise this throws and
 * stores nothing (fails closed, AD-18). */
async function walletFromSeed(stored: StoredWallet, seed: string): Promise<Wallet> {
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

async function seedRecordFor(walletId: string): Promise<StoredWallet> {
  const stored = findSeedRecord(await listStoredWallets(), walletId)
  if (!stored) throw new Error('Wallet not found in local vault.')
  return stored
}

/**
 * Runs the Wallet's Signing Check inside `lib/crypto` and returns a one-use
 * `Signer` (AD-22). The Seed and the Signing Key live only in closures, cleared
 * in `finally`; the Signer signs once and is spent. A Standard Wallet is opened
 * with `ctx.openKey` (throws `Wallet is locked.` without it). Every other
 * outcome is a typed result and nothing is returned that could sign.
 */
export async function openSigner(walletId: string, ctx: SigningContext): Promise<CheckResult<Signer>> {
  const stored = await seedRecordFor(walletId)
  let seed: string | null = null
  let wallet: Wallet | null = null
  try {
    const opened = await openSeed(stored, ctx)
    if (opened.status !== 'ok') return opened
    seed = opened.value
    wallet = await walletFromSeed(stored, seed)
    let held: Wallet | null = wallet
    const signer: Signer = {
      sign(tx) {
        if (!held) throw new Error('This signer was already used.')
        const w = held
        held = null
        // check-write-choke-point-allow
        return w.sign(tx)
      },
      dispose() {
        held = null
      },
    }
    wallet = null
    return { status: 'ok', value: signer }
  } finally {
    seed = null
    wallet = null
  }
}

/** The handle `submitAndClassify` takes. `open` runs the check on demand — the
 * choke point calls it after autofill — and throws `SigningCheckError` on any
 * result but ok. */
export async function signingHandleFor(walletId: string, ctx: SigningContext): Promise<SigningHandle> {
  const stored = await seedRecordFor(walletId)
  return {
    address: stored.address,
    async open() {
      const result = await openSigner(walletId, ctx)
      if (result.status !== 'ok') throw new SigningCheckError(result)
      return result.value
    },
  }
}

/** The one sanctioned way a Seed leaves `lib/crypto`: the same check as
 * signing, the Seed returned to the reveal screen only (AD-22). The caller
 * holds it in a ref and clears it. */
export async function revealSeed(walletId: string, ctx: SigningContext): Promise<CheckResult<string>> {
  const stored = await seedRecordFor(walletId)
  const opened = await openSeed(stored, ctx)
  if (opened.status !== 'ok') return opened
  await walletFromSeed(stored, opened.value)
  return opened
}

/** The one place a Seed is sealed under a Signing Check (AD-23): a random
 * Signing Key encrypts the Seed, and only the credential's key wraps the
 * Signing Key. The Signing Key is never persisted or returned. */
async function buildSeal(
  seed: string,
  credentialKey: CryptoKey,
  seal: Pick<SigningSeal, 'kind' | 'hkdfInfo' | 'credentialIdB64' | 'prfSaltB64'>,
): Promise<{ sealedSeed: { ivB64: string; ciphertextB64: string }; signing: SigningSeal }> {
  const signingKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const wrappedSigningKey = await aesEncrypt(credentialKey, bufToB64(await crypto.subtle.exportKey('raw', signingKey)))
  const sealedSeed = await aesEncrypt(signingKey, seed)
  return { sealedSeed, signing: { ...seal, wrappedSigningKey } }
}

/**
 * Gives a Standard Wallet a Signing Check (AD-23): its Seed is re-encrypted
 * under a random Signing Key wrapped only by the PIN or a passkey, and the
 * Open-key ciphertext is deleted in the same IndexedDB transaction. Any failure
 * leaves the old record untouched. The PIN is proven against the App PIN's own
 * wrapper first (counted); a passkey must produce PRF output (else
 * `unsupported`). The address is unchanged. The edit flow, policy and dialogs
 * belong to later stories; this is only the write.
 */
export async function sealSeedUnderSigningCheck(
  walletId: string,
  kind: 'pin' | 'passkey',
  ctx: SigningContext,
): Promise<CheckResult<WalletMeta>> {
  const stored = await seedRecordFor(walletId)
  if (stored.signing || stored.sealedSeed) throw new Error('This wallet already has a signing check.')
  if (!stored.encryptedSeed) throw new Error('Wallet not found in local vault.')
  if (!ctx.openKey) throw new Error('Wallet is locked.')
  const before = stored.encryptedSeed

  const hkdfInfo = `${SIGN_HKDF_PREFIX}${stored.id}:v1`
  let credentialKey: CryptoKey
  let credentialId: string | undefined
  let prfSaltB64: string | undefined

  if (kind === 'pin') {
    const lockout = await getLockoutState()
    if (lockout.hardLocked || lockout.locked) {
      return { status: 'locked-out', hard: lockout.hardLocked, lockedUntil: lockout.lockedUntil }
    }
    const pin = await ctx.prompts.pin({ triesRemaining: await triesRemaining() })
    if (pin === null) return { status: 'cancelled' }
    const meta = await getVaultMeta()
    const appWrapper = meta.wrappedMasterKeyForPin
    if (!appWrapper) throw new Error('No PIN has been set up for this device.')
    const attempt = await attemptPin(pin, async (bits) => {
      // Proof the PIN is the App PIN: its wrapper decrypts under it.
      await aesDecrypt(await deriveAesKeyFromBits(bits, HKDF_INFO), appWrapper.ivB64, appWrapper.ciphertextB64)
      return deriveAesKeyFromBits(bits, hkdfInfo)
    })
    if (attempt.status === 'locked-out') return attempt
    if (attempt.status === 'wrong-credential') return { status: 'wrong-credential', kind: 'pin', triesRemaining: attempt.triesRemaining }
    credentialKey = attempt.value
  } else {
    const meta = await getVaultMeta()
    if (!isWebAuthnSupported() || !meta.passkeyCredentialIdB64) return { status: 'unsupported' }
    credentialId = meta.passkeyCredentialIdB64
    const salt = crypto.getRandomValues(new Uint8Array(32))
    prfSaltB64 = bufToB64(salt.buffer)
    try {
      credentialKey = await deriveAesKeyFromBits(await assertPasskeyAndDeriveBits(credentialId, salt), hkdfInfo)
    } catch (err) {
      if (isCancelled(err)) return { status: 'cancelled' }
      if (isPrfUnsupported(err)) return { status: 'unsupported' }
      throw err
    }
  }

  const seed = await aesDecrypt(ctx.openKey, before.ivB64, before.ciphertextB64)
  const wallet = await walletFromSeed(stored, seed)
  const algorithm = algorithmOfSeed(seed)
  const { sealedSeed, signing } = await buildSeal(seed, credentialKey, {
    kind,
    hkdfInfo,
    ...(credentialId ? { credentialIdB64: credentialId } : {}),
    ...(prfSaltB64 ? { prfSaltB64 } : {}),
  })
  await mutateStoredWallet(stored.id, (current) => {
    // Another tab or flow changed the ciphertext since it was read: abort,
    // leaving the record exactly as it is.
    if (current.signing || current.encryptedSeed?.ciphertextB64 !== before.ciphertextB64) {
      throw new Error('This wallet changed while its signing check was being set. Nothing was changed.')
    }
    const { encryptedSeed: _old, ...rest } = current
    return {
      ...rest,
      algorithm: current.algorithm && current.algorithm !== 'unresolved' ? current.algorithm : algorithm,
      sealedSeed,
      signing,
      signingCheck: kind,
    }
  })
  void wallet
  const meta = (await listWallets()).find((w) => w.id === walletId)
  if (!meta) throw new Error('Wallet not found in local vault.')
  return { status: 'ok', value: meta }
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
  // A lock made for Wallets that are all gone goes with the last of them. The
  // legacy lock never does: its wrappers are the vault's own.
  const lockId = record.lockId ?? LEGACY_LOCK_ID
  if (lockId !== LEGACY_LOCK_ID && !(await listStoredWallets()).some((w) => (w.lockId ?? LEGACY_LOCK_ID) === lockId)) {
    await deleteLock(lockId)
  }
}

// ---------------------------------------------------------------------------
// Creation (AD-22, AD-28): a new Stored Seed Wallet on its own lock
// ---------------------------------------------------------------------------

export interface CreateStoredWalletInput {
  label: string
  network: NetworkId
  /** A custom Node the caller already proved for `network` (`verifyNode`). */
  node?: string
  algorithm: 'ed25519' | 'secp256k1'
  openCheck: NewOpenCheck
  autoLockMinutes: number
  signing: SigningKind
  /** What the device said about PRF. `unknown` is allowed: creation then fails
   * closed if the passkey gives no PRF output. */
  passkey?: PasskeyCapability
}

export type CreateStoredWalletResult =
  | CheckResult<{
      meta: WalletMeta
      /** The new lock's Open Key (non-extractable), for the caller to open the lock with. */
      openKey: CryptoKey
      /** The generated Seed, for the backup screen only. The caller holds it in a
       * ref and clears it. */
      seed: string
    }>
  | { status: 'refused'; reason: string }

/**
 * Creates a Stored Seed Wallet on a NEW lock of its own, whatever its Open Check
 * (so a later edit or auto-lock touches only it). The policy decides first and a
 * refusal writes nothing. The Seed is generated here, never leaves except in the
 * result for the backup screen, and exists in exactly one form: under the lock's
 * Open Key (Standard), or under a Signing Key that only the PIN or a passkey can
 * unwrap (`sealedSeed` + `signing`, no `encryptedSeed`) — AD-23.
 *
 * Order, so a failure leaves the vault as it was: the Signing Check's credential
 * first (it needs only the Seed), then the lock, then one write of the Wallet. A
 * failure after the lock is written removes that lock and writes no Wallet. A
 * typed PIN is `ctx.pin`; it is used and not kept.
 */
export async function createStoredWallet(input: CreateStoredWalletInput, ctx: { pin?: string } = {}): Promise<CreateStoredWalletResult> {
  const verdict = checkWalletRequest({
    network: input.network,
    seedMethod: 'stored',
    openCheck: input.openCheck,
    autoLockMinutes: input.autoLockMinutes,
    signing: input.signing,
    passkey: input.passkey ?? 'unknown',
  })
  if (!verdict.ok) return { status: 'refused', reason: verdict.reason }
  const node = input.node === undefined ? undefined : (canonicalNodeUrl(input.node) ?? undefined)
  if (input.node !== undefined && !node) {
    return { status: 'refused', reason: 'A custom Node must be a wss:// address with no username, password, query or fragment.' }
  }
  if ((input.openCheck === 'pin' || input.signing === 'pin') && !ctx.pin) return { status: 'cancelled' }

  const hadAppPin = await hasAppPin()
  const wallet = Wallet.generate(input.algorithm === 'ed25519' ? ECDSA.ed25519 : ECDSA.secp256k1)
  const seed = wallet.seed!
  const walletId = crypto.randomUUID()
  let lockId: string | null = null
  try {
    let sealed: { sealedSeed: { ivB64: string; ciphertextB64: string }; signing: SigningSeal } | null = null
    if (input.signing !== 'standard') {
      const hkdfInfo = `${SIGN_HKDF_PREFIX}${walletId}:v1`
      if (input.signing === 'pin') {
        const proved = await withAppPin(ctx.pin!, hkdfInfo, async (credentialKey) =>
          buildSeal(seed, credentialKey, { kind: 'pin', hkdfInfo }),
        )
        if (proved.status !== 'ok') return await abandon(hadAppPin, proved)
        sealed = proved.value
      } else {
        // Its own passkey, named after the Wallet, and its own PRF salt and
        // info: no two purposes share derived key material (AD-21).
        if (!isWebAuthnSupported()) return await abandon(hadAppPin, { status: 'unsupported' })
        const prfSalt = crypto.getRandomValues(new Uint8Array(32))
        let credentialIdB64: string
        let bits: ArrayBuffer
        try {
          credentialIdB64 = (await registerPasskey(`${input.label || 'Wallet'} – signing`)).credentialIdB64
          bits = await assertPasskeyAndDeriveBits(credentialIdB64, prfSalt)
        } catch (err) {
          if (isCancelled(err)) return await abandon(hadAppPin, { status: 'cancelled' })
          if (isPrfUnsupported(err)) return await abandon(hadAppPin, { status: 'unsupported' })
          throw err
        }
        sealed = await buildSeal(seed, await deriveAesKeyFromBits(bits, hkdfInfo), {
          kind: 'passkey',
          hkdfInfo,
          credentialIdB64,
          prfSaltB64: bufToB64(prfSalt.buffer),
        })
      }
    }

    const lock = await createLock(
      { network: input.network, openCheck: input.openCheck, autoLockMinutes: input.autoLockMinutes, label: `${input.label || 'Wallet'} – open` },
      { pin: ctx.pin },
    )
    if (lock.status !== 'ok') return await abandon(hadAppPin, lock)
    lockId = lock.value.id

    const stored: StoredWallet = {
      id: walletId,
      label: input.label || 'Wallet',
      address: wallet.address,
      createdAt: Date.now(),
      seedMethod: 'stored',
      algorithm: input.algorithm,
      lockId,
      openCheck: input.openCheck,
      signingCheck: input.signing,
      views: [{ walletId, network: input.network, ...(node ? { node } : {}) }],
      ...(sealed
        ? { sealedSeed: sealed.sealedSeed, signing: sealed.signing }
        : { encryptedSeed: await aesEncrypt(lock.value.key, seed) }),
    }
    await putStoredWallet(stored)
    return { status: 'ok', value: { meta: toMetas(stored)[0], openKey: lock.value.key, seed } }
  } catch (err) {
    // Atomic: whatever failed after the lock was written takes the lock with it.
    if (lockId) await deleteLock(lockId).catch(() => {})
    if (!hadAppPin) await discardUnusedAppPin().catch(() => {})
    throw err
  }
}

/** A creation that stops early: the App PIN it may have just made goes too. */
async function abandon<R>(hadAppPin: boolean, result: R): Promise<R> {
  if (!hadAppPin) await discardUnusedAppPin().catch(() => {})
  return result
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
  await assertLockAllowsNetwork(record.lockId ?? LEGACY_LOCK_ID, network)
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

/** Sets one lock's auto-lock minutes. The policy decides against the networks of
 * the Wallets on that lock — a Mainnet Wallet's lock may not go under one
 * minute (FR-65). A refusal carries its plain reason and writes nothing. */
export async function setLockAutoLock(lockId: string, minutes: number): Promise<PolicyVerdict> {
  const networks = (await listStoredWallets())
    .filter((w) => (w.lockId ?? LEGACY_LOCK_ID) === lockId)
    .flatMap((w) => viewsOf(w).map((v) => v.network))
  return setAutoLockMinutes(lockId, minutes, networks)
}
