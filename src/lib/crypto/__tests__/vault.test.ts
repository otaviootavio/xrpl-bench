import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'

// Minimal in-memory stand-in for the IndexedDB layer, so the vault's
// wrap/unwrap logic can be exercised without a browser.
const stores: Record<string, Map<string, any>> = { vault: new Map(), wallets: new Map(), session: new Map() }

vi.mock('../db', () => ({
  getVaultMeta: async () => stores.vault.get('vault') ?? { key: 'vault', failedAttempts: 0 },
  putVaultMeta: async (meta: any) => void stores.vault.set('vault', meta),
  wipeVaultDatabase: async () => {
    for (const s of Object.values(stores)) s.clear()
  },
  putUnlockedSession: async (masterKey: CryptoKey, expiresAt: number) =>
    void stores.session.set('session', { key: 'session', masterKey, expiresAt }),
  getUnlockedSession: async () => {
    const s = stores.session.get('session')
    if (!s) return null
    if (s.expiresAt <= Date.now()) {
      stores.session.delete('session')
      return null
    }
    return s.masterKey
  },
  clearUnlockedSession: async () => void stores.session.delete('session'),
}))

// No platform authenticator in this environment — exercises the PIN path,
// which docs/decisions.md makes the mandatory fallback.
vi.mock('../webauthn', () => ({
  isWebAuthnSupported: () => false,
  registerPasskey: async () => {
    throw new Error('unsupported')
  },
  assertPasskeyAndDeriveBits: async () => {
    throw new Error('unsupported')
  },
}))

import { setUpVaultAuth, unlockVault, getLockoutState, hasPasskeyRegistered } from '../auth'
import { aesEncrypt, aesDecrypt } from '../aes'

beforeEach(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  }
  for (const s of Object.values(stores)) s.clear()
})

describe('vault unlock', () => {
  it('unwraps the same master key it wrapped, so stored ciphertext decrypts', async () => {
    const setupKey = await setUpVaultAuth('tester', '123456')
    const sealed = await aesEncrypt(setupKey, 'sEdSEEDVALUE')

    const unlockedKey = await unlockVault('pin', '123456')
    await expect(aesDecrypt(unlockedKey, sealed.ivB64, sealed.ciphertextB64)).resolves.toBe('sEdSEEDVALUE')
  })

  it('rejects a wrong PIN instead of deriving-and-trusting a key', async () => {
    await setUpVaultAuth('tester', '123456')
    // The core invariant from decisions.md §4: deriving a key always
    // "succeeds", so only a failed UNWRAP can reject a wrong credential.
    await expect(unlockVault('pin', '999999')).rejects.toThrow(/Incorrect PIN/)
  })

  it('returns a non-extractable master key from setup as well as unlock', async () => {
    const setupKey = await setUpVaultAuth('tester', '123456')
    expect(setupKey.extractable).toBe(false)
    const unlockedKey = await unlockVault('pin', '123456')
    expect(unlockedKey.extractable).toBe(false)
  })

  it('does not carry a stale passkey wrapper across re-onboarding', async () => {
    // Regression: setUpVaultAuth spread the previous vault meta, so a
    // passkey wrapper for the OLD master key survived into a vault with a
    // freshly generated one — the passkey then "unlocked" but decrypted
    // nothing.
    await setUpVaultAuth('tester', '123456')
    stores.vault.set('vault', {
      ...stores.vault.get('vault'),
      passkeyCredentialIdB64: 'stale-credential',
      wrappedMasterKeyForPasskey: { ivB64: 'AAAA', ciphertextB64: 'BBBB' },
    })

    await setUpVaultAuth('tester', '654321')

    const meta = stores.vault.get('vault')
    expect(meta.passkeyCredentialIdB64).toBeUndefined()
    expect(meta.wrappedMasterKeyForPasskey).toBeUndefined()
    await expect(hasPasskeyRegistered()).resolves.toBe(false)
  })

  it('counts wrong PINs but not configuration errors', async () => {
    await setUpVaultAuth('tester', '123456')
    await expect(unlockVault('pin', '000000')).rejects.toThrow()
    expect((await getLockoutState()).hardLocked).toBe(false)
    expect(stores.vault.get('vault').failedAttempts).toBe(1)

    // No passkey is registered — a config error, not a failed attempt.
    await expect(unlockVault('passkey')).rejects.toThrow(/No passkey is registered/)
    expect(stores.vault.get('vault').failedAttempts).toBe(1)
  })

  it('hard-locks after the configured number of failures', async () => {
    await setUpVaultAuth('tester', '123456')
    for (let i = 0; i < 8; i++) {
      // Clear any backoff so the loop reaches the hard-lock threshold.
      const meta = stores.vault.get('vault')
      stores.vault.set('vault', { ...meta, lockedUntil: undefined })
      await expect(unlockVault('pin', '000000')).rejects.toThrow()
    }
    expect((await getLockoutState()).hardLocked).toBe(true)
    await expect(unlockVault('pin', '123456')).rejects.toThrow(/Too many failed attempts/)
  })

  it('resets the failure count after a successful unlock', async () => {
    await setUpVaultAuth('tester', '123456')
    await expect(unlockVault('pin', '000000')).rejects.toThrow()
    const meta = stores.vault.get('vault')
    stores.vault.set('vault', { ...meta, lockedUntil: undefined })
    await unlockVault('pin', '123456')
    expect(stores.vault.get('vault').failedAttempts).toBe(0)
  })
})
