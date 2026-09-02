import { getVaultMeta, putVaultMeta, wipeVaultDatabase, putUnlockedSession, getUnlockedSession, clearUnlockedSession } from './db'
import { deriveAesKeyFromBits } from './derive'
import { assertPasskeyAndDeriveBits, isWebAuthnSupported, registerPasskey } from './webauthn'
import { derivePinKeyBits, generateSalt } from './pin'
import { aesEncrypt, aesDecrypt } from './aes'
import { bufToB64, b64ToBuf } from './encoding'

const HKDF_INFO = 'xrpl-wallet:unlock-method-key:v1'
const MAX_ATTEMPTS_BEFORE_HARD_LOCK = 8
const BACKOFF_STARTS_AT_ATTEMPT = 3
const DEFAULT_AUTO_LOCK_MINUTES = 5

export type UnlockMethod = 'passkey' | 'pin'

export interface UnlockLockoutState {
  locked: boolean
  hardLocked: boolean // per docs/decisions.md: after 8 fails, require re-import via seed
  backoffMs: number
  remainingMs: number
  /** Absolute epoch-ms the backoff expires at (0 if not backed off). Exposed
   * so the UI can derive a countdown without calling Date.now() during
   * render, which makes the value unstable across re-renders. */
  lockedUntil: number
}

async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

async function exportMasterKeyB64(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key)
  return bufToB64(raw)
}

async function importMasterKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', b64ToBuf(b64), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** Wraps (encrypts) the vault's master key under a method-specific key
 * derived from the PIN or passkey, so that method can later unwrap it. */
async function wrapMasterKey(masterKey: CryptoKey, methodKey: CryptoKey) {
  const masterKeyB64 = await exportMasterKeyB64(masterKey)
  return aesEncrypt(methodKey, masterKeyB64)
}

async function unwrapMasterKey(wrapped: { ivB64: string; ciphertextB64: string }, methodKey: CryptoKey): Promise<CryptoKey> {
  const masterKeyB64 = await aesDecrypt(methodKey, wrapped.ivB64, wrapped.ciphertextB64) // throws on wrong key
  return importMasterKey(masterKeyB64)
}

/** Onboarding: register passkey (if supported) AND a PIN fallback — the PIN
 * is mandatory, not optional (docs/decisions.md resolved decision), because
 * not every environment has a platform authenticator. Generates the vault's
 * one master key and wraps it under each configured method, then returns
 * the master key so the caller can immediately encrypt the first wallet's
 * seed with it. */
export async function setUpVaultAuth(userLabel: string, pin: string, autoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES): Promise<CryptoKey> {
  const masterKey = await generateMasterKey()

  const pinSaltB64 = generateSalt()
  const pinKey = await deriveAesKeyFromBits(await derivePinKeyBits(pin, pinSaltB64), HKDF_INFO)
  const wrappedMasterKeyForPin = await wrapMasterKey(masterKey, pinKey)

  // Build the new vault meta from SCRATCH — never by spreading the previous
  // meta. Spreading carried a stale `wrappedMasterKeyForPasskey` (wrapping the
  // PREVIOUS master key) into a vault whose master key had just been
  // regenerated. Reachable by removing every wallet and re-onboarding: the
  // passkey would then unwrap successfully — a valid auth tag for the old
  // wrapper — and yet decrypt none of the newly stored seeds. Same class of
  // "unlocked with a key that can't actually decrypt" bug as docs/decisions.md §4.
  await putVaultMeta({
    key: 'vault',
    pinSaltB64,
    wrappedMasterKeyForPin,
    passkeyCredentialIdB64: undefined,
    wrappedMasterKeyForPasskey: undefined,
    failedAttempts: 0,
    lockedUntil: undefined,
  })

  if (isWebAuthnSupported()) {
    try {
      const { credentialIdB64, prfSupported } = await registerPasskey(userLabel)
      if (prfSupported) {
        const passkeyBits = await assertPasskeyAndDeriveBits(credentialIdB64)
        const passkeyKey = await deriveAesKeyFromBits(passkeyBits, HKDF_INFO)
        const wrappedMasterKeyForPasskey = await wrapMasterKey(masterKey, passkeyKey)
        const current = await getVaultMeta()
        await putVaultMeta({ ...current, passkeyCredentialIdB64: credentialIdB64, wrappedMasterKeyForPasskey })
      }
    } catch {
      // Passkey registration is best-effort; the PIN fallback still works.
      // The wrapper fields stay cleared above, so hasPasskeyRegistered() will
      // correctly report false rather than offering a passkey that can't work.
    }
  }

  // Hand back a NON-extractable handle to the same key. The generated key must
  // be extractable so it can be wrapped above, but nothing outside this
  // function should be able to export its raw bits — db.ts documents the
  // session store as holding a non-extractable CryptoKey, and this is what
  // makes that true for the onboarding path (unlockVault already re-imports).
  const sealedMasterKey = await importMasterKey(await exportMasterKeyB64(masterKey))
  await putUnlockedSession(sealedMasterKey, Date.now() + autoLockMinutes * 60_000)
  return sealedMasterKey
}

export async function hasPasskeyRegistered(): Promise<boolean> {
  const meta = await getVaultMeta()
  return !!meta.passkeyCredentialIdB64 && !!meta.wrappedMasterKeyForPasskey
}

export async function getLockoutState(): Promise<UnlockLockoutState> {
  const meta = await getVaultMeta()
  const now = Date.now()
  const hardLocked = meta.failedAttempts >= MAX_ATTEMPTS_BEFORE_HARD_LOCK
  const backoffMs =
    meta.failedAttempts >= BACKOFF_STARTS_AT_ATTEMPT
      ? Math.min(2 ** (meta.failedAttempts - BACKOFF_STARTS_AT_ATTEMPT) * 1000, 60_000)
      : 0
  const remainingMs = meta.lockedUntil ? Math.max(0, meta.lockedUntil - now) : 0
  return { locked: remainingMs > 0, hardLocked, backoffMs, remainingMs, lockedUntil: meta.lockedUntil ?? 0 }
}

async function recordFailure(): Promise<void> {
  const meta = await getVaultMeta()
  const failedAttempts = meta.failedAttempts + 1
  const backoffMs = failedAttempts >= BACKOFF_STARTS_AT_ATTEMPT ? Math.min(2 ** (failedAttempts - BACKOFF_STARTS_AT_ATTEMPT) * 1000, 60_000) : 0
  await putVaultMeta({ ...meta, failedAttempts, lockedUntil: backoffMs > 0 ? Date.now() + backoffMs : undefined })
}

async function recordSuccess(): Promise<void> {
  const meta = await getVaultMeta()
  await putVaultMeta({ ...meta, failedAttempts: 0, lockedUntil: undefined })
}

/**
 * Unlocks the vault via the requested method, enforcing the backoff/hard-
 * lock policy from docs/decisions.md. Derives the method-specific key, then
 * unwraps the vault's single master key with it — unwrapping IS the
 * correctness check (AES-GCM's auth tag makes a wrong key fail to decrypt),
 * so a wrong PIN or a failed/foreign passkey assertion is rejected here,
 * not silently accepted. Returns the master key used to decrypt stored
 * seeds — callers must not persist this key anywhere; it lives only for the
 * duration of the unlocked session (in-memory, in the wallet store), never
 * in localStorage or serialized state. On success, also persists the
 * unlocked session (see docs/decisions.md — non-extractable CryptoKey in
 * IndexedDB, expiring with the auto-lock window) so a page refresh within
 * that window doesn't force re-entering the PIN/passkey.
 */
export async function unlockVault(method: UnlockMethod, pin?: string, autoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES): Promise<CryptoKey> {
  const lockout = await getLockoutState()
  if (lockout.hardLocked) {
    throw new Error('Too many failed attempts. Re-import your wallet with your seed to continue.')
  }
  if (lockout.locked) {
    throw new Error(`Too many failed attempts. Try again in ${Math.ceil(lockout.remainingMs / 1000)}s.`)
  }
  const meta = await getVaultMeta()

  // Configuration problems and user-cancelled ceremonies are NOT failed
  // unlock attempts. Counting them was a real foot-gun: dismissing the
  // biometric sheet 8 times hard-locked the wallet even though no wrong
  // credential was ever supplied. Only a failed UNWRAP counts (see below).
  if (method === 'pin' && (!meta.pinSaltB64 || !meta.wrappedMasterKeyForPin)) {
    throw new Error('No PIN has been set up for this device.')
  }
  if (method === 'passkey' && (!meta.passkeyCredentialIdB64 || !meta.wrappedMasterKeyForPasskey)) {
    throw new Error('No passkey is registered on this device.')
  }

  let methodKey: CryptoKey
  try {
    if (method === 'pin') {
      methodKey = await deriveAesKeyFromBits(await derivePinKeyBits(pin ?? '', meta.pinSaltB64!), HKDF_INFO)
    } else {
      const passkeyBits = await assertPasskeyAndDeriveBits(meta.passkeyCredentialIdB64!)
      methodKey = await deriveAesKeyFromBits(passkeyBits, HKDF_INFO)
    }
  } catch (err: any) {
    // A cancelled/aborted WebAuthn ceremony, or an unsupported-PRF device.
    // The user never asserted a wrong credential, so don't penalise them.
    if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
      throw new Error('Unlock was cancelled.')
    }
    throw err
  }

  // Deriving a key ALWAYS succeeds, even for a wrong PIN — unwrapping is the
  // only real check (AES-GCM's auth tag fails on a wrong key). This is the
  // one operation whose failure counts as a failed attempt.
  let masterKey: CryptoKey
  try {
    masterKey = await unwrapMasterKey(
      (method === 'pin' ? meta.wrappedMasterKeyForPin : meta.wrappedMasterKeyForPasskey)!,
      methodKey,
    )
  } catch {
    await recordFailure()
    throw new Error(method === 'passkey' ? 'Passkey verification failed.' : 'Incorrect PIN.')
  }

  await recordSuccess()
  await putUnlockedSession(masterKey, Date.now() + autoLockMinutes * 60_000)
  return masterKey
}

/** Restores a still-valid unlocked session (e.g. after a page refresh)
 * without re-prompting for a PIN/passkey. Returns null if none exists or it
 * has expired. */
export async function restoreSession(): Promise<CryptoKey | null> {
  return getUnlockedSession()
}

/** Extends the persisted session's expiry — called on user activity
 * alongside the in-memory auto-lock timer reset, so an actively-used
 * session keeps surviving refreshes for as long as it would stay unlocked
 * anyway. */
export async function extendSession(masterKey: CryptoKey, autoLockMinutes: number): Promise<void> {
  await putUnlockedSession(masterKey, Date.now() + autoLockMinutes * 60_000)
}

/** Ends the persisted session — called on every lock path (manual lock,
 * auto-lock timeout, backgrounding), not just clearing the in-memory key. */
export async function endSession(): Promise<void> {
  await clearUnlockedSession()
}

/** Full teardown for wallet removal / logout — clears the vault entirely. */
export async function wipeVault(): Promise<void> {
  await wipeVaultDatabase()
}
