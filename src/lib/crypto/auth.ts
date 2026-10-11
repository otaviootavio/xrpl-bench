import { getVaultMeta, LEGACY_LOCK_ID, putLockSession, putVaultMeta, wipeVaultDatabase } from './db'
import { deriveAesKeyFromBits, HKDF_INFO } from './derive'
import { DEFAULT_AUTO_LOCK_MINUTES, writeLegacyLock } from './lock'
import { assertPasskeyAndDeriveBits, isWebAuthnSupported, registerPasskey } from './webauthn'
import { derivePinKeyBits, generateSalt, getLockoutState } from './pin'
import { aesEncrypt } from './aes'
import { bufToB64, b64ToBuf } from './encoding'

export { HKDF_INFO }

// Opening a lock lives in lock.ts (AD-26); this module keeps vault setup. The
// shared PIN counter lives in pin.ts (AD-25) and is re-exported for the lock
// screen.
export { getLockoutState }
export type { UnlockLockoutState } from './pin'

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
  // The legacy lock's record (AD-27): this vault never meets the migration, so
  // the record that carries its auto-lock minutes is written here.
  await writeLegacyLock(autoLockMinutes)
  await putLockSession(LEGACY_LOCK_ID, sealedMasterKey, Date.now() + autoLockMinutes * 60_000)
  return sealedMasterKey
}

export async function hasPasskeyRegistered(): Promise<boolean> {
  const meta = await getVaultMeta()
  return !!meta.passkeyCredentialIdB64 && !!meta.wrappedMasterKeyForPasskey
}

/** Full teardown for wallet removal / logout — clears the vault entirely. */
export async function wipeVault(): Promise<void> {
  await wipeVaultDatabase()
}
