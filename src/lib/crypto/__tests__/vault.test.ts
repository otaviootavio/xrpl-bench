import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'

// Minimal in-memory stand-in for the IndexedDB layer, so the vault's
// wrap/unwrap logic can be exercised without a browser. `openLock('legacy')`
// is the one path that opens a vault written by an earlier build.
const stores: Record<string, Map<string, any>> = { vault: new Map(), wallets: new Map(), session: new Map() }

vi.mock('../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db')>()
  return {
    ...actual,
    getVaultMeta: async () => stores.vault.get('vault') ?? { key: 'vault', failedAttempts: 0 },
    putVaultMeta: async (meta: any) => void stores.vault.set('vault', meta),
    mutateVaultMeta: async (change: (m: any) => any) => {
      const next = change(stores.vault.get('vault') ?? { key: 'vault', failedAttempts: 0 })
      stores.vault.set('vault', next)
      return next
    },
    getLockRecord: async (id: string) => stores.vault.get(`lock:${id}`),
    putLockRecord: async (r: any) => void stores.vault.set(r.key, r),
    listLockRecords: async () => [...stores.vault.values()].filter((r) => r.key.startsWith('lock:')),
    wipeVaultDatabase: async () => {
      for (const s of Object.values(stores)) s.clear()
    },
    putLockSession: async (id: string, masterKey: CryptoKey, expiresAt: number) =>
      void stores.session.set(actual.sessionKeyOf(id), { key: actual.sessionKeyOf(id), masterKey, expiresAt }),
    getLockSession: async (id: string) => {
      const s = stores.session.get(actual.sessionKeyOf(id))
      if (!s) return null
      if (s.expiresAt <= Date.now()) {
        stores.session.delete(actual.sessionKeyOf(id))
        return null
      }
      return { key: s.masterKey, expiresAt: s.expiresAt }
    },
    clearLockSession: async (id: string) => void stores.session.delete(actual.sessionKeyOf(id)),
    clearAllLockSessions: async () => stores.session.clear(),
  }
})

// No platform authenticator in this environment — exercises the PIN path,
// which docs/decisions.md makes the mandatory fallback.
vi.mock('../webauthn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../webauthn')>()),
  isWebAuthnSupported: () => false,
  registerPasskey: async () => {
    throw new Error('unsupported')
  },
  assertPasskeyAndDeriveBits: async () => {
    throw new Error('unsupported')
  },
}))

import { setUpVaultAuth, getLockoutState, hasPasskeyRegistered } from '../auth'
import { openLock } from '../lock'
import { aesEncrypt, aesDecrypt } from '../aes'

beforeEach(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  }
  for (const s of Object.values(stores)) s.clear()
})

async function unlocked(pin: string) {
  const result = await openLock('legacy', 'pin', { pin })
  if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`)
  return result.value.key
}

describe('vault unlock', () => {
  it('unwraps the same master key it wrapped, so stored ciphertext decrypts', async () => {
    const setupKey = await setUpVaultAuth('tester', '123456')
    const sealed = await aesEncrypt(setupKey, 'sEdSEEDVALUE')

    const unlockedKey = await unlocked('123456')
    await expect(aesDecrypt(unlockedKey, sealed.ivB64, sealed.ciphertextB64)).resolves.toBe('sEdSEEDVALUE')
  })

  it('rejects a wrong PIN instead of deriving-and-trusting a key', async () => {
    await setUpVaultAuth('tester', '123456')
    // The core invariant from decisions.md §4: deriving a key always
    // "succeeds", so only a failed UNWRAP can reject a wrong credential.
    expect(await openLock('legacy', 'pin', { pin: '999999' })).toEqual({ status: 'wrong-credential', kind: 'pin', triesRemaining: 7 })
  })

  it('returns a non-extractable master key from setup as well as unlock', async () => {
    const setupKey = await setUpVaultAuth('tester', '123456')
    expect(setupKey.extractable).toBe(false)
    expect((await unlocked('123456')).extractable).toBe(false)
  })

  it('writes the legacy lock record at setup, so its auto-lock minutes live on the lock', async () => {
    await setUpVaultAuth('tester', '123456')
    expect(stores.vault.get('lock:legacy')).toMatchObject({ id: 'legacy', autoLockMinutes: 5 })
    const result = await openLock('legacy', 'pin', { pin: '123456' })
    expect(result).toMatchObject({ status: 'ok', value: { autoLockMinutes: 5 } })
    // Persisted under the legacy key, with an expiry.
    expect(stores.session.get('session')).toBeDefined()
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

  it('counts wrong PINs but not a method the lock does not have', async () => {
    await setUpVaultAuth('tester', '123456')
    expect((await openLock('legacy', 'pin', { pin: '000000' })).status).toBe('wrong-credential')
    expect((await getLockoutState()).hardLocked).toBe(false)
    expect(stores.vault.get('vault').failedAttempts).toBe(1)

    // No passkey is registered — a config error, not a failed attempt.
    expect(await openLock('legacy', 'passkey')).toEqual({ status: 'unsupported' })
    expect(stores.vault.get('vault').failedAttempts).toBe(1)
  })

  it('hard-locks after the configured number of failures', async () => {
    await setUpVaultAuth('tester', '123456')
    for (let i = 0; i < 8; i++) {
      // Clear any backoff so the loop reaches the hard-lock threshold.
      const meta = stores.vault.get('vault')
      stores.vault.set('vault', { ...meta, lockedUntil: undefined })
      expect((await openLock('legacy', 'pin', { pin: '000000' })).status).toBe('wrong-credential')
    }
    expect((await getLockoutState()).hardLocked).toBe(true)
    expect(await openLock('legacy', 'pin', { pin: '123456' })).toMatchObject({ status: 'locked-out', hard: true })
  })

  it('resets the failure count after a successful unlock', async () => {
    await setUpVaultAuth('tester', '123456')
    await openLock('legacy', 'pin', { pin: '000000' })
    const meta = stores.vault.get('vault')
    stores.vault.set('vault', { ...meta, lockedUntil: undefined })
    await unlocked('123456')
    expect(stores.vault.get('vault').failedAttempts).toBe(0)
  })
})
