import { decodeSeed, ECDSA, isValidClassicAddress, Wallet } from 'xrpl'
import { canonicalNodeUrl, NETWORKS, type NetworkId } from '@/lib/xrpl/networks'
import type { SignedForReview, Signer, SigningHandle } from '@/lib/xrpl/writes'
import { aesDecrypt, aesEncrypt } from './aes'
import { deriveAesKeyFromBits, generateOrdinal, isOrdinal, seedSalt, walletFromSeedPrf } from './derive'
import { buildLock, createLock, deleteLock, discardAllLocks, discardAppPin, discardUnusedAppPin, getLockInfo, hasAppPin, openLock, setAutoLockMinutes, withAppPin, type CheckResult } from './lock'
import { checkAutoLock, checkLockRequest, checkEditAllowed, checkWalletRequest, requiresWrittenSeed, resolveEdit, type CheckEditRequest, type NewOpenCheck, type PasskeyCapability, type PasskeyChoice, type PolicyVerdict, type SigningKind } from './policy'
import { b64ToBuf, bufToB64 } from './encoding'
import { isKeyWallet } from '@/lib/wallet-meta'
import { INVALID_ADDRESS } from '@/lib/same-address'
import { uniqueDefaultName, validateWalletName, type WalletNameReason } from '@/lib/wallet-name'
import { attemptPin, getLockoutState, recordFailure, triesRemaining } from './pin'
import {
  assertAnyPasskeyAndDeriveBits,
  assertPasskeyAndDeriveBits,
  getRpId,
  isCancelled,
  isPrfUnsupported,
  isWebAuthnSupported,
  registerPasskey,
} from './webauthn'
import {
  commitWalletEdit,
  EditConflictError,
  exclusiveVaultWrite,
  getLockRecord,
  getVaultMeta,
  lockStamp,
  seedStamp,
  type LockRecord,
  listStoredWallets,
  mutateStoredWallet,
  putStoredWallet,
  type OpenCheck,
  type SeedAlgorithm,
  type SeedMethod,
  type SigningCheck,
  type SigningSeal,
  type StoredWallet,
  type WalletView,
  listTransmitterRecords,
  mutateTransmitterRecord,
  putTransmitterRecord,
  transmitterVerifierText,
  type TransmitterRecord,
} from './db'

/** What every Wallet has, whatever its kind. `id` is the walletId — selection
 * state is never an address (AD-18). */
interface WalletMetaBase {
  id: string
  /** The record id: the Seed record for a key Wallet, the Transmitter record itself. */
  seedId: string
  /** The lock whose Open Key opens this Wallet (AD-21). */
  lockId: string
  label: string
  createdAt: number
  network: NetworkId
  /** A custom Node's `wss://` URL, proven for `network` when it was saved.
   * Absent: the network's built-in Nodes. */
  node?: string
  openCheck: OpenCheck
  /** "Show the signed transaction before sending" is on (OS-FR-10). Absent: off.
   * Never set on an Offline Wallet, which never transmits. */
  showBeforeSending?: true
}

/** An Online or Offline Wallet: one view over a Seed record. */
export interface KeyWalletMeta extends WalletMetaBase {
  /** Online or Offline (OS-FR-1). Each kind opens its own screens. */
  kind: 'online' | 'offline'
  /** The Account this Wallet reads and signs for: the ONLY ledger identity every
   * read, query key, send, receive and teardown uses (AD-18). It is `keyAddress`
   * unless the Wallet operates another Account as its Regular Key. */
  address: string
  /** The address the Seed itself derives: used only to detect a wrong credential
   * and to choose how to sign (AD-18). */
  keyAddress: string
  algorithm: SeedAlgorithm
  /** How the Seed exists: stored under a key, or computed from a passkey (FR-62). */
  seedMethod: SeedMethod
  signingCheck: SigningCheck
  /** When the Seed was written down and confirmed (FR-72). Absent: never. */
  writtenSeedConfirmedAt?: number
}

/** A Transmitter Wallet (OS-FR-3): no Seed, no key, never signs. */
export interface TransmitterMeta extends WalletMetaBase {
  kind: 'transmitter'
  /** The Synced address (OS-FR-4), or `null` when not synced: then there is no
   * Account to read, and nothing account-scoped mounts. */
  address: string | null
}

/** A Wallet as the rest of the app sees it. */
export type WalletMeta = KeyWalletMeta | TransmitterMeta


/** The kind a stored view names: absent is Online, a stored non-Online kind is
 * itself, and anything else (a typo, a kind from a later build, even a literal
 * `'online'`, which is never written) is `null`, so that view is not shown
 * (OS-FR-1: fail closed, never read as Online). */
function kindOfView(v: WalletView): 'online' | 'offline' | null {
  const raw: unknown = (v as { kind?: unknown }).kind
  if (raw === undefined) return 'online'
  // A Seed view that says `transmitter` is a contradiction (a Transmitter holds no
  // Seed): not shown, never read as Online or as a Transmitter (OS-FR-3).
  return raw === 'offline' ? raw : null
}

function viewsOf(w: StoredWallet): WalletView[] {
  return w.views
}

function toMetas(w: StoredWallet): KeyWalletMeta[] {
  return viewsOf(w).flatMap((v): KeyWalletMeta[] => {
    const kind = kindOfView(v)
    if (kind === null) return []
    return [toMeta(w, v, kind)]
  })
}

function toMeta(w: StoredWallet, v: WalletView, kind: 'online' | 'offline'): KeyWalletMeta {
  return {
    id: v.walletId,
    seedId: w.id,
    lockId: w.lockId,
    label: w.label,
    address: v.accountAddress ?? w.address,
    keyAddress: w.address,
    createdAt: w.createdAt,
    network: v.network,
    ...(v.node ? { node: v.node } : {}),
    algorithm: w.algorithm,
    seedMethod: w.seedMethod,
    openCheck: w.openCheck,
    signingCheck: w.signingCheck,
    ...(w.writtenSeedConfirmedAt !== undefined ? { writtenSeedConfirmedAt: w.writtenSeedConfirmedAt } : {}),
    kind,
    ...(showsBeforeSending(v, kind) ? { showBeforeSending: true as const } : {}),
  }
}

/** The setting is on only when exactly `true` is stored, and never for an
 * Offline Wallet (OS-FR-10: Online and Transmitter only). */
function showsBeforeSending(v: WalletView, kind: 'online' | 'offline'): boolean {
  return kind !== 'offline' && (v as { showBeforeSending?: unknown }).showBeforeSending === true
}

function findSeedRecord(all: StoredWallet[], walletId: string): StoredWallet | undefined {
  return all.find((w) => viewsOf(w).some((v) => v.walletId === walletId))
}

/** One Wallet is identified by `(network, Account, key)`; a second view with the
 * same triple, on any Seed record, is refused (AD-18). */
function hasView(all: StoredWallet[], network: NetworkId, account: string, keyAddress: string): boolean {
  return all.some((w) => w.address === keyAddress && viewsOf(w).some((v) => v.network === network && (v.accountAddress ?? w.address) === account))
}

/** A Transmitter record as the app sees it. */
function transmitterMeta(t: TransmitterRecord): TransmitterMeta {
  return {
    id: t.id,
    seedId: t.id,
    lockId: t.lockId,
    label: t.label,
    createdAt: t.createdAt,
    network: t.network,
    ...(t.node ? { node: t.node } : {}),
    openCheck: t.openCheck,
    kind: 'transmitter',
    address: t.syncedAddress ?? null,
    ...(t.showBeforeSending === true ? { showBeforeSending: true as const } : {}),
  }
}

export async function listWallets(): Promise<WalletMeta[]> {
  const [wallets, transmitters] = await Promise.all([listStoredWallets(), listTransmitterRecords()])
  return [...wallets.flatMap((w) => toMetas(w)), ...transmitters.map(transmitterMeta)]
}

/** The Wallets that hold a key (Online and Offline): every caller that signs or
 * reasons about keys reads these and never sees a Transmitter. */
export async function listKeyWallets(): Promise<KeyWalletMeta[]> {
  return (await listWallets()).filter(isKeyWallet)
}

/** Every Wallet name on the device, one per record (AD-42), Transmitters included. */
async function allRecordLabels(exceptId?: string): Promise<string[]> {
  const [wallets, transmitters] = await Promise.all([listStoredWallets(), listTransmitterRecords()])
  return [...wallets, ...transmitters].filter((w) => w.id !== exceptId).map((w) => w.label)
}

/** The algorithm a Seed's own encoding names. */
function algorithmOfSeed(seed: string): 'ed25519' | 'secp256k1' {
  return decodeSeed(seed).type === 'ed25519' ? 'ed25519' : 'secp256k1'
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
  /**
   * "Show the signed transaction before sending" (OS-FR-10): shows the signed
   * blob and answers "Send it to the ledger?". Asked only for a Wallet whose
   * setting is on. Absent while that setting is on, every send is declined:
   * nothing is sent without the review the user asked for.
   */
  reviewSignedTransaction?(signed: SignedForReview): Promise<boolean>
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
  const view = viewsOf(stored).find((v) => v.walletId === walletId)
  const kind = view ? kindOfView(view) : null
  const review = view && kind !== null && showsBeforeSending(view, kind)
  return {
    address,
    // The key is the Account's own (master) key unless this is a controlled view.
    signsAsMaster: address === stored.address,
    async open() {
      const result = await openSigner(walletId, ctx)
      if (result.status !== 'ok') throw new SigningCheckError(result)
      return result.value
    },
    // Only when the setting is on: with it off the handle is what it was before
    // the setting existed. Without a reviewer the answer is "no" (fail closed).
    ...(review ? { reviewBeforeSending: reviewerOf(ctx.prompts) } : {}),
  }
}

/** The review a Wallet's sends go through when its setting is on; without a
 * reviewer in the prompts the answer is "no" (fail closed). */
function reviewerOf(prompts: Prompts): (signed: SignedForReview) => Promise<boolean> {
  return (signed) => prompts.reviewSignedTransaction?.(signed) ?? Promise.resolve(false)
}

/** Refused: an Offline Wallet never sends, so it has no such setting (OS-FR-10, OS-FR-11). */
export class SettingNotForOfflineError extends Error {
  constructor() {
    super('An offline wallet does not send, so this setting is not for it.')
    this.name = 'SettingNotForOfflineError'
  }
}

/** Turns "Show the signed transaction before sending" on or off for one Wallet's
 * view only (OS-FR-10). Stores `true` or removes the field, and touches nothing
 * else. Returns the Wallet's refreshed meta. */
export async function setShowBeforeSending(walletId: string, on: boolean): Promise<WalletMeta> {
  if (await isTransmitterId(walletId)) {
    await mutateTransmitterRecord(walletId, (current) => {
      const { showBeforeSending: _previous, ...rest } = current
      return on ? { ...rest, showBeforeSending: true as const } : rest
    })
    return metaOf(walletId)
  }
  const record = findSeedRecord(await listStoredWallets(), walletId)
  if (!record) throw new Error('Wallet not found in local vault.')
  const view = viewsOf(record).find((v) => v.walletId === walletId)
  // Not reachable from the UI (the plate is not on an Offline Wallet); refused
  // so no caller can store it there.
  if (on && view && kindOfView(view) === 'offline') throw new SettingNotForOfflineError()
  await mutateStoredWallet(record.id, (current) => ({
    ...current,
    views: viewsOf(current).map((v) => {
      if (v.walletId !== walletId) return v
      const { showBeforeSending: _previous, ...rest } = v
      return on ? { ...rest, showBeforeSending: true as const } : rest
    }),
  }))
  const meta = (await listWallets()).find((w) => w.id === walletId)
  if (!meta) throw new Error('Wallet not found in local vault.')
  return meta
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
    const passed = await repassOpenCheck(stored.lockId, ctx.prompts)
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
 * lock: the passkey. A wrong PIN counts and a cancelled prompt never does
 * (AD-25). Nothing is persisted. */
async function repassOpenCheck(lockId: string, prompts: Prompts): Promise<CheckResult<CryptoKey | null>> {
  const info = await getLockInfo(lockId)
  if (info.openCheck === 'none') return { status: 'ok', value: null }
  if (info.openCheck === 'passkey') {
    const opened = await openLock(lockId, 'passkey', { persist: false })
    return opened.status === 'ok' ? { status: 'ok', value: opened.value.key } : opened
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
    const transmitter = (await listTransmitterRecords()).find((t) => t.id === seedId)
    if (!all.some((w) => w.id === seedId) && !transmitter) return { ok: false, reason: 'write-failed' }
    const verdict = validateWalletName(rawName, await allRecordLabels(seedId))
    if (!verdict.ok) return verdict
    if (transmitter) {
      let renamed: TransmitterRecord | undefined
      await mutateTransmitterRecord(seedId, (current) => {
        renamed = { ...current, label: verdict.name }
        return renamed
      })
      return renamed ? { ok: true, metas: [transmitterMeta(renamed)] } : { ok: false, reason: 'write-failed' }
    }
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

/**
 * The name a NEW Seed is stored under (AD-42): the typed one when it passes the one name
 * rule against the stored records, otherwise (empty, too long, or taken) the first free
 * `Wallet`, `Wallet 2`, ... A best-effort guard across tabs, not a security boundary.
 */
async function nameForNewWallet(raw: string): Promise<string> {
  const others = await allRecordLabels()
  const verdict = validateWalletName(raw, others)
  return verdict.ok ? verdict.name : uniqueDefaultName('Wallet', others)
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
 * a controlled account's view of the same Seed keeps working. The whole removal runs
 * under `exclusiveVaultWrite`, so a create or import in flight finishes first and
 * the emptiness check below sees what it wrote (AD-46).
 *
 * When the removal leaves no Wallet on the device, every lock record (any
 * orphan from a failed creation included) goes and `discardAppPin` removes the
 * App PIN with its failure count (FR-86). That step reports its failure in the
 * result rather than throwing: the Wallet is already gone. */
export function removeWallet(walletId: string): Promise<RemoveWalletResult> {
  return exclusiveVaultWrite(() => removeWalletUnguarded(walletId))
}

/** Nothing of any kind is stored: Seed records and Transmitter records alike. A
 * Transmitter left on the device keeps its lock and the App PIN it may use. */
async function deviceHoldsWallets(): Promise<boolean> {
  const [wallets, transmitters] = await Promise.all([listStoredWallets(), listTransmitterRecords()])
  return wallets.length + transmitters.length > 0
}

async function removeWalletUnguarded(walletId: string): Promise<RemoveWalletResult> {
  const transmitter = (await listTransmitterRecords()).find((t) => t.id === walletId)
  if (transmitter) {
    await mutateTransmitterRecord(walletId, () => null)
    if (!(await lockIdsInUseNow()).has(transmitter.lockId)) await deleteLock(transmitter.lockId)
  }
  const record = transmitter ? undefined : findSeedRecord(await listStoredWallets(), walletId)
  if (record) {
    await mutateStoredWallet(record.id, (current) => {
      const remaining = viewsOf(current).filter((v) => v.walletId !== walletId)
      return remaining.length === 0 ? null : { ...current, views: remaining }
    })
    // A lock made for Wallets that are all gone goes with the last of them.
    const lockId = record.lockId
    if (!(await lockIdsInUseNow()).has(lockId)) {
      await deleteLock(lockId)
    }
  }
  if (await deviceHoldsWallets()) return { emptied: false, appPin: 'kept' }
  // Nothing is stored: every lock record left is an orphan.
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

async function lockIdsInUseNow(): Promise<Set<string>> {
  const [wallets, transmitters] = await Promise.all([listStoredWallets(), listTransmitterRecords()])
  return new Set([...wallets.map((w) => w.lockId), ...transmitters.map((t) => t.lockId)])
}

async function isTransmitterId(walletId: string): Promise<boolean> {
  return (await listTransmitterRecords()).some((t) => t.id === walletId)
}

async function metaOf(walletId: string): Promise<WalletMeta> {
  const meta = (await listWallets()).find((w) => w.id === walletId)
  if (!meta) throw new Error('Wallet not found in local vault.')
  return meta
}

// ---------------------------------------------------------------------------
// Transmitter Wallets (OS-FR-3, OS-FR-4): no Seed, a lock of their own
// ---------------------------------------------------------------------------

export interface CreateTransmitterInput {
  label: string
  network: NetworkId
  /** A custom Node the caller already proved for `network` (`verifyNode`). */
  node?: string
  openCheck: NewOpenCheck
  autoLockMinutes: number
  /** "Sync to an address" at creation (OS-FR-4). Absent: not synced. */
  syncedAddress?: string
}

export type CreateTransmitterResult = CheckResult<{ meta: TransmitterMeta; openKey: CryptoKey }> | { status: 'refused'; reason: string }

/**
 * Adds a Transmitter Wallet on a NEW lock of its own (OS-FR-3). The policy is the
 * lock's alone (`checkLockRequest`: FR-65, an Open Check and the auto-lock floor on
 * Mainnet); there is no Seed, so no written-Seed or passkey-origin rule. Order, so a
 * failure leaves the vault as it was: name, policy, address, the lock (its
 * credential), then one write of the record with its verifier. A failure after the
 * lock is written removes it and any App PIN made for it.
 */
export function createTransmitterWallet(input: CreateTransmitterInput, ctx: { pin?: string; appPinExpected?: boolean } = {}): Promise<CreateTransmitterResult> {
  return exclusiveVaultWrite(() => createTransmitterUnguarded(input, ctx))
}


async function createTransmitterUnguarded(requested: CreateTransmitterInput, ctx: { pin?: string; appPinExpected?: boolean }): Promise<CreateTransmitterResult> {
  const label = await nameForNewWallet(requested.label)
  const verdict = checkLockRequest({ network: requested.network, openCheck: requested.openCheck, autoLockMinutes: requested.autoLockMinutes })
  if (!verdict.ok) return { status: 'refused', reason: verdict.reason }
  if (requested.syncedAddress !== undefined && !isValidClassicAddress(requested.syncedAddress)) return { status: 'refused', reason: INVALID_ADDRESS }
  const node = requested.node === undefined ? undefined : (canonicalNodeUrl(requested.node) ?? undefined)
  if (requested.node !== undefined && !node) {
    return { status: 'refused', reason: 'A custom Node must be a wss:// address with no username, password, query or fragment.' }
  }
  if (requested.openCheck === 'pin' && !ctx.pin) return { status: 'cancelled' }
  const hadAppPin = await hasAppPin()
  if (ctx.appPinExpected && !hadAppPin && requested.openCheck === 'pin') return { status: 'refused', reason: APP_PIN_GONE }
  const id = crypto.randomUUID()
  let lockId: string | null = null
  try {
    const lock = await createLock(
      { network: requested.network, openCheck: requested.openCheck, autoLockMinutes: requested.autoLockMinutes, label: `${label} – open` },
      { pin: ctx.pin },
    )
    if (lock.status !== 'ok') return await abandon(hadAppPin, lock)
    lockId = lock.value.id
    const record: TransmitterRecord = {
      recordKind: 'transmitter',
      id,
      label,
      createdAt: Date.now(),
      lockId,
      openCheck: requested.openCheck,
      network: requested.network,
      ...(node ? { node } : {}),
      ...(requested.syncedAddress ? { syncedAddress: requested.syncedAddress } : {}),
      verifier: await aesEncrypt(lock.value.key, transmitterVerifierText(id)),
    }
    await putTransmitterRecord(record)
    return { status: 'ok', value: { meta: transmitterMeta(record), openKey: lock.value.key } }
  } catch (err) {
    if (lockId) await deleteLock(lockId).catch(() => {})
    if (!hadAppPin) await discardUnusedAppPin().catch(() => {})
    throw err
  }
}

/** "Sync to an address" (OS-FR-4): sets the address, or removes it (`null`),
 * without re-creating the Wallet. Only a Transmitter can be synced. */
export async function setTransmitterSync(walletId: string, address: string | null): Promise<TransmitterMeta> {
  if (address !== null && !isValidClassicAddress(address)) throw new Error(INVALID_ADDRESS)
  if (!(await isTransmitterId(walletId))) throw new Error('Wallet not found in local vault.')
  await mutateTransmitterRecord(walletId, (current) => {
    const { syncedAddress: _previous, ...rest } = current
    return address === null ? rest : { ...rest, syncedAddress: address }
  })
  const meta = await metaOf(walletId)
  if (meta.kind !== 'transmitter') throw new Error('Wallet not found in local vault.')
  return meta
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
  /** `offline`: an Offline Wallet (OS-FR-2). Absent: an Online Wallet. An Offline
   * Wallet has no Node, so `node` with it is refused before anything is written. */
  kind?: 'offline'
}

export type CreateStoredWalletResult =
  | CheckResult<{
      meta: KeyWalletMeta
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

async function createStoredWalletUnguarded(requested: CreateStoredWalletInput, ctx: CreateWalletContext): Promise<CreateStoredWalletResult> {
  let seed = ''
  const result = await writeNewStoredWallet(
    { ...requested, passkey: requested.passkey ?? 'unknown', origin: 'generated' },
    ctx,
    () => {
      const wallet = Wallet.generate(requested.algorithm === 'ed25519' ? ECDSA.ed25519 : ECDSA.secp256k1)
      seed = wallet.seed!
      return { seed, address: wallet.address, algorithm: requested.algorithm }
    },
  )
  if (result.status !== 'ok') return result
  return { status: 'ok', value: { ...result.value, seed } }
}

export interface ImportStoredWalletInput {
  label: string
  network: NetworkId
  /** A custom Node the caller already proved for `network` (`verifyNode`). */
  node?: string
  openCheck: NewOpenCheck
  autoLockMinutes: number
  signing: SigningKind
  /** The parsed Seed. A parameter only: the caller holds it in a ref and clears it in `finally`. */
  seed: string
  passkey?: PasskeyCapability
  /** `offline`: an Offline Wallet (OS-FR-2, OS-FR-7). Absent: an Online Wallet. */
  kind?: 'offline'
}

export type ImportWalletContext = CreateWalletContext

/** The result carries `meta` and the new lock's `openKey`, NEVER the Seed. */
export type ImportStoredWalletResult = CheckResult<{ meta: KeyWalletMeta; openKey: CryptoKey }> | { status: 'refused'; reason: string }

const IMPORT_MALFORMED_REASON = 'That is not a valid Seed.'
function importDuplicateReasonText(network: NetworkId): string {
  return `This key is already on this device on ${NETWORKS[network].label}.`
}

/** The one duplicate check, shared by the writer and the screen's probe so the two
 * cannot disagree: the key is the address plus the Network (FR-93, AD-39). */
async function duplicateReasonFor(address: string, network: NetworkId): Promise<string | null> {
  return hasView(await listStoredWallets(), network, address, address) ? importDuplicateReasonText(network) : null
}

/**
 * Asks, before any prompt or ledger read, whether this Seed's address is already on
 * the device on this Network: the reason to show, or `null`. A value that is not a Seed
 * is not a duplicate (the caller parses first). Reads only; the Seed is a parameter.
 */
export async function importDuplicateReason(seed: string, network: NetworkId): Promise<string | null> {
  let address: string
  try {
    address = Wallet.fromSeed(seed).address
  } catch {
    return null
  }
  return duplicateReasonFor(address, network)
}

/**
 * Imports a Seed as a Stored Seed Wallet on a NEW lock of its own (AD-39), held to at
 * least the strength Generate is: an Open Check of `none` is refused on every network.
 * Same writer and order as `createStoredWallet`; a duplicate address on the same Network is
 * refused before any prompt, credential or lock. No ledger read. The Seed is never
 * kept, logged, thrown or returned.
 */
export function importStoredWallet(input: ImportStoredWalletInput, ctx: ImportWalletContext = {}): Promise<ImportStoredWalletResult> {
  return exclusiveVaultWrite(() => importStoredWalletUnguarded(input, ctx))
}

async function importStoredWalletUnguarded(input: ImportStoredWalletInput, ctx: ImportWalletContext): Promise<ImportStoredWalletResult> {
  const { seed, ...rest } = input
  return writeNewStoredWallet({ ...rest, passkey: input.passkey ?? 'unknown', origin: 'imported' }, ctx, () => {
    let wallet: Wallet
    let algorithm: 'ed25519' | 'secp256k1'
    try {
      wallet = Wallet.fromSeed(seed)
      algorithm = algorithmOfSeed(seed)
    } catch {
      // Never the library's message: it is not ours to promise it holds no Seed.
      return { refused: IMPORT_MALFORMED_REASON }
    }
    return { seed, address: wallet.address, algorithm }
  })
}

interface NewWalletSpec {
  label: string
  network: NetworkId
  node?: string
  openCheck: NewOpenCheck
  autoLockMinutes: number
  signing: SigningKind
  passkey: PasskeyCapability
  origin: 'generated' | 'imported'
  kind?: 'offline'
}

/** A programming error, never shown: an Offline Wallet has no Node (OS-FR-2), so a
 * request that names one is a caller bug. Thrown before any credential, lock or write. */
export class OfflineWalletNodeError extends Error {
  constructor() {
    super('An Offline Wallet has no Node.')
    this.name = 'OfflineWalletNodeError'
  }
}

/** The one writer behind Generate and Import (AD-39). Order, so a failure leaves the
 * vault as it was: name rule, policy, duplicate check (import), written-Seed
 * confirmation, the Signing Check's credential, the lock, one write of the Wallet. A
 * failure after the lock is written removes that lock and any App PIN made for it. */
async function writeNewStoredWallet(
  spec: NewWalletSpec,
  ctx: CreateWalletContext,
  obtainSeed: () => { seed: string; address: string; algorithm: 'ed25519' | 'secp256k1' } | { refused: string },
): Promise<CheckResult<{ meta: KeyWalletMeta; openKey: CryptoKey }> | { status: 'refused'; reason: string }> {
  // Inside the guard, so the name is checked against the records this write will sit beside (AD-42).
  const input = { ...spec, label: await nameForNewWallet(spec.label) }
  const verdict = checkWalletRequest({
    canConfirmWrittenSeed: !!ctx.confirmWrittenSeed,
    network: input.network,
    seedMethod: 'stored',
    openCheck: input.openCheck,
    autoLockMinutes: input.autoLockMinutes,
    signing: input.signing,
    passkey: input.passkey,
    ...(input.origin === 'imported' ? { imported: true } : {}),
  })
  if (!verdict.ok) return { status: 'refused', reason: verdict.reason }
  if (input.kind === 'offline' && input.node !== undefined) throw new OfflineWalletNodeError()
  const node = input.node === undefined ? undefined : (canonicalNodeUrl(input.node) ?? undefined)
  if (input.node !== undefined && !node) {
    return { status: 'refused', reason: 'A custom Node must be a wss:// address with no username, password, query or fragment.' }
  }
  const needsPin = input.openCheck === 'pin' || input.signing === 'pin'
  let hadAppPin = false
  // A Generate checks the PIN before it makes a Seed, so a cancelled or refused request never creates one.
  // An import already holds its Seed as a parameter, so its duplicate check comes first (AD-39).
  const pinGate = async (): Promise<{ status: 'cancelled' } | { status: 'refused'; reason: string } | null> => {
    if (needsPin && !ctx.pin) return { status: 'cancelled' }
    hadAppPin = await hasAppPin()
    if (ctx.appPinExpected && !hadAppPin && needsPin) return { status: 'refused', reason: APP_PIN_GONE }
    return null
  }
  if (input.origin === 'generated') {
    const blocked = await pinGate()
    if (blocked) return blocked
  }
  const obtained = obtainSeed()
  if ('refused' in obtained) return { status: 'refused', reason: obtained.refused }
  const { seed, address, algorithm } = obtained
  if (input.origin === 'imported') {
    // One Account is held once per Network (AD-39, FR-93).
    const duplicate = await duplicateReasonFor(address, input.network)
    if (duplicate) return { status: 'refused', reason: duplicate }
    const blocked = await pinGate()
    if (blocked) return blocked
  }
  const walletId = crypto.randomUUID()
  let lockId: string | null = null
  try {
    // FR-72: the Seed is shown and confirmed before any credential, lock or
    // Wallet is written. A refusal here leaves the vault exactly as it was.
    const confirmedAt = await confirmedAtFor(input.network, input.openCheck, input.signing, ctx.confirmWrittenSeed, seed)
    if (confirmedAt === 'cancelled') return await abandon(hadAppPin, { status: 'cancelled' as const })
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
      address,
      createdAt: Date.now(),
      seedMethod: 'stored',
      algorithm,
      lockId,
      openCheck: input.openCheck,
      signingCheck: input.signing,
      views: [{ walletId, network: input.network, ...(node ? { node } : {}), ...(input.kind === 'offline' ? { kind: 'offline' as const } : {}) }],
      ...(confirmedAt ? { writtenSeedConfirmedAt: confirmedAt } : {}),
      ...(sealed
        ? { sealedSeed: sealed.sealedSeed, signing: sealed.signing }
        : { encryptedSeed: await aesEncrypt(lock.value.key, seed) }),
    }
    await putStoredWallet(stored)
    return { status: 'ok', value: { meta: toMetas(stored)[0], openKey: lock.value.key } }
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
      meta: KeyWalletMeta
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

async function createDerivedWalletUnguarded(requested: CreateDerivedWalletInput, ctx: CreateWalletContext): Promise<CreateDerivedWalletResult> {
  const input = { ...requested, label: await nameForNewWallet(requested.label) }
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

/** Records that a Seed's key operates `accountAddress` as that Account's Regular
 * Key: a second view over the SAME Seed record, with the Account on the view and
 * nothing else changed (AD-18). Call only after a validated `SetRegularKey` and a
 * fresh read that shows this key (AD-29). A view with the same
 * `(network, accountAddress, keyAddress)` is refused and nothing is written. */
export async function addControlledView(
  seedWalletId: string,
  view: { network: NetworkId; node?: string; accountAddress: string },
): Promise<KeyWalletMeta> {
  const all = await listStoredWallets()
  const record = findSeedRecord(all, seedWalletId)
  if (!record) throw new Error('Wallet not found in local vault.')
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
  const meta = (await listKeyWallets()).find((w) => w.id === newWalletId)
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
  if (await isTransmitterId(walletId)) {
    await mutateTransmitterRecord(walletId, (current) => {
      const { node: _previous, ...rest } = current
      return canonical ? { ...rest, node: canonical } : rest
    })
    return metaOf(walletId)
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
      meta: KeyWalletMeta
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
  const fromLockId = stored.lockId
  const lockRecord = await getLockRecord(fromLockId)
  const info = await getLockInfo(fromLockId)
  const expectSeedStamp = seedStamp(stored)
  const expectLockStamp = lockStamp(lockRecord)
  const isDerived = stored.seedMethod === 'passkey-derived'
  const isSealed = !!(stored.signing || stored.sealedSeed)
  const standardRecord = !isDerived && !isSealed

  const current = {
    seedMethod: stored.seedMethod,
    openCheck: info.openCheck,
    signing: (isDerived ? 'passkey' : stored.signingCheck) as SigningKind,
    autoLockMinutes: info.autoLockMinutes,
  }
  const resolved = resolveEdit(current, request)
  const meta = (await listKeyWallets()).find((m) => m.id === walletId)
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
    : (await listStoredWallets()).filter((w) => w.lockId === fromLockId).flatMap((w) => viewsOf(w).map((v) => v.network))
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
        ? (lockRecord ? { ...lockRecord, autoLockMinutes: resultMinutes } : undefined)
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
 * on that lock — a Mainnet Wallet's lock may not go under one minute (FR-65). A refusal
 * carries its plain reason and writes nothing. */
export async function setLockAutoLock(lockId: string, minutes: number, ctx: { prompts: Prompts } = { prompts: unavailablePrompts }): Promise<PolicyVerdict> {
  const onLock = (await listStoredWallets()).filter((w) => w.lockId === lockId)
  const first = onLock[0]
  const transmitters = (await listTransmitterRecords()).filter((t) => t.lockId === lockId)
  if (!first && transmitters.length > 0) {
    // A Transmitter's lock (OS-FR-3, FR-65): its Open Check is passed again first,
    // then the floor is judged against its Network. No Seed to prove.
    const proved = await reproveOpenKey(lockId, ctx.prompts)
    if (proved.status === 'cancelled') return { ok: false, reason: 'Cancelled. The auto-lock was not changed.' }
    if (proved.status !== 'ok') return { ok: false, reason: `${describeCheckFailure(proved)} The auto-lock was not changed.` }
    return setAutoLockMinutes(lockId, minutes, transmitters.map((t) => t.network))
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
