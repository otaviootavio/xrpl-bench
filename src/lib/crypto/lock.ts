import type { NetworkId } from '@/lib/xrpl/networks'
import { aesDecrypt, aesEncrypt } from './aes'
import { deriveAesKeyFromBits, HKDF_INFO } from './derive'
import { b64ToBuf, bufToB64 } from './encoding'
import { attemptPin, derivePinKeyBits, generateSalt, getLockoutState, PBKDF2_ITERATIONS, recordFailure, resetFailures, triesRemaining } from './pin'
import { checkAutoLock, checkLockRequest, type NewOpenCheck, type PolicyVerdict } from './policy'
import { assertPasskeyAndDeriveBits, isCancelled, isPrfUnsupported, isWebAuthnSupported, PRF_SALT, registerPasskey } from './webauthn'
import {
  clearAllLockSessions,
  clearLockSession,
  deleteLockRecord,
  getLockRecord,
  extendLockSessionExpiry,
  getLockSession,
  getVaultMeta,
  LEGACY_LOCK_ID,
  listLockRecords,
  listStoredWallets,
  lockKey,
  mutateVaultMeta,
  putLockRecord,
  putLockSession,
  type LockRecord,
  type OpenCheck,
} from './db'

/**
 * The lock layer (AD-21): a lock is one random Open Key wrapped under the lock's
 * own Open Check credential. Opening a lock UNWRAPS that key — a wrong PIN or a
 * foreign passkey assertion is rejected by AES-GCM's auth tag, never by
 * deriving, which always succeeds. Nothing here holds a key beyond the call: the
 * caller (the app store) keeps the non-extractable result, and `db.ts` keeps its
 * persisted session.
 *
 * The legacy lock (AD-27) is every Wallet written before per-Wallet locks. Its
 * Open Key IS the old vault master key, wrapped as it always was in the vault
 * meta, so it opens exactly as before.
 *
 * `xrpl` never imports this module; PINs arrive as arguments (parent AD-1).
 */

export const DEFAULT_AUTO_LOCK_MINUTES = 5

/** What a check yields (FR-66..68). Never carries a message holding key
 * material. `cancelled` is a dismissed prompt and never counts toward the PIN
 * lockout; `wrong-credential` always does. */
export type CheckResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'wrong-credential'; kind: 'pin' | 'passkey'; triesRemaining: number }
  | { status: 'cancelled' }
  | { status: 'unsupported' }
  | { status: 'locked-out'; hard: boolean; lockedUntil: number }

export type OpenMethod = 'pin' | 'passkey' | 'none'

/** A lock as the UI needs to know it. Holds no key. */
export interface LockInfo {
  id: string
  openCheck: OpenCheck
  autoLockMinutes: number
  /** Whether a PIN opens it, and whether a passkey does. */
  pin: boolean
  passkey: boolean
}

export interface OpenedLock {
  /** Non-extractable. */
  key: CryptoKey
  autoLockMinutes: number
}

const OPEN_HKDF_PREFIX = 'xrpl-bench:open:'
const PIN_VERIFIER_INFO = 'xrpl-bench:pin-verifier:v1'
const PIN_VERIFIER_PLAINTEXT = 'xrpl-bench:app-pin'

type Wrapped = { ivB64: string; ciphertextB64: string }

async function importOpenKey(rawB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', b64ToBuf(rawB64), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function unwrapOpenKey(wrapped: Wrapped, methodKey: CryptoKey): Promise<CryptoKey> {
  return importOpenKey(await aesDecrypt(methodKey, wrapped.ivB64, wrapped.ciphertextB64)) // throws on a wrong key
}

async function wrapOpenKey(openKey: CryptoKey, methodKey: CryptoKey): Promise<Wrapped> {
  return aesEncrypt(methodKey, bufToB64(await crypto.subtle.exportKey('raw', openKey)))
}

/** The legacy lock's record, written with the constants that were baked in until
 * now — stored from here on, never recomputed (AD-21). */
export function legacyLockRecord(autoLockMinutes: number): LockRecord {
  return {
    key: lockKey(LEGACY_LOCK_ID),
    id: LEGACY_LOCK_ID,
    hkdfInfo: HKDF_INFO,
    prfSaltB64: bufToB64(PRF_SALT.slice().buffer),
    pbkdf2: { iterations: PBKDF2_ITERATIONS, hash: 'SHA-256', keyBits: 256 },
    autoLockMinutes,
    createdAt: Date.now(),
  }
}

/** Writes the legacy lock's record, for a vault set up on this build. A vault
 * from an earlier build gets it from the migration instead. */
export async function writeLegacyLock(autoLockMinutes: number): Promise<void> {
  await putLockRecord(legacyLockRecord(autoLockMinutes))
}

export async function getLockInfo(lockId: string): Promise<LockInfo> {
  const record = await getLockRecord(lockId)
  if (lockId === LEGACY_LOCK_ID) {
    const meta = await getVaultMeta()
    const passkey = !!meta.passkeyCredentialIdB64 && !!meta.wrappedMasterKeyForPasskey
    return {
      id: lockId,
      openCheck: passkey ? 'either' : 'pin',
      autoLockMinutes: record?.autoLockMinutes ?? DEFAULT_AUTO_LOCK_MINUTES,
      pin: !!meta.pinSaltB64 && !!meta.wrappedMasterKeyForPin,
      passkey,
    }
  }
  if (!record) throw new Error('Lock not found.')
  const openCheck = record.openCheck ?? 'pin'
  return {
    id: lockId,
    openCheck,
    autoLockMinutes: record.autoLockMinutes,
    pin: openCheck === 'pin' || openCheck === 'either',
    passkey: openCheck === 'passkey' || openCheck === 'either',
  }
}

export async function listLocks(): Promise<LockInfo[]> {
  const ids = new Set((await listLockRecords()).map((r) => r.id))
  ids.add(LEGACY_LOCK_ID)
  const infos: LockInfo[] = []
  for (const id of ids) {
    try {
      infos.push(await getLockInfo(id))
    } catch {
      // A record that vanished between the list and the read.
    }
  }
  return infos
}

/** What a lock's wrappers are, gathered from wherever its kind keeps them. */
interface OpenPlan {
  hkdfInfo: string
  prfSalt: BufferSource
  autoLockMinutes: number
  pin?: Wrapped
  passkey?: { credentialIdB64: string; wrapped: Wrapped }
  noneKey?: CryptoKey
}

async function planFor(lockId: string): Promise<OpenPlan> {
  const record = await getLockRecord(lockId)
  if (lockId === LEGACY_LOCK_ID) {
    const meta = await getVaultMeta()
    return {
      // A vault the migration has not reached has no record yet: the constants
      // it would have been given.
      hkdfInfo: record?.hkdfInfo ?? HKDF_INFO,
      prfSalt: record?.prfSaltB64 ? new Uint8Array(b64ToBuf(record.prfSaltB64)) : PRF_SALT,
      autoLockMinutes: record?.autoLockMinutes ?? DEFAULT_AUTO_LOCK_MINUTES,
      pin: meta.pinSaltB64 ? meta.wrappedMasterKeyForPin : undefined,
      passkey:
        meta.passkeyCredentialIdB64 && meta.wrappedMasterKeyForPasskey
          ? { credentialIdB64: meta.passkeyCredentialIdB64, wrapped: meta.wrappedMasterKeyForPasskey }
          : undefined,
    }
  }
  if (!record) throw new Error('Lock not found.')
  return {
    hkdfInfo: record.hkdfInfo,
    prfSalt: record.prfSaltB64 ? new Uint8Array(b64ToBuf(record.prfSaltB64)) : new Uint8Array(0),
    autoLockMinutes: record.autoLockMinutes,
    pin: record.wrappedOpenKeyForPin,
    passkey:
      record.passkeyCredentialIdB64 && record.wrappedOpenKeyForPasskey
        ? { credentialIdB64: record.passkeyCredentialIdB64, wrapped: record.wrappedOpenKeyForPasskey }
        : undefined,
    noneKey: record.openCheck === 'none' ? record.openKey : undefined,
  }
}

async function finish(lockId: string, key: CryptoKey, autoLockMinutes: number, persist = true): Promise<CheckResult<OpenedLock>> {
  if (persist) await putLockSession(lockId, key, Date.now() + autoLockMinutes * 60_000)
  return { status: 'ok', value: { key, autoLockMinutes } }
}

/**
 * Opens one lock with the given method and returns its non-extractable Open Key.
 *
 *  - PIN goes through `attemptPin`, the one counter shared with every other PIN
 *    use (AD-25). A hard lock or a backoff blocks it.
 *  - A passkey is never blocked by a PIN lockout: a hard lock disables PIN
 *    derivation, not a passkey. A presented assertion that fails to unwrap
 *    counts, as it does today; a cancelled or dismissed prompt never does.
 *  - `none` opens with no prompt.
 *
 * On success the session is persisted under `session:<lockId>` (the legacy
 * lock under `session`) with the lock's own expiry.
 */
export async function openLock(lockId: string, method: OpenMethod, ctx: { pin?: string } = {}): Promise<CheckResult<OpenedLock>> {
  const plan = await planFor(lockId)

  if (method === 'none') {
    if (!plan.noneKey) return { status: 'unsupported' }
    return finish(lockId, plan.noneKey, plan.autoLockMinutes, false)
  }

  if (method === 'pin') {
    if (!plan.pin) return { status: 'unsupported' }
    const wrapped = plan.pin
    const attempt = await attemptPin(ctx.pin ?? '', async (bits) =>
      unwrapOpenKey(wrapped, await deriveAesKeyFromBits(bits, plan.hkdfInfo)),
    )
    if (attempt.status === 'locked-out') return attempt
    if (attempt.status === 'wrong-credential') return { status: 'wrong-credential', kind: 'pin', triesRemaining: attempt.triesRemaining }
    return finish(lockId, attempt.value, plan.autoLockMinutes)
  }

  if (!plan.passkey) return { status: 'unsupported' }
  if (!isWebAuthnSupported()) return { status: 'unsupported' }
  let bits: ArrayBuffer
  try {
    bits = await assertPasskeyAndDeriveBits(plan.passkey.credentialIdB64, plan.prfSalt)
  } catch (err) {
    // A dismissed ceremony or a device with no PRF: nothing wrong was presented.
    if (isCancelled(err)) return { status: 'cancelled' }
    if (isPrfUnsupported(err)) return { status: 'unsupported' }
    throw err
  }
  let key: CryptoKey
  try {
    key = await unwrapOpenKey(plan.passkey.wrapped, await deriveAesKeyFromBits(bits, plan.hkdfInfo))
  } catch {
    await recordFailure()
    return { status: 'wrong-credential', kind: 'passkey', triesRemaining: await triesRemaining() }
  }
  // A passkey proves the owner, but must not undo a PIN hard lock (AD-25).
  if (!(await getLockoutState()).hardLocked) await resetFailures()
  return finish(lockId, key, plan.autoLockMinutes)
}

// ---------------------------------------------------------------------------
// Creation (AD-21, AD-28). The Wallet that goes under a new lock is written by
// `keystore.createStoredWallet`.
// ---------------------------------------------------------------------------

export interface CreateLockInput {
  /** The network of the Wallet the lock is for: the policy's floors read it. */
  network: NetworkId
  openCheck: NewOpenCheck
  autoLockMinutes: number
  /** Names a new passkey in the browser's own prompt. */
  label?: string
}

export type CreateLockResult = CheckResult<{ id: string; key: CryptoKey }> | { status: 'refused'; reason: string }

/** Proves a typed PIN is the App PIN: its known ciphertext decrypts under it. */
async function provesAppPin(bits: ArrayBuffer, meta: Awaited<ReturnType<typeof getVaultMeta>>): Promise<void> {
  if (meta.wrappedMasterKeyForPin) {
    await aesDecrypt(await deriveAesKeyFromBits(bits, HKDF_INFO), meta.wrappedMasterKeyForPin.ivB64, meta.wrappedMasterKeyForPin.ciphertextB64)
    return
  }
  if (meta.pinVerifier) {
    await aesDecrypt(await deriveAesKeyFromBits(bits, meta.pinVerifier.hkdfInfo), meta.pinVerifier.ivB64, meta.pinVerifier.ciphertextB64)
    return
  }
  throw new Error('The App PIN cannot be verified.')
}

/**
 * The one way the App PIN is created and proved (AD-25), shared by an Open Check
 * and a Signing Check. `build` receives the HKDF key for `hkdfInfo` (one purpose,
 * one key) and returns what the caller will store.
 *
 * With no App PIN yet, `pin` becomes it: a salt and a verifier are written, so
 * later uses can prove it from known ciphertext. Otherwise the PIN is tried on
 * the shared counter: proved against the legacy wrapper or the verifier, and a
 * wrong one counts. A vault with an App PIN but nothing to prove it against is a
 * configuration problem, not a wrong PIN, and must not count.
 */
export async function withAppPin<T>(
  pin: string,
  hkdfInfo: string,
  build: (methodKey: CryptoKey) => Promise<T>,
): Promise<CheckResult<T>> {
  const meta = await getVaultMeta()
  if (!meta.pinSaltB64) {
    const pinSaltB64 = generateSalt()
    const bits = await derivePinKeyBits(pin, pinSaltB64)
    const verifier = await aesEncrypt(await deriveAesKeyFromBits(bits, PIN_VERIFIER_INFO), PIN_VERIFIER_PLAINTEXT)
    const value = await build(await deriveAesKeyFromBits(bits, hkdfInfo))
    const written = await mutateVaultMeta((current) =>
      current.pinSaltB64 ? current : { ...current, pinSaltB64, pinVerifier: { ...verifier, hkdfInfo: PIN_VERIFIER_INFO } },
    )
    if (written.pinSaltB64 !== pinSaltB64) return withAppPin(pin, hkdfInfo, build) // another flow set the App PIN first
    return { status: 'ok', value }
  }
  if (!meta.wrappedMasterKeyForPin && !meta.pinVerifier) return { status: 'unsupported' }
  const attempt = await attemptPin(pin, async (bits) => {
    await provesAppPin(bits, meta)
    return build(await deriveAesKeyFromBits(bits, hkdfInfo))
  })
  if (attempt.status === 'locked-out') return attempt
  if (attempt.status === 'wrong-credential') return { status: 'wrong-credential', kind: 'pin', triesRemaining: attempt.triesRemaining }
  return { status: 'ok', value: attempt.value }
}

/** Does this device have an App PIN yet? The creation flow asks twice if not. */
export async function hasAppPin(): Promise<boolean> {
  return !!(await getVaultMeta()).pinSaltB64
}

/** Undoes an App PIN that a creation that then failed had just made, if nothing
 * has used it since — so a refused or cancelled creation leaves the vault as it
 * was. Anything that depends on the PIN blocks it: a lock wrapped under it, a
 * Wallet sealed under it (a PIN Signing Check has no lock wrapper), or a legacy
 * wrapper. The failure count is not touched: a passkey shares it. */
export async function discardUnusedAppPin(): Promise<void> {
  if ((await listLockRecords()).some((r) => r.wrappedOpenKeyForPin)) return
  if ((await listStoredWallets()).some((w) => w.signing?.kind === 'pin')) return
  await mutateVaultMeta((current) => {
    if (current.wrappedMasterKeyForPin) return current
    const { pinSaltB64: _salt, pinVerifier: _verifier, ...rest } = current
    return rest
  })
}

/**
 * Creates a lock with its own Open Key (PIN, passkey or none) and stores the
 * record. The policy decides first and a refusal writes nothing. Every salt and
 * `info` string is generated here and stored on the record. The lock is NOT
 * opened and no session is written; the Open Key is returned (non-extractable)
 * for the caller that creates the first Wallet under it.
 *
 * A PIN lock proves the App PIN from known ciphertext: the legacy wrapper if
 * present, else the verifier written when the App PIN was created. With no App
 * PIN yet, `ctx.pin` becomes it.
 */
export async function createLock(input: CreateLockInput, ctx: { pin?: string } = {}): Promise<CreateLockResult> {
  const verdict = checkLockRequest(input)
  if (!verdict.ok) return { status: 'refused', reason: verdict.reason }

  const id = crypto.randomUUID()
  const hkdfInfo = `${OPEN_HKDF_PREFIX}${id}:v1`
  const base = {
    key: lockKey(id),
    id,
    hkdfInfo,
    pbkdf2: { iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' as const, keyBits: 256 },
    autoLockMinutes: input.autoLockMinutes,
    createdAt: Date.now(),
    openCheck: input.openCheck,
  }

  if (input.openCheck === 'none') {
    const openKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    await putLockRecord({ ...base, openKey })
    return { status: 'ok', value: { id, key: openKey } }
  }

  const extractable = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const sealed = await importOpenKey(bufToB64(await crypto.subtle.exportKey('raw', extractable)))

  if (input.openCheck === 'pin') {
    if (!ctx.pin) return { status: 'cancelled' }
    const wrapped = await withAppPin(ctx.pin, hkdfInfo, (methodKey) => wrapOpenKey(extractable, methodKey))
    if (wrapped.status !== 'ok') return wrapped
    await putLockRecord({ ...base, wrappedOpenKeyForPin: wrapped.value })
    return { status: 'ok', value: { id, key: sealed } }
  }

  // Passkey: its own credential and its own PRF salt, both stored.
  if (!isWebAuthnSupported()) return { status: 'unsupported' }
  const prfSalt = crypto.getRandomValues(new Uint8Array(32))
  let credentialIdB64: string
  let bits: ArrayBuffer
  try {
    credentialIdB64 = (await registerPasskey(input.label ?? 'XRPL Bench wallet')).credentialIdB64
    // An authenticator may skip PRF evaluation at registration, so the
    // assertion that follows is the normal path, not a retry (AD-24).
    bits = await assertPasskeyAndDeriveBits(credentialIdB64, prfSalt)
  } catch (err) {
    if (isCancelled(err)) return { status: 'cancelled' }
    if (isPrfUnsupported(err)) return { status: 'unsupported' }
    throw err
  }
  const wrappedOpenKeyForPasskey = await wrapOpenKey(extractable, await deriveAesKeyFromBits(bits, hkdfInfo))
  await putLockRecord({ ...base, prfSaltB64: bufToB64(prfSalt.buffer), passkeyCredentialIdB64: credentialIdB64, wrappedOpenKeyForPasskey })
  return { status: 'ok', value: { id, key: sealed } }
}

// ---------------------------------------------------------------------------
// Auto-lock minutes live on the lock record (AD-26)
// ---------------------------------------------------------------------------

/** Sets one lock's auto-lock minutes, if the policy allows it for the networks
 * its Wallets are on. Writes nothing on a refusal. */
export async function setAutoLockMinutes(
  lockId: string,
  minutes: number,
  networks: readonly NetworkId[],
): Promise<PolicyVerdict> {
  const verdict = checkAutoLock(networks, minutes)
  if (!verdict.ok) return verdict
  const record = (await getLockRecord(lockId)) ?? (lockId === LEGACY_LOCK_ID ? legacyLockRecord(minutes) : undefined)
  if (!record) throw new Error('Lock not found.')
  await putLockRecord({ ...record, autoLockMinutes: minutes })
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Sessions (AD-21): one persisted entry per open lock
// ---------------------------------------------------------------------------

/** Starts one lock's persisted session with the full window — the creation flow
 * calls it once the new Wallet is committed, so a refresh does not re-ask. */
export async function startLockSession(lockId: string, key: CryptoKey, autoLockMinutes: number): Promise<void> {
  await putLockSession(lockId, key, Date.now() + autoLockMinutes * 60_000)
}

/** Removes a lock's record and its session. The legacy lock is refused: its
 * wrappers live in the vault meta and every migrated Wallet is on it. */
export async function deleteLock(lockId: string): Promise<void> {
  await deleteLockRecord(lockId)
  await clearLockSession(lockId)
}

/** Every lock whose persisted session is still valid, with its key. An expired
 * entry is cleared by the read. */
export async function restoreOpenLocks(): Promise<Array<{ lockId: string; key: CryptoKey; autoLockMinutes: number; expiresAt: number }>> {
  const ids = new Set((await listLockRecords()).map((r) => r.id))
  ids.add(LEGACY_LOCK_ID)
  const restored: Array<{ lockId: string; key: CryptoKey; autoLockMinutes: number; expiresAt: number }> = []
  for (const lockId of ids) {
    const session = await getLockSession(lockId)
    if (!session) continue
    restored.push({
      lockId,
      key: session.key,
      autoLockMinutes: (await planFor(lockId).catch(() => null))?.autoLockMinutes ?? DEFAULT_AUTO_LOCK_MINUTES,
      // The PERSISTED expiry: a refresh never grants a fresh window.
      expiresAt: session.expiresAt,
    })
  }
  return restored
}

/** Extends one lock's persisted session — called on activity, throttled by the
 * caller. Only an entry that still exists is moved: a lock that closed while
 * this was in flight stays closed. */
export async function extendLockSession(lockId: string, autoLockMinutes: number): Promise<void> {
  await extendLockSessionExpiry(lockId, Date.now() + autoLockMinutes * 60_000)
}

/** Ends one lock's persisted session — every close path, not only the
 * in-memory key. */
export async function endLockSession(lockId: string): Promise<void> {
  await clearLockSession(lockId)
}

/** Ends every persisted session (backgrounding, full lock). */
export async function endAllLockSessions(): Promise<void> {
  await clearAllLockSessions()
}
