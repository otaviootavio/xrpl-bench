import { decodeSeed, ECDSA, Wallet } from 'xrpl'
import { canonicalNodeUrl, type NetworkId } from '@/lib/xrpl/networks'
import type { Signer, SigningHandle } from '@/lib/xrpl/writes'
import { aesDecrypt, aesEncrypt } from './aes'
import { deriveAesKeyFromBits, generateOrdinal, HKDF_INFO, isOrdinal, seedSalt, walletFromSeedPrf } from './derive'
import { buildLock, createLock, deleteLock, discardAllLocks, discardAppPin, discardUnusedAppPin, getLockInfo, hasAppPin, legacyLockRecord, openLock, provesAppPin, setAutoLockMinutes, withAppPin, type CheckResult } from './lock'
import { checkAutoLock, checkEditAllowed, checkLockRequest, checkWalletRequest, requiresWrittenSeed, resolveEdit, type CheckEditRequest, type NewOpenCheck, type PasskeyCapability, type PasskeyChoice, type PolicyVerdict, type SigningKind } from './policy'
import { b64ToBuf, bufToB64 } from './encoding'
import { validateWalletName, type WalletNameReason } from '@/lib/wallet-name'
import { attemptPin, getLockoutState, PBKDF2_ITERATIONS, recordFailure, triesRemaining } from './pin'
import {
  assertAnyPasskeyAndDeriveBits,
  assertPasskeyAndDeriveBits,
  getRpId,
  isCancelled,
  isPrfUnsupported,
  isWebAuthnSupported,
  PRF_SALT,
  registerPasskey,
} from './webauthn'
import {
  commitWalletEdit,
  EditConflictError,
  exclusiveVaultWrite,
  getLockRecord,
  getVaultMeta,
  LEGACY_LOCK_ID,
  lockStamp,
  seedStamp,
  type LockRecord,
  listStoredWallets,
  migrateLegacyVault as migrateLegacyVaultRecords,
  mutateStoredWallet,
  putStoredWallet,
  type OpenCheck,
  type SeedAlgorithm,
  type SeedMethod,
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
  /** The Account this Wallet reads and signs for: the ONLY ledger identity every
   * read, query key, send, receive and teardown uses (AD-18). It is `keyAddress`
   * unless the Wallet operates another Account as its Regular Key. */
  address: string
  /** The address the Seed itself derives: used only to detect a wrong credential
   * and to choose how to sign (AD-18). */
  keyAddress: string
  createdAt: number
  network: NetworkId
  /** A custom Node's `wss://` URL, proven for `network` when it was saved.
   * Absent: the network's built-in Nodes. */
  node?: string
  algorithm: SeedAlgorithm
  /** How the Seed exists: stored under a key, or computed from a passkey (FR-62). */
  seedMethod: SeedMethod
  openCheck: OpenCheck
  signingCheck: SigningCheck
  /** When the Seed was written down and confirmed (FR-72). Absent: never. */
  writtenSeedConfirmedAt?: number
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
    address: v.accountAddress ?? w.address,
    keyAddress: w.address,
    createdAt: w.createdAt,
    network: v.network,
    ...(v.node ? { node: v.node } : {}),
    algorithm: w.algorithm ?? 'unresolved',
    seedMethod: w.seedMethod ?? 'stored',
    openCheck: w.openCheck ?? 'pin',
    signingCheck: w.signingCheck ?? 'standard',
    ...(w.writtenSeedConfirmedAt !== undefined ? { writtenSeedConfirmedAt: w.writtenSeedConfirmedAt } : {}),
  }))
}

function findSeedRecord(all: StoredWallet[], walletId: string): StoredWallet | undefined {
  return all.find((w) => viewsOf(w).some((v) => v.walletId === walletId))
}

/** One Wallet is identified by `(network, Account, key)`; a second view with the
 * same triple, on any Seed record, is refused (AD-18). */
function hasView(all: StoredWallet[], network: NetworkId, account: string, keyAddress: string): boolean {
  return all.some((w) => w.address === keyAddress && viewsOf(w).some((v) => v.network === network && (v.accountAddress ?? w.address) === account))
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
export function generateAndStoreWallet(
  label: string,
  vaultKey: CryptoKey,
  network: NetworkId,
  lockId: string = LEGACY_LOCK_ID,
): Promise<{ meta: WalletMeta; seed: string }> {
  return exclusiveVaultWrite(() => generateAndStoreWalletUnguarded(label, vaultKey, network, lockId))
}

async function generateAndStoreWalletUnguarded(
  label: string,
  vaultKey: CryptoKey,
  network: NetworkId,
  lockId: string,
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

/** Imports an existing wallet from a seed — account-onboarding.md US-2.
 * Runs under `exclusiveVaultWrite` (AD-46): a last-Wallet removal waits for it.
 * Story 12 replaces this function and MUST wrap its replacement in the same guard. */
export function importAndStoreWallet(
  label: string,
  seed: string,
  vaultKey: CryptoKey,
  network: NetworkId,
  lockId: string = LEGACY_LOCK_ID,
): Promise<WalletMeta> {
  return exclusiveVaultWrite(() => importAndStoreWalletUnguarded(label, seed, vaultKey, network, lockId))
}

async function importAndStoreWalletUnguarded(
  label: string,
  seed: string,
  vaultKey: CryptoKey,
  network: NetworkId,
  lockId: string,
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
  if (hasView(await listStoredWallets(), network, wallet.address, wallet.address)) {
    throw new Error('This wallet is already on this device for that network.')
  }
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
    bits = await assertPasskeyAndDeriveBits(seal.credentialIdB64, new Uint8Array(b64ToBuf(seal.prfSaltB64)), seal.rpId)
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

/** Computes a Passkey-Derived Wallet's Seed from one passkey assertion (AD-24).
 * There is no ciphertext: the unlock proof is the address. One assertion yields
 * the Seed AND is the Signing Check; an address that is not the record's is a
 * wrong credential and counts like a failed check, a cancelled prompt never
 * does. The PRF output and the derived Wallet are locals, dropped on return. */
async function openDerivedSeed(stored: StoredWallet): Promise<CheckResult<string>> {
  const info = stored.derived
  if (!info || stored.encryptedSeed || stored.sealedSeed || stored.signing) {
    throw new Error('This wallet record is incomplete. Nothing was signed.')
  }
  if (stored.algorithm !== 'ed25519' && stored.algorithm !== 'secp256k1') {
    throw new Error('This wallet record is incomplete. Nothing was signed.')
  }
  if (!isWebAuthnSupported()) return { status: 'unsupported' }
  let bits: ArrayBuffer
  try {
    bits = await assertPasskeyAndDeriveBits(info.credentialIdB64, await seedSalt(info.ordinal), info.rpId)
  } catch (err) {
    if (isCancelled(err)) return { status: 'cancelled' }
    if (isPrfUnsupported(err)) return { status: 'unsupported' }
    throw err
  }
  const wallet = await walletFromSeedPrf(bits, stored.algorithm)
  if (wallet.address !== stored.address) {
    await recordFailure()
    return { status: 'wrong-credential', kind: 'passkey', triesRemaining: await triesRemaining() }
  }
  return { status: 'ok', value: wallet.seed! }
}

/** Decrypts one Seed record's Seed: under the Signing Key if it carries a
 * Signing Check, else under the session's Open key. There is no path that
 * decrypts a sealed record with `openKey` — it has no `encryptedSeed` to
 * decrypt, and the Signing Key is wrapped only by the credential (AD-23). */
async function openSeed(stored: StoredWallet, ctx: SigningContext): Promise<CheckResult<string>> {
  if (stored.seedMethod === 'passkey-derived') return openDerivedSeed(stored)
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
async function walletFromSeed(stored: StoredWallet, seed: string, account?: string): Promise<Wallet> {
  let algorithm: SeedAlgorithm
  if (stored.algorithm && stored.algorithm !== 'unresolved') {
    algorithm = stored.algorithm
  } else {
    algorithm = algorithmOfSeed(seed)
    const probe = Wallet.fromSeed(seed, { algorithm: algorithm === 'ed25519' ? ECDSA.ed25519 : ECDSA.secp256k1 })
    if (probe.address !== stored.address) {
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
  }
  // A view that operates another Account signs as that Account's Regular Key:
  // the Signer carries `masterAddress`, the key address stays the credential
  // check (AD-18).
  if (account && account !== stored.address) {
    return Wallet.fromSeed(seed, { algorithm: algorithm === 'ed25519' ? ECDSA.ed25519 : ECDSA.secp256k1, masterAddress: account })
  }
  return Wallet.fromSeed(seed)
}

async function seedRecordFor(walletId: string): Promise<StoredWallet> {
  const stored = findSeedRecord(await listStoredWallets(), walletId)
  if (!stored) throw new Error('Wallet not found in local vault.')
  return stored
}

/** The Account a Wallet's view operates: the view's `accountAddress`, else the
 * Seed record's own address (AD-18). */
function accountOf(stored: StoredWallet, walletId: string): string {
  return viewsOf(stored).find((v) => v.walletId === walletId)?.accountAddress ?? stored.address
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
    wallet = await walletFromSeed(stored, seed, accountOf(stored, walletId))
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
  const address = accountOf(stored, walletId)
  return {
    address,
    // The key is the Account's own (master) key unless this is a controlled view.
    signsAsMaster: address === stored.address,
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
  let signingCtx = ctx
  // A Standard Wallet's Seed is under its lock's Open Key, so the session alone
  // would reveal it. Re-pass the lock's own Open Check first (FR-69), proving it
  // without writing a session: the reveal never extends or replaces one. A sealed
  // Wallet has its Signing Check and a Passkey-Derived one its passkey instead.
  // A record that claims a Signing Check without its seal is not Standard: it fails closed in `openSeed`.
  const standard =
    stored.seedMethod !== 'passkey-derived' && (!stored.signingCheck || stored.signingCheck === 'standard') && !stored.signing && !stored.sealedSeed
  if (standard) {
    const passed = await repassOpenCheck(stored.lockId ?? LEGACY_LOCK_ID, ctx.prompts)
    if (passed.status !== 'ok') return passed
    if (passed.value) signingCtx = { ...ctx, openKey: passed.value }
  }
  const opened = await openSeed(stored, signingCtx)
  if (opened.status !== 'ok') return opened
  await walletFromSeed(stored, opened.value)
  return opened
}

/** Passes a lock's Open Check again, for a reveal, and returns its Open Key
 * (`null` for Open Check `none`, which needs nothing). PIN lock: the PIN; passkey
 * lock: the passkey; the legacy `either` lock: the passkey when this device can
 * use one, else the PIN (also when the passkey turns out unusable here). A wrong PIN counts and a cancelled prompt never does
 * (AD-25). Nothing is persisted. */
async function repassOpenCheck(lockId: string, prompts: Prompts): Promise<CheckResult<CryptoKey | null>> {
  const info = await getLockInfo(lockId)
  if (info.openCheck === 'none') return { status: 'ok', value: null }
  const usePasskey = info.openCheck === 'passkey' || (info.openCheck === 'either' && info.passkey && isWebAuthnSupported())
  if (usePasskey) {
    const opened = await openLock(lockId, 'passkey', { persist: false })
    if (opened.status === 'ok') return { status: 'ok', value: opened.value.key }
    // The `either` lock has a PIN too: a passkey this device cannot use must not
    // block a reveal (and so a backup). A cancelled prompt is not that: it stops here.
    if (!(info.openCheck === 'either' && opened.status === 'unsupported')) return opened
  }
  const lockout = await getLockoutState()
  if (lockout.hardLocked || lockout.locked) {
    return { status: 'locked-out', hard: lockout.hardLocked, lockedUntil: lockout.lockedUntil }
  }
  const pin = await prompts.pin({ triesRemaining: await triesRemaining() })
  if (pin === null) return { status: 'cancelled' }
  const opened = await openLock(lockId, 'pin', { pin, persist: false })
  return opened.status === 'ok' ? { status: 'ok', value: opened.value.key } : opened
}

/** The one place a Seed is sealed under a Signing Check (AD-23): a random
 * Signing Key encrypts the Seed, and only the credential's key wraps the
 * Signing Key. The Signing Key is never persisted or returned. */
async function buildSeal(
  seed: string,
  credentialKey: CryptoKey,
  seal: Pick<SigningSeal, 'kind' | 'hkdfInfo' | 'credentialIdB64' | 'prfSaltB64' | 'rpId'>,
): Promise<{ sealedSeed: { ivB64: string; ciphertextB64: string }; signing: SigningSeal }> {
  const signingKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const wrappedSigningKey = await aesEncrypt(credentialKey, bufToB64(await crypto.subtle.exportKey('raw', signingKey)))
  const sealedSeed = await aesEncrypt(signingKey, seed)
  return { sealedSeed, signing: { ...seal, wrappedSigningKey } }
}

/** A Signing Check's credential built for a Seed that is about to be sealed (AD-23,
 * AD-21): the App PIN proved, or a passkey of its own — named after the Wallet,
 * or one the person picks from this device's (FR-70) — with its own random PRF
 * salt and `hkdfInfo`, so no two purposes share derived key material. Shared by
 * creation and by `editChecks`. Writes nothing but an App PIN that did not yet
 * exist (the caller discards it on failure). */
async function sealUnderNewCredential(
  seed: string,
  req: { kind: 'pin' | 'passkey'; hkdfInfo: string; label: string; pin?: string; choice?: PasskeyChoice },
): Promise<CheckResult<{ sealedSeed: { ivB64: string; ciphertextB64: string }; signing: SigningSeal }>> {
  if (req.kind === 'pin') {
    if (!req.pin) return { status: 'cancelled' }
    return withAppPin(req.pin, req.hkdfInfo, async (credentialKey) => buildSeal(seed, credentialKey, { kind: 'pin', hkdfInfo: req.hkdfInfo }))
  }
  if (!isWebAuthnSupported()) return { status: 'unsupported' }
  const prfSalt = crypto.getRandomValues(new Uint8Array(32))
  let credentialIdB64: string
  let rpId: string | undefined
  let bits: ArrayBuffer
  try {
    if (req.choice === 'existing') {
      rpId = getRpId()
      const found = await assertAnyPasskeyAndDeriveBits(prfSalt, rpId)
      credentialIdB64 = found.credentialIdB64
      bits = found.bits
    } else {
      const registered = await registerPasskey(`${req.label} – signing`)
      credentialIdB64 = registered.credentialIdB64
      rpId = registered.rpId
      bits = await assertPasskeyAndDeriveBits(credentialIdB64, prfSalt, rpId)
    }
  } catch (err) {
    if (isCancelled(err)) return { status: 'cancelled' }
    if (isPrfUnsupported(err)) return { status: 'unsupported' }
    throw err
  }
  return {
    status: 'ok',
    value: await buildSeal(seed, await deriveAesKeyFromBits(bits, req.hkdfInfo), {
      kind: 'passkey',
      hkdfInfo: req.hkdfInfo,
      credentialIdB64,
      prfSaltB64: bufToB64(prfSalt.buffer),
      ...(rpId ? { rpId } : {}),
    }),
  }
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
  if (stored.seedMethod === 'passkey-derived') throw new Error('A Passkey-Derived Seed has no stored Seed to seal.')
  if (stored.signing || stored.sealedSeed) throw new Error('This wallet already has a signing check.')
  if (!stored.encryptedSeed) throw new Error('Wallet not found in local vault.')
  if (!ctx.openKey) throw new Error('Wallet is locked.')
  const before = stored.encryptedSeed
  const revRead = stored.rev ?? 0

  const hkdfInfo = `${SIGN_HKDF_PREFIX}${stored.id}:v1`
  let credentialKey: CryptoKey
  let credentialId: string | undefined
  let prfSaltB64: string | undefined
  let legacyRpId: string | undefined

  if (kind === 'pin') {
    const lockout = await getLockoutState()
    if (lockout.hardLocked || lockout.locked) {
      return { status: 'locked-out', hard: lockout.hardLocked, lockedUntil: lockout.lockedUntil }
    }
    const pin = await ctx.prompts.pin({ triesRemaining: await triesRemaining() })
    if (pin === null) return { status: 'cancelled' }
    const meta = await getVaultMeta()
    if (!meta.wrappedMasterKeyForPin && !meta.pinVerifier) throw new Error('No PIN has been set up for this device.')
    const attempt = await attemptPin(pin, async (bits) => {
      // Proof the PIN is the App PIN, by the one rule every PIN use shares: its
      // legacy wrapper or its verifier decrypts under it.
      await provesAppPin(bits, meta)
      return deriveAesKeyFromBits(bits, hkdfInfo)
    })
    if (attempt.status === 'locked-out') return attempt
    if (attempt.status === 'wrong-credential') return { status: 'wrong-credential', kind: 'pin', triesRemaining: attempt.triesRemaining }
    credentialKey = attempt.value
  } else {
    const meta = await getVaultMeta()
    if (!isWebAuthnSupported() || !meta.passkeyCredentialIdB64) return { status: 'unsupported' }
    credentialId = meta.passkeyCredentialIdB64
    legacyRpId = meta.rpId
    const salt = crypto.getRandomValues(new Uint8Array(32))
    prfSaltB64 = bufToB64(salt.buffer)
    try {
      credentialKey = await deriveAesKeyFromBits(await assertPasskeyAndDeriveBits(credentialId, salt, meta.rpId), hkdfInfo)
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
    ...(credentialId && legacyRpId ? { rpId: legacyRpId } : {}),
  })
  await mutateStoredWallet(stored.id, (current) => {
    // Another tab or flow changed the ciphertext since it was read: abort,
    // leaving the record exactly as it is.
    if (current.signing || (current.rev ?? 0) !== revRead || current.encryptedSeed?.ciphertextB64 !== before.ciphertextB64) {
      throw new Error('This wallet changed while its signing check was being set. Nothing was changed.')
    }
    const { encryptedSeed: _old, ...rest } = current
    return {
      ...rest,
      algorithm: current.algorithm && current.algorithm !== 'unresolved' ? current.algorithm : algorithm,
      sealedSeed,
      signing,
      signingCheck: kind,
      rev: revRead + 1,
    }
  })
  void wallet
  const meta = (await listWallets()).find((w) => w.id === walletId)
  if (!meta) throw new Error('Wallet not found in local vault.')
  return { status: 'ok', value: meta }
}

export type RenameWalletResult =
  | { ok: true; metas: WalletMeta[] }
  | { ok: false; reason: WalletNameReason | 'write-failed' }

/**
 * Renames a Seed (AD-41): changes only the record's `label`, in one transaction.
 * No `rev` bump (a rename is not an edit of what the Seed is sealed under, so an
 * in-flight `commitWalletEdit` neither aborts nor loses the name), no lock, no
 * ledger call. The rule is re-run here against the stored records, so a duplicate
 * that appeared in another tab is refused. A failed write changes nothing.
 */
export async function renameWallet(seedId: string, rawName: string): Promise<RenameWalletResult> {
  try {
    const all = await listStoredWallets()
    if (!all.some((w) => w.id === seedId)) return { ok: false, reason: 'write-failed' }
    const verdict = validateWalletName(
      rawName,
      all.filter((w) => w.id !== seedId).map((w) => w.label),
    )
    if (!verdict.ok) return verdict
    let written: StoredWallet | undefined
    await mutateStoredWallet(seedId, (current) => {
      written = { ...current, label: verdict.name }
      return written
    })
    if (!written) return { ok: false, reason: 'write-failed' }
    return { ok: true, metas: toMetas(written) }
  } catch {
    return { ok: false, reason: 'write-failed' }
  }
}

/** Does this device still hold an App PIN or a non-zero PIN failure count? On a
 * device with no Wallet that is residue of a removal whose `discardAppPin` failed
 * (AD-46), and first-run Onboarding then offers Remove all. Read here so a screen
 * never reads vault meta itself. */
export async function appPinResidue(): Promise<boolean> {
  if (await hasAppPin()) return true
  return (await getVaultMeta()).failedAttempts > 0
}

export interface RemoveWalletResult {
  /** No stored Wallet remains on the device. */
  emptied: boolean
  /** `failed`: the Wallet is gone but the App PIN (or a lock record) could not be
   * removed. `kept`: Wallets remain, so the PIN stays. */
  appPin: 'kept' | 'discarded' | 'failed'
}

/** Removes one Wallet. Its Seed record goes with its last view and not before:
 * another network's view of the same Seed keeps working. The whole removal runs
 * under `exclusiveVaultWrite`, so a create or import in flight finishes first and
 * the emptiness check below sees what it wrote (AD-46).
 *
 * When the removal leaves no Wallet on the device, every lock record (the legacy
 * one and any orphan from a failed creation) goes and `discardAppPin` removes the
 * App PIN with its failure count (FR-86). That step reports its failure in the
 * result rather than throwing: the Wallet is already gone. */
export function removeWallet(walletId: string): Promise<RemoveWalletResult> {
  return exclusiveVaultWrite(() => removeWalletUnguarded(walletId))
}

async function removeWalletUnguarded(walletId: string): Promise<RemoveWalletResult> {
  const record = findSeedRecord(await listStoredWallets(), walletId)
  if (record) {
    await mutateStoredWallet(record.id, (current) => {
      const remaining = viewsOf(current).filter((v) => v.walletId !== walletId)
      return remaining.length === 0 ? null : { ...current, views: remaining }
    })
    // A lock made for Wallets that are all gone goes with the last of them. The
    // legacy lock never does here: its wrappers are the vault's own.
    const lockId = record.lockId ?? LEGACY_LOCK_ID
    if (lockId !== LEGACY_LOCK_ID && !(await listStoredWallets()).some((w) => (w.lockId ?? LEGACY_LOCK_ID) === lockId)) {
      await deleteLock(lockId)
    }
  }
  if ((await listStoredWallets()).length > 0) return { emptied: false, appPin: 'kept' }
  // Nothing is stored: every lock record left is the legacy one or an orphan.
  // The PIN discard never depends on the lock-record cleanup: a failed cleanup there leaves only
  // lock records no wallet points at, while a skipped discard would leave a PIN on an empty device.
  try {
    await discardAllLocks()
  } catch {
    // orphan lock records are harmless without wallets; the PIN is still discarded below
  }
  try {
    await discardAppPin()
    return { emptied: true, appPin: 'discarded' }
  } catch {
    return { emptied: true, appPin: 'failed' }
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
export function createStoredWallet(input: CreateStoredWalletInput, ctx: CreateWalletContext = {}): Promise<CreateStoredWalletResult> {
  return exclusiveVaultWrite(() => createStoredWalletUnguarded(input, ctx))
}

/** What a creation needs beyond its input. `appPinExpected` is what the screen
 * believed when it asked for the PIN: `true` means it asked once, for an App PIN it
 * saw. Inside the guard that is checked again, so a last-Wallet removal elsewhere
 * cannot turn a typed single entry into a new App PIN (AD-46). */
export interface CreateWalletContext {
  pin?: string
  confirmWrittenSeed?: ConfirmWrittenSeed
  appPinExpected?: boolean
}

const APP_PIN_GONE = 'The App PIN was removed from this device while you were setting this up. Start again: you will be asked to set a new PIN.'

async function createStoredWalletUnguarded(input: CreateStoredWalletInput, ctx: CreateWalletContext): Promise<CreateStoredWalletResult> {
  const verdict = checkWalletRequest({
    canConfirmWrittenSeed: !!ctx.confirmWrittenSeed,
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
  if (ctx.appPinExpected && !hadAppPin && (input.openCheck === 'pin' || input.signing === 'pin')) return { status: 'refused', reason: APP_PIN_GONE }
  const wallet = Wallet.generate(input.algorithm === 'ed25519' ? ECDSA.ed25519 : ECDSA.secp256k1)
  const seed = wallet.seed!
  const walletId = crypto.randomUUID()
  let lockId: string | null = null
  try {
    // FR-72: the Seed is shown and confirmed before any credential, lock or
    // Wallet is written. A refusal here leaves the vault exactly as it was.
    const confirmedAt = await confirmedAtFor(input.network, input.openCheck, input.signing, ctx.confirmWrittenSeed, seed)
    if (confirmedAt === 'cancelled') return await abandon(hadAppPin, { status: 'cancelled' })
    let sealed: { sealedSeed: { ivB64: string; ciphertextB64: string }; signing: SigningSeal } | null = null
    if (input.signing !== 'standard') {
      const built = await sealUnderNewCredential(seed, {
        kind: input.signing,
        hkdfInfo: `${SIGN_HKDF_PREFIX}${walletId}:v1`,
        label: input.label || 'Wallet',
        pin: ctx.pin,
      })
      if (built.status !== 'ok') return await abandon(hadAppPin, built)
      sealed = built.value
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
      ...(confirmedAt ? { writtenSeedConfirmedAt: confirmedAt } : {}),
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

/** Shows the Seed to the person and asks them to confirm they wrote it down
 * (FR-72). Resolves `true` to proceed. */
export type ConfirmWrittenSeed = (seed: string) => Promise<boolean>

/** Runs the written-Seed confirmation when the combination needs one: the time it
 * was confirmed, `undefined` when none is needed, or `'cancelled'`. A rule that
 * needs it with no callback was already refused by the policy. */
async function confirmedAtFor(
  network: NetworkId,
  openCheck: NewOpenCheck,
  signing: SigningKind,
  confirm: ConfirmWrittenSeed | undefined,
  seed: string,
): Promise<number | undefined | 'cancelled'> {
  if (!requiresWrittenSeed(network, openCheck, signing)) return undefined
  if (!confirm || !(await confirm(seed))) return 'cancelled'
  return Date.now()
}

/** A creation that stops early: the App PIN it may have just made goes too. */
async function abandon<R>(hadAppPin: boolean, result: R): Promise<R> {
  if (!hadAppPin) await discardUnusedAppPin().catch(() => {})
  return result
}

// ---------------------------------------------------------------------------
// Creation (AD-24): a Passkey-Derived Seed Wallet. The Seed exists in no stored form.
// ---------------------------------------------------------------------------

export interface CreateDerivedWalletInput {
  label: string
  network: NetworkId
  /** A custom Node the caller already proved for `network` (`verifyNode`). */
  node?: string
  algorithm: 'ed25519' | 'secp256k1'
  openCheck: NewOpenCheck
  autoLockMinutes: number
  /** `new` registers a passkey named after the Wallet; `existing` asserts with no
   * `allowCredentials` and takes the credential id from the result (FR-70). */
  passkeyChoice: 'new' | 'existing'
  passkey?: PasskeyCapability
  /** Supplied only by a restore. A new Wallet gets a fresh one. */
  ordinal?: string
  /** A restore accepts the derived Wallet only if it is this address. */
  expectedAddress?: string
}

export type CreateDerivedWalletResult =
  | CheckResult<{
      meta: WalletMeta
      /** The new lock's Open Key (non-extractable), for the caller to open the lock with. */
      openKey: CryptoKey
      /** Public. Shown once so the person can write it down; rebuilds the Wallet on a new device. */
      ordinal: string
      /** The BE flag read at registration. `undefined`: not readable (an existing passkey, or an
       * authenticator that did not say) — the caller states both consequences. */
      backupEligible?: boolean
    }>
  | { status: 'refused'; reason: string }

/**
 * Creates a Passkey-Derived Seed Wallet on a NEW lock of its own. The record
 * holds no `encryptedSeed`, `sealedSeed` or `signing`: only the public inputs
 * that recompute the Seed from the passkey (credential id, rpId, ordinal, BE).
 * The PRF output and the derived Wallet are locals, dropped on return.
 *
 * Order, so a failure leaves the vault as it was: policy, then the passkey
 * (registered for a new one, then asserted for the `seed` salt — a second prompt
 * after registration is the normal path, AD-24), then the derived address is checked
 * (a restore's expected address) and the (credential, ordinal, algorithm) triple
 * is checked for a duplicate, then the lock, then one write of the Wallet. A
 * failure after the lock is written removes it.
 */
export function createDerivedWallet(input: CreateDerivedWalletInput, ctx: CreateWalletContext = {}): Promise<CreateDerivedWalletResult> {
  return exclusiveVaultWrite(() => createDerivedWalletUnguarded(input, ctx))
}

async function createDerivedWalletUnguarded(input: CreateDerivedWalletInput, ctx: CreateWalletContext): Promise<CreateDerivedWalletResult> {
  const rpId = getRpId()
  const verdict = checkWalletRequest({
    canConfirmWrittenSeed: !!ctx.confirmWrittenSeed,
    network: input.network,
    seedMethod: 'passkey-derived',
    openCheck: input.openCheck,
    autoLockMinutes: input.autoLockMinutes,
    signing: 'passkey',
    passkey: input.passkey ?? 'unknown',
    origin: rpId,
  })
  if (!verdict.ok) return { status: 'refused', reason: verdict.reason }
  const node = input.node === undefined ? undefined : (canonicalNodeUrl(input.node) ?? undefined)
  if (input.node !== undefined && !node) {
    return { status: 'refused', reason: 'A custom Node must be a wss:// address with no username, password, query or fragment.' }
  }
  if (input.ordinal !== undefined && !isOrdinal(input.ordinal)) {
    return { status: 'refused', reason: 'The ordinal is the 6-digit number shown when the wallet was created.' }
  }
  if (input.openCheck === 'pin' && !ctx.pin) return { status: 'cancelled' }
  if (!isWebAuthnSupported()) return { status: 'unsupported' }

  const hadAppPin = await hasAppPin()
  if (ctx.appPinExpected && !hadAppPin && input.openCheck === 'pin') return { status: 'refused', reason: APP_PIN_GONE }
  const ordinal = input.ordinal ?? generateOrdinal()
  const walletId = crypto.randomUUID()
  let lockId: string | null = null
  try {
    const salt = await seedSalt(ordinal)
    let credentialIdB64: string
    let backupEligible: boolean | undefined
    let bits: ArrayBuffer | null
    try {
      if (input.passkeyChoice === 'new') {
        const registered = await registerPasskey(`${input.label || 'Wallet'} – seed`)
        credentialIdB64 = registered.credentialIdB64
        backupEligible = registered.backupEligible
        // The authenticator may have skipped PRF at registration: this assertion
        // is what derives, and a device with no PRF fails here, writing nothing.
        bits = await assertPasskeyAndDeriveBits(credentialIdB64, salt, rpId)
      } else {
        const found = await assertAnyPasskeyAndDeriveBits(salt, rpId)
        credentialIdB64 = found.credentialIdB64
        bits = found.bits
      }
    } catch (err) {
      if (isCancelled(err)) return await abandon(hadAppPin, { status: 'cancelled' })
      if (isPrfUnsupported(err)) return await abandon(hadAppPin, { status: 'unsupported' })
      throw err
    }
    const wallet = await walletFromSeedPrf(bits, input.algorithm)
    bits = null
    const address = wallet.address
    if (input.expectedAddress !== undefined && address !== input.expectedAddress) {
      return await abandon(hadAppPin, { status: 'wrong-credential', kind: 'passkey', triesRemaining: await triesRemaining() })
    }
    const taken = (await listStoredWallets()).some(
      (w) =>
        w.derived?.credentialIdB64 === credentialIdB64 &&
        w.derived.ordinal === ordinal &&
        w.algorithm === input.algorithm,
    )
    if (taken) {
      return await abandon(hadAppPin, {
        status: 'refused' as const,
        reason: 'A wallet from this passkey with this ordinal and signature type already exists on this device.',
      })
    }

    // FR-72: the derived Seed is shown and confirmed now that its address is
    // known to be right, and before the lock or Wallet is written.
    const confirmedAt = await confirmedAtFor(input.network, input.openCheck, 'passkey', ctx.confirmWrittenSeed, wallet.seed!)
    if (confirmedAt === 'cancelled') return await abandon(hadAppPin, { status: 'cancelled' })

    // One passkey rule (FR-70): when the Open Check is this same passkey, the
    // lock reuses the credential — but with its own random PRF salt and info.
    const lock = await createLock(
      {
        network: input.network,
        openCheck: input.openCheck,
        autoLockMinutes: input.autoLockMinutes,
        label: `${input.label || 'Wallet'} – open`,
        reuseCredential: { credentialIdB64, rpId },
      },
      { pin: ctx.pin },
    )
    if (lock.status !== 'ok') return await abandon(hadAppPin, lock)
    lockId = lock.value.id

    const stored: StoredWallet = {
      id: walletId,
      label: input.label || 'Wallet',
      address,
      createdAt: Date.now(),
      seedMethod: 'passkey-derived',
      algorithm: input.algorithm,
      lockId,
      openCheck: input.openCheck,
      signingCheck: 'passkey',
      views: [{ walletId, network: input.network, ...(node ? { node } : {}) }],
      derived: { credentialIdB64, rpId, ordinal, ...(backupEligible === undefined ? {} : { backupEligible }) },
      ...(confirmedAt ? { writtenSeedConfirmedAt: confirmedAt } : {}),
    }
    await putStoredWallet(stored)
    return { status: 'ok', value: { meta: toMetas(stored)[0], openKey: lock.value.key, ordinal, ...(backupEligible === undefined ? {} : { backupEligible }) } }
  } catch (err) {
    if (lockId) await deleteLock(lockId).catch(() => {})
    if (!hadAppPin) await discardUnusedAppPin().catch(() => {})
    throw err
  }
}

export interface RestorePasskeyWalletOptions {
  /** The address the Wallet must derive to. A restore is accepted only on a match. */
  expectedAddress: string
  label?: string
  /** Defaults to a passkey Open Check on this passkey. */
  openCheck?: NewOpenCheck
  autoLockMinutes?: number
  passkey?: PasskeyCapability
  /** Without it, a Mainnet passkey-only restore stays refused: it has no screen. */
  confirmWrittenSeed?: ConfirmWrittenSeed
}

/**
 * Rebuilds a Passkey-Derived Wallet on a device with no local storage from the
 * same passkey (asserted with no `allowCredentials`), the ordinal the person
 * wrote down, and the signature type (AD-24). Accepted only if the derived
 * address is `expectedAddress`; a mismatch is a wrong credential and writes
 * nothing. A PIN Open Check asks for the App PIN through `prompts.pin`. A keystore
 * function only: its screen is a later story.
 */
export async function restorePasskeyWallet(
  ordinal: string,
  algorithm: 'ed25519' | 'secp256k1',
  network: NetworkId,
  node: string | undefined,
  prompts: Prompts,
  options: RestorePasskeyWalletOptions,
): Promise<CreateDerivedWalletResult> {
  const openCheck = options.openCheck ?? 'passkey'
  let pin: string | undefined
  if (openCheck === 'pin') {
    const typed = await prompts.pin({ triesRemaining: await triesRemaining() })
    if (typed === null) return { status: 'cancelled' }
    pin = typed
  }
  return createDerivedWallet(
    {
      label: options.label ?? 'Restored wallet',
      network,
      ...(node ? { node } : {}),
      algorithm,
      openCheck,
      autoLockMinutes: options.autoLockMinutes ?? 5,
      passkeyChoice: 'existing',
      passkey: options.passkey ?? 'unknown',
      ordinal,
      expectedAddress: options.expectedAddress,
    },
    { pin, ...(options.confirmWrittenSeed ? { confirmWrittenSeed: options.confirmWrittenSeed } : {}) },
  )
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
  if (record.seedMethod === 'passkey-derived') {
    // A derived Seed gets no view that creation policy would have refused (AD-28).
    const info = await getLockInfo(record.lockId ?? LEGACY_LOCK_ID)
    let origin: string | undefined
    try {
      origin = getRpId()
    } catch {
      origin = undefined
    }
    const verdict = checkWalletRequest({
      network,
      seedMethod: 'passkey-derived',
      openCheck: info.openCheck === 'none' ? 'none' : info.openCheck === 'passkey' ? 'passkey' : 'pin',
      autoLockMinutes: info.autoLockMinutes,
      signing: 'passkey',
      passkey: 'unknown',
      origin,
    })
    if (!verdict.ok) throw new Error(verdict.reason)
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

/** Records that a Seed's key operates `accountAddress` as that Account's Regular
 * Key: a second view over the SAME Seed record, with the Account on the view and
 * nothing else changed (AD-18). Call only after a validated `SetRegularKey` and a
 * fresh read that shows this key (AD-29). A view with the same
 * `(network, accountAddress, keyAddress)` is refused and nothing is written. */
export async function addControlledView(
  seedWalletId: string,
  view: { network: NetworkId; node?: string; accountAddress: string },
): Promise<WalletMeta> {
  const all = await listStoredWallets()
  const record = findSeedRecord(all, seedWalletId)
  if (!record) throw new Error('Wallet not found in local vault.')
  if (!record.views || record.views.length === 0) {
    throw new Error('This wallet is not migrated yet. Restart the app and try again.')
  }
  if (hasView(all, view.network, view.accountAddress, record.address)) {
    throw new Error('This wallet already operates that account.')
  }
  const node = view.node ? canonicalNodeUrl(view.node) : null
  const newWalletId = crypto.randomUUID()
  let added = false
  await mutateStoredWallet(record.id, (current) => {
    const views = viewsOf(current)
    if (views.some((v) => v.network === view.network && (v.accountAddress ?? current.address) === view.accountAddress)) return current
    added = true
    return {
      ...current,
      views: [...views, { walletId: newWalletId, network: view.network, ...(node ? { node } : {}), accountAddress: view.accountAddress }],
    }
  })
  if (!added) throw new Error('This wallet already operates that account.')
  const meta = (await listWallets(view.network)).find((w) => w.id === newWalletId)
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
  if (!record.views || record.views.length === 0) {
    throw new Error('This wallet is not migrated yet. Restart the app and try again.')
  }
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

// ---------------------------------------------------------------------------
// Editing a Wallet's checks (AD-28, FR-73)
// ---------------------------------------------------------------------------

export interface EditChecksContext {
  /** Asks for the CURRENT checks: the PIN of the lock or the Signing Check. */
  prompts: Prompts
  /** The App PIN typed for a NEW PIN check (an Open Check or a Signing Check). It
   * is used and not kept. */
  pin?: string
  /** Asks the person to write the Seed down and confirm it, when the result
   * needs that (FR-72). Without it such a result is refused. */
  confirmWrittenSeed?: ConfirmWrittenSeed
  /** What the device said about PRF. */
  passkey?: PasskeyCapability
}

export type EditChecksResult =
  | CheckResult<{
      meta: WalletMeta
      /** False: nothing changed, nothing was asked and nothing was written. */
      changed: boolean
      /** The lock the Wallet was on before. */
      previousLockId: string
      /** Set only when the Wallet moved to a new lock: that lock's non-extractable
       * Open Key. The caller closes the old lock, opens this one and starts its
       * session — nothing here touches a session. */
      openKey?: CryptoKey
      /** The window of the lock the Wallet is on now. */
      autoLockMinutes: number
      /** The previous lock was deleted, because no Seed record is left on it. */
      previousLockRemoved: boolean
    }>
  | { status: 'refused'; reason: string }

/** The lock's Open Key, proven again (a PIN, a passkey or nothing for `none`). */
async function reproveOpenKey(lockId: string, prompts: Prompts): Promise<CheckResult<CryptoKey>> {
  const passed = await repassOpenCheck(lockId, prompts)
  if (passed.status !== 'ok') return passed
  if (passed.value) return { status: 'ok', value: passed.value }
  const none = await openLock(lockId, 'none', { persist: false })
  return none.status === 'ok' ? { status: 'ok', value: none.value.key } : none
}

/**
 * Changes a Wallet's Open Check, auto-lock, Signing Check or passkeys in one
 * atomic step (AD-28). The address never changes. In this order, so a refusal, a
 * cancel or a failure leaves the Wallet opening and signing exactly as before:
 *
 *  1. The change is resolved and the RESULTING state goes through
 *     `checkWalletRequest` (Seed Method, Signing Check, floors against every
 *     network on the lock, PRF, FR-72). A refusal writes nothing.
 *  2. The current check the change affects is passed: the lock's Open Check for an
 *     Open Check or auto-lock edit, or a Standard Wallet's move to a Signing
 *     Check; the Signing Check for a sealed Wallet's Signing Check edit (the
 *     decrypt is the proof). A wrong PIN counts, a cancel never does.
 *  3. When the result needs a written Seed (FR-72) and none is confirmed, the
 *     person confirms it now, before any credential is made.
 *  4. The new credentials are built and the new lock record and ciphertext are
 *     made in memory (a new lock per Open Check edit; the old lock is not touched).
 *  5. One transaction writes the lock record and the Wallet record and removes the
 *     old lock when nothing is left on it, compare-and-swapping on `rev`, the
 *     ciphertext and the lock as read. A mismatch writes nothing.
 *
 * Seed and keys live in locals of this call. A passkey registered before a later
 * failure may stay on the authenticator.
 */
export function editChecks(walletId: string, request: CheckEditRequest, ctx: EditChecksContext): Promise<EditChecksResult> {
  return exclusiveVaultWrite(() => editChecksUnguarded(walletId, request, ctx))
}

async function editChecksUnguarded(walletId: string, request: CheckEditRequest, ctx: EditChecksContext): Promise<EditChecksResult> {
  const stored = await seedRecordFor(walletId)
  const fromLockId = stored.lockId ?? LEGACY_LOCK_ID
  const lockRecord = await getLockRecord(fromLockId)
  const info = await getLockInfo(fromLockId)
  const expectSeedStamp = seedStamp(stored)
  const expectLockStamp = lockStamp(lockRecord)
  const isDerived = stored.seedMethod === 'passkey-derived'
  const isSealed = !!(stored.signing || stored.sealedSeed)
  const standardRecord = !isDerived && !isSealed

  const current = {
    seedMethod: stored.seedMethod ?? 'stored',
    openCheck: info.openCheck,
    signing: (isDerived ? 'passkey' : (stored.signingCheck ?? 'standard')) as SigningKind,
    autoLockMinutes: info.autoLockMinutes,
  }
  const resolved = resolveEdit(current, request)
  const meta = (await listWallets()).find((m) => m.id === walletId)
  if (!meta) throw new Error('Wallet not found in local vault.')
  const previousLockId = fromLockId
  if (!resolved.changed) {
    return { status: 'ok', value: { meta, changed: false, previousLockId, autoLockMinutes: info.autoLockMinutes, previousLockRemoved: false } }
  }
  const allowed = checkEditAllowed(current, resolved)
  if (!allowed.ok) return { status: 'refused', reason: allowed.reason }

  // The resulting state, judged by the one policy. Mainnet if any view of the
  // Seed is Mainnet; the auto-lock floor reads every network on the lock the
  // Wallet will be on (a new lock serves only this Seed).
  const views = viewsOf(stored)
  const network: NetworkId = views.some((v) => v.network === 'mainnet') ? 'mainnet' : views[0].network
  const lockNetworks = resolved.openChange
    ? views.map((v) => v.network)
    : (await listStoredWallets()).filter((w) => (w.lockId ?? LEGACY_LOCK_ID) === fromLockId).flatMap((w) => viewsOf(w).map((v) => v.network))
  const confirmed = stored.writtenSeedConfirmedAt !== undefined
  let origin: string | undefined
  try {
    origin = getRpId()
  } catch {
    origin = undefined
  }
  const { openCheck: resultOpen, signing: resultSigning, autoLockMinutes: resultMinutes } = resolved.result
  const checksChange = resolved.openChange || resolved.signingChange
  // An auto-lock-only edit is judged on the floor alone (every network on the
  // lock): FR-72 and PRF capability are about the checks, which it does not touch.
  if (checksChange) {
    const verdict = checkWalletRequest({
      canConfirmWrittenSeed: !!ctx.confirmWrittenSeed,
      writtenSeedConfirmed: confirmed,
      network,
      seedMethod: current.seedMethod,
      openCheck: resultOpen,
      autoLockMinutes: resultMinutes,
      signing: resultSigning,
      passkey: ctx.passkey ?? 'unknown',
      origin,
    })
    if (!verdict.ok) return { status: 'refused', reason: verdict.reason }
  }
  if (resolved.autoLockChange || resolved.openChange) {
    const floors = checkAutoLock(lockNetworks, resultMinutes)
    if (!floors.ok) return { status: 'refused', reason: floors.reason }
  }
  const newPin = (resolved.openChange && resultOpen === 'pin') || (resolved.signingChange && resultSigning === 'pin')
  if (newPin && !ctx.pin) return { status: 'cancelled' }

  const needsConfirm = checksChange && requiresWrittenSeed(network, resultOpen, resultSigning) && !confirmed
  const needsSeed = resolved.signingChange || needsConfirm || (resolved.openChange && standardRecord)
  const hadAppPin = await hasAppPin()
  let seed: string | null = null
  let committed = false
  try {
    // 2. The current check the change affects.
    let lockKey: CryptoKey | null = null
    const needsOpenCheck = resolved.openChange || resolved.autoLockChange || standardRecord || (isSealed && resolved.signingChange && resultSigning === 'standard')
    if (needsOpenCheck) {
      const proved = await reproveOpenKey(fromLockId, ctx.prompts)
      if (proved.status !== 'ok') return await abandon(hadAppPin, proved)
      lockKey = proved.value
    }
    if (needsSeed) {
      if (standardRecord) {
        if (!stored.encryptedSeed || !lockKey) throw new Error('Wallet not found in local vault.')
        seed = await aesDecrypt(lockKey, stored.encryptedSeed.ivB64, stored.encryptedSeed.ciphertextB64)
      } else {
        const opened = await openSeed(stored, { openKey: null, prompts: ctx.prompts })
        if (opened.status !== 'ok') return await abandon(hadAppPin, opened)
        seed = opened.value
      }
      // The Seed must be this Wallet's: its address is the one stored.
      await walletFromSeed(stored, seed)
    }

    // 3. FR-72, before any credential, lock or record is made.
    let confirmedAt: number | undefined
    if (needsConfirm) {
      if (!seed || !ctx.confirmWrittenSeed || !(await ctx.confirmWrittenSeed(seed))) return await abandon(hadAppPin, { status: 'cancelled' as const })
      confirmedAt = Date.now()
    }

    // 4. New credentials and ciphertext, in memory.
    let newLock: { record: LockRecord; key: CryptoKey } | null = null
    if (resolved.openChange) {
      const kind = request.openCheck!
      const built = await buildLock(
        {
          network,
          openCheck: resultOpen,
          autoLockMinutes: resultMinutes,
          label: `${stored.label || 'Wallet'} – open`,
          ...(kind.kind === 'passkey' ? { passkeyChoice: kind.passkey ?? 'new' } : {}),
        },
        { pin: ctx.pin },
      )
      if (built.status !== 'ok') return await abandon(hadAppPin, built)
      newLock = built.value
    }
    let newSeal: { sealedSeed: { ivB64: string; ciphertextB64: string }; signing: SigningSeal } | null = null
    let newEncrypted: { ivB64: string; ciphertextB64: string } | null = null
    if (resolved.signingChange) {
      if (resultSigning === 'standard') {
        // Back under the lock's Open Key (the new one if the lock is new).
        const key = newLock?.key ?? lockKey
        if (!key || !seed) throw new Error('Wallet is locked.')
        newEncrypted = await aesEncrypt(key, seed)
      } else {
        const sealed = await sealUnderNewCredential(seed!, {
          kind: resultSigning,
          hkdfInfo: `${SIGN_HKDF_PREFIX}${stored.id}:${crypto.randomUUID()}:v1`,
          label: stored.label || 'Wallet',
          pin: ctx.pin,
          choice: request.signing?.passkey,
        })
        if (sealed.status !== 'ok') return await abandon(hadAppPin, sealed)
        newSeal = sealed.value
      }
    } else if (resolved.openChange && standardRecord) {
      // The Seed moves to the new lock's Open Key.
      if (!newLock || !seed) throw new Error('Wallet is locked.')
      newEncrypted = await aesEncrypt(newLock.key, seed)
    }

    // 5. One transaction.
    const algorithm = seed ? algorithmOfSeed(seed) : undefined
    const putLock = newLock
      ? newLock.record
      : resolved.autoLockChange
        ? { ...(lockRecord ?? legacyLockRecord(resultMinutes)), autoLockMinutes: resultMinutes }
        : undefined
    const { wallet: written, lockRemoved } = await commitWalletEdit({
      seedId: stored.id,
      expectSeedStamp,
      expectLockId: fromLockId,
      expectLockStamp,
      ...(putLock ? { putLock } : {}),
      ...(newLock ? { releaseLockId: fromLockId } : {}),
      next: (row) => {
        const { encryptedSeed, sealedSeed, signing, ...rest } = row
        const forms = newEncrypted
          ? { encryptedSeed: newEncrypted }
          : newSeal
            ? { sealedSeed: newSeal.sealedSeed, signing: newSeal.signing }
            : { ...(encryptedSeed ? { encryptedSeed } : {}), ...(sealedSeed ? { sealedSeed } : {}), ...(signing ? { signing } : {}) }
        return {
          ...rest,
          ...forms,
          ...(algorithm && (!row.algorithm || row.algorithm === 'unresolved') ? { algorithm } : {}),
          ...(newLock ? { lockId: newLock.record.id, openCheck: resultOpen } : {}),
          ...(resolved.signingChange && !isDerived ? { signingCheck: resultSigning } : {}),
          ...(confirmedAt !== undefined ? { writtenSeedConfirmedAt: confirmedAt } : {}),
        }
      },
    })
    // From here the edit is written: a failure no longer undoes anything, and the App
    // PIN the new lock or seal depends on must stay.
    committed = true
    const after = toMetas(written).find((m) => m.id === walletId)
    if (!after) throw new Error('Wallet not found in local vault.')
    return {
      status: 'ok',
      value: { meta: after, changed: true, previousLockId, autoLockMinutes: resultMinutes, previousLockRemoved: lockRemoved, ...(newLock ? { openKey: newLock.key } : {}) },
    }
  } catch (err) {
    if (!hadAppPin && !committed) await discardUnusedAppPin().catch(() => {})
    if (err instanceof EditConflictError) return { status: 'refused', reason: err.message }
    throw err
  } finally {
    seed = null
  }
}

/** Sets one lock's auto-lock minutes through `editChecks`: the lock's Open Check is
 * passed again first, and the policy decides against the networks of every Wallet
 * on that lock — a Mainnet Wallet's lock may not go under one minute (FR-65). On a
 * lock shared by legacy Wallets it applies to all of them, as before. A refusal
 * carries its plain reason and writes nothing. */
export async function setLockAutoLock(lockId: string, minutes: number, ctx: { prompts: Prompts } = { prompts: unavailablePrompts }): Promise<PolicyVerdict> {
  const onLock = (await listStoredWallets()).filter((w) => (w.lockId ?? LEGACY_LOCK_ID) === lockId)
  const first = onLock[0]
  // An unmigrated record would be read as Testnet and skip the Mainnet floor.
  if (first && (!first.views || first.views.length === 0)) {
    return { ok: false, reason: 'This wallet is not migrated yet. Restart the app and try again.' }
  }
  if (!first) {
    // A lock with no Wallet left on it has nothing to protect and no Seed to prove.
    return setAutoLockMinutes(lockId, minutes, [])
  }
  const result = await editChecks(viewsOf(first)[0].walletId, { autoLockMinutes: minutes }, ctx)
  if (result.status === 'ok') return { ok: true }
  if (result.status === 'refused') return { ok: false, reason: result.reason }
  if (result.status === 'cancelled') return { ok: false, reason: 'Cancelled. The auto-lock was not changed.' }
  return { ok: false, reason: `${describeCheckFailure(result)} The auto-lock was not changed.` }
}
