import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'

// Minimal in-memory stand-in for the IndexedDB layer, so the vault's
// wrap/unwrap logic can be exercised without a browser.
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

import { getLockoutState } from '../auth'
import { createLock, openLock } from '../lock'
import { aesEncrypt, aesDecrypt } from '../aes'

beforeEach(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  }
  for (const s of Object.values(stores)) s.clear()
})

/** A PIN lock of its own; the first one also makes `pin` the App PIN. */
async function setUpLock(pin: string, autoLockMinutes = 5) {
  const created = await createLock({ network: 'testnet', openCheck: 'pin', autoLockMinutes }, { pin })
  if (created.status !== 'ok') throw new Error(`expected ok, got ${created.status}`)
  return created.value
}

async function unlocked(lockId: string, pin: string) {
  const result = await openLock(lockId, 'pin', { pin })
  if (result.status !== 'ok') throw new Error(`expected ok, got ${result.status}`)
  return result.value.key
}

describe('vault unlock', () => {
  it('unwraps the same Open Key it wrapped, so stored ciphertext decrypts', async () => {
    const lock = await setUpLock('123456')
    const sealed = await aesEncrypt(lock.key, 'sEdSEEDVALUE')

    const unlockedKey = await unlocked(lock.id, '123456')
    await expect(aesDecrypt(unlockedKey, sealed.ivB64, sealed.ciphertextB64)).resolves.toBe('sEdSEEDVALUE')
  })

  it('rejects a wrong PIN instead of deriving-and-trusting a key', async () => {
    const lock = await setUpLock('123456')
    // The core invariant from decisions.md §4: deriving a key always
    // "succeeds", so only a failed UNWRAP can reject a wrong credential.
    expect(await openLock(lock.id, 'pin', { pin: '999999' })).toEqual({ status: 'wrong-credential', kind: 'pin', triesRemaining: 7 })
  })

  it('returns a non-extractable Open Key from creation as well as unlock', async () => {
    const lock = await setUpLock('123456')
    expect(lock.key.extractable).toBe(false)
    expect((await unlocked(lock.id, '123456')).extractable).toBe(false)
  })

  it('keeps the auto-lock minutes on the lock record and persists the session under session:<id>', async () => {
    const lock = await setUpLock('123456')
    expect(stores.vault.get(`lock:${lock.id}`)).toMatchObject({ id: lock.id, autoLockMinutes: 5 })
    const result = await openLock(lock.id, 'pin', { pin: '123456' })
    expect(result).toMatchObject({ status: 'ok', value: { autoLockMinutes: 5 } })
    expect(stores.session.get(`session:${lock.id}`)).toBeDefined()
  })

  it('counts wrong PINs but not a method the lock does not have', async () => {
    const lock = await setUpLock('123456')
    expect((await openLock(lock.id, 'pin', { pin: '000000' })).status).toBe('wrong-credential')
    expect((await getLockoutState()).hardLocked).toBe(false)
    expect(stores.vault.get('vault').failedAttempts).toBe(1)

    // No passkey is registered on this lock — a config error, not a failed attempt.
    expect(await openLock(lock.id, 'passkey')).toEqual({ status: 'unsupported' })
    expect(stores.vault.get('vault').failedAttempts).toBe(1)
  })

  it('hard-locks after the configured number of failures', async () => {
    const lock = await setUpLock('123456')
    for (let i = 0; i < 8; i++) {
      // Clear any backoff so the loop reaches the hard-lock threshold.
      const meta = stores.vault.get('vault')
      stores.vault.set('vault', { ...meta, lockedUntil: undefined })
      expect((await openLock(lock.id, 'pin', { pin: '000000' })).status).toBe('wrong-credential')
    }
    expect((await getLockoutState()).hardLocked).toBe(true)
    expect(await openLock(lock.id, 'pin', { pin: '123456' })).toMatchObject({ status: 'locked-out', hard: true })
  })

  it('resets the failure count after a successful unlock', async () => {
    const lock = await setUpLock('123456')
    await openLock(lock.id, 'pin', { pin: '000000' })
    const meta = stores.vault.get('vault')
    stores.vault.set('vault', { ...meta, lockedUntil: undefined })
    await unlocked(lock.id, '123456')
    expect(stores.vault.get('vault').failedAttempts).toBe(0)
  })
})
