import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'

/**
 * Story 4 / AD-21, AD-25, AD-26, AD-28: per-lock Open Keys. `idb` and WebAuthn
 * are the external resources replaced; the cryptography is real.
 */
const h = vi.hoisted(() => {
  type Stores = Record<string, Map<string, any>>
  const state = { stores: {} as Stores, failNextPutOn: null as string | null, version: 0 }
  const clone = (v: any) => (v === undefined ? v : structuredClone(v))
  const KEY_PATH: Record<string, string> = { wallets: 'id', vault: 'key', session: 'key' }
  function makeDb() {
    return {
      transaction(names: string | string[]) {
        const list = Array.isArray(names) ? names : [names]
        const staged: Stores = {}
        for (const n of list) staged[n] = new Map([...state.stores[n]].map(([k, v]) => [k, clone(v)]))
        let aborted = false
        let finished: (() => void) | undefined
        const done = new Promise<void>((resolve, reject) => {
          finished = () => (aborted ? reject(new Error('AbortError')) : resolve())
        })
        const store = (n: string) => ({
          get: async (k: string) => clone(staged[n].get(k)),
          getAll: async () => [...staged[n].values()].map(clone),
          put: async (v: any) => {
            if (state.failNextPutOn === n) {
              state.failNextPutOn = null
              aborted = true
              throw new Error('put failed')
            }
            staged[n].set(v[KEY_PATH[n]], clone(v))
          },
          delete: async (k: string) => void staged[n].delete(k),
        })
        // Awaiting `done` is what commits: staged writes replace the store
        // whole, or are dropped whole if the transaction aborted.
        const lazyDone = {
          then: (res: any, rej: any) => {
            if (!aborted) for (const n of list) state.stores[n] = staged[n]
            finished?.()
            return done.then(res, rej)
          },
          catch: (rej: any) => done.catch(rej),
        }
        return {
          store: store(list[0]),
          objectStore: store,
          abort() {
            aborted = true
            finished?.()
          },
          done: lazyDone,
        }
      },
      get: async (s: string, k: string) => clone(state.stores[s].get(k)),
      getAll: async (s: string) => [...state.stores[s].values()].map(clone),
      put: async (s: string, v: any) => void state.stores[s].set(v[KEY_PATH[s]], clone(v)),
      delete: async (s: string, k: string) => void state.stores[s].delete(k),
      clear: async (s: string) => void state.stores[s].clear(),
    }
  }
  return { state, makeDb }
})

vi.mock('idb', () => ({
  openDB: async (_name: string, version: number) => {
    h.state.version = version
    return h.makeDb()
  },
}))

// The PRF output is a function of the salt AND the credential, as on a real
// authenticator: a different salt (a different lock) gives a different key.
const w = vi.hoisted(() => ({ mode: 'ok' as 'ok' | 'cancel' | 'no-prf' | 'other-key', asserts: 0, registers: 0 }))
vi.mock('../webauthn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../webauthn')>()
  return {
    ...actual,
    isWebAuthnSupported: () => true,
    registerPasskey: async () => {
      w.registers += 1
      if (w.mode === 'cancel') throw Object.assign(new Error('dismissed'), { name: 'NotAllowedError' })
      return { credentialIdB64: 'Y3JlZA==', prfSupported: true }
    },
    assertPasskeyAndDeriveBits: async (_id: string, salt: BufferSource) => {
      w.asserts += 1
      if (w.mode === 'cancel') throw Object.assign(new Error('dismissed'), { name: 'NotAllowedError' })
      if (w.mode === 'no-prf') throw Object.assign(new Error('no prf'), { name: 'PrfUnsupportedError' })
      const tag = new TextEncoder().encode(w.mode === 'other-key' ? 'other' : 'same')
      const bytes = new Uint8Array(salt as ArrayBuffer)
      const joined = new Uint8Array(tag.length + bytes.length)
      joined.set(tag)
      joined.set(bytes, tag.length)
      return crypto.subtle.digest('SHA-256', joined)
    },
  }
})

import { getLockRecord, listLockRecords, type OpenCheck } from '../db'
import { createLock, endAllLockSessions, endLockSession, extendLockSession, getLockInfo, openLock, restoreOpenLocks, setAutoLockMinutes } from '../lock'
import { setLockAutoLock, type Prompts } from '../keystore'
import { makePinLock, storeSeedWallet } from './fixtures'
import { aesDecrypt, aesEncrypt } from '../aes'

const PIN = '123456'
const pinPrompt = (pin: string | null): Prompts => ({ pin: async () => pin })
const failedAttempts = () => h.state.stores.vault.get('vault')?.failedAttempts ?? 0
const lockRecords = () => [...h.state.stores.vault.values()].filter((r) => r.key.startsWith('lock:'))
const clearBackoff = () => h.state.stores.vault.set('vault', { ...h.state.stores.vault.get('vault'), lockedUntil: undefined })

function ok<T>(r: { status: string; value?: T }): T {
  if (r.status !== 'ok') throw new Error(`expected ok, got ${r.status}`)
  return r.value as T
}

beforeEach(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
  w.mode = 'ok'
  w.asserts = 0
  w.registers = 0
})

describe('policy at createLock (AD-28, FR-65)', () => {
  it('refuses a Mainnet lock with no Open Check, with a plain reason, and writes nothing', async () => {
    const result = await createLock({ network: 'mainnet', openCheck: 'none', autoLockMinutes: 5 })
    expect(result).toMatchObject({ status: 'refused', reason: expect.stringMatching(/Mainnet.*Open Check/) })
    expect(lockRecords()).toEqual([])
    expect(h.state.stores.vault.size).toBe(0)
  })

  it('refuses a Mainnet auto-lock under one minute, and writes nothing', async () => {
    const result = await createLock({ network: 'mainnet', openCheck: 'pin', autoLockMinutes: 0.5 }, { pin: PIN })
    expect(result).toMatchObject({ status: 'refused', reason: expect.stringMatching(/at least 1 minute/) })
    expect(h.state.stores.vault.size).toBe(0)
  })

  it('accepts one minute with a PIN or a passkey on Mainnet', async () => {
    expect((await createLock({ network: 'mainnet', openCheck: 'pin', autoLockMinutes: 1 }, { pin: PIN })).status).toBe('ok')
    expect((await createLock({ network: 'mainnet', openCheck: 'passkey', autoLockMinutes: 1 })).status).toBe('ok')
  })

  it('accepts no Open Check and a short auto-lock on Testnet and Devnet', async () => {
    expect((await createLock({ network: 'testnet', openCheck: 'none', autoLockMinutes: 0.5 })).status).toBe('ok')
    expect((await createLock({ network: 'devnet', openCheck: 'none', autoLockMinutes: 1 })).status).toBe('ok')
  })
})

describe('a PIN lock', () => {
  it('creates the App PIN with a verifier when none exists, stores its own derivation inputs, and opens with that PIN', async () => {
    const created = ok(await createLock({ network: 'testnet', openCheck: 'pin', autoLockMinutes: 5 }, { pin: PIN }))
    const record = h.state.stores.vault.get(`lock:${created.id}`)
    expect(record).toMatchObject({ id: created.id, openCheck: 'pin', autoLockMinutes: 5 })
    expect(record.hkdfInfo).toContain(created.id) // stored, per lock — not a shared constant
    expect(h.state.stores.vault.get('vault').pinVerifier).toBeDefined()
    expect(created.key.extractable).toBe(false)

    const opened = ok(await openLock(created.id, 'pin', { pin: PIN }))
    expect(opened.key.extractable).toBe(false)
    expect(h.state.stores.session.get(`session:${created.id}`)).toBeDefined()
    // The key that opened it is the key that was created: ciphertext round-trips.
    const sealed = await aesEncrypt(created.key, 'seedvalue')
    expect(await aesDecrypt(opened.key, sealed.ivB64, sealed.ciphertextB64)).toBe('seedvalue')
  })

  it('proves the App PIN from its verifier alone, and a wrong PIN creates nothing', async () => {
    await makePinLock(PIN)
    // The vault meta holds the App PIN's salt and verifier, the count, and nothing else.
    expect(Object.keys(h.state.stores.vault.get('vault')).sort()).toEqual(['failedAttempts', 'key', 'pinSaltB64', 'pinVerifier'])
    const before = h.state.stores.vault.size
    expect(await createLock({ network: 'testnet', openCheck: 'pin', autoLockMinutes: 5 }, { pin: '000000' })).toEqual({
      status: 'wrong-credential',
      kind: 'pin',
      triesRemaining: 7,
    })
    expect(h.state.stores.vault.size).toBe(before)
    clearBackoff()
    expect((await createLock({ network: 'testnet', openCheck: 'pin', autoLockMinutes: 5 }, { pin: PIN })).status).toBe('ok')
  })

  it('a wrong PIN says how many tries remain and shares ONE counter with every other PIN lock', async () => {
    const created = ok(await createLock({ network: 'testnet', openCheck: 'pin', autoLockMinutes: 5 }, { pin: PIN }))
    const other = await makePinLock(PIN)
    expect(await openLock(created.id, 'pin', { pin: '000000' })).toEqual({ status: 'wrong-credential', kind: 'pin', triesRemaining: 7 })
    clearBackoff()
    expect(await openLock(other.lockId, 'pin', { pin: '000000' })).toEqual({ status: 'wrong-credential', kind: 'pin', triesRemaining: 6 })
    expect(failedAttempts()).toBe(2)
  })

  it('a hard lock blocks every PIN lock', async () => {
    const created = ok(await createLock({ network: 'testnet', openCheck: 'pin', autoLockMinutes: 5 }, { pin: PIN }))
    const other = await makePinLock(PIN)
    h.state.stores.vault.set('vault', { ...h.state.stores.vault.get('vault'), failedAttempts: 8 })
    expect(await openLock(created.id, 'pin', { pin: PIN })).toMatchObject({ status: 'locked-out', hard: true })
    expect(await openLock(other.lockId, 'pin', { pin: PIN })).toMatchObject({ status: 'locked-out', hard: true })
  })
})

describe('a passkey lock', () => {
  it('uses its own credential and PRF salt, both stored, and opens by unwrapping', async () => {
    const created = ok(await createLock({ network: 'testnet', openCheck: 'passkey', autoLockMinutes: 5 }))
    const record = h.state.stores.vault.get(`lock:${created.id}`)
    expect(record).toMatchObject({ openCheck: 'passkey', passkeyCredentialIdB64: 'Y3JlZA==' })
    expect(record.prfSaltB64).toBeTruthy()
    expect(record.hkdfInfo).toContain(created.id)
    const opened = ok(await openLock(created.id, 'passkey'))
    const sealed = await aesEncrypt(created.key, 'seedvalue')
    expect(await aesDecrypt(opened.key, sealed.ivB64, sealed.ciphertextB64)).toBe('seedvalue')
  })

  it('two passkey locks get different PRF salts', async () => {
    const a = ok(await createLock({ network: 'testnet', openCheck: 'passkey', autoLockMinutes: 5 }))
    const b = ok(await createLock({ network: 'testnet', openCheck: 'passkey', autoLockMinutes: 5 }))
    expect(h.state.stores.vault.get(`lock:${a.id}`).prfSaltB64).not.toBe(h.state.stores.vault.get(`lock:${b.id}`).prfSaltB64)
  })

  it('a cancelled prompt is cancelled, leaves the counter alone and the lock closed', async () => {
    const created = ok(await createLock({ network: 'testnet', openCheck: 'passkey', autoLockMinutes: 5 }))
    w.mode = 'cancel'
    expect(await openLock(created.id, 'passkey')).toEqual({ status: 'cancelled' })
    expect(failedAttempts()).toBe(0)
    expect(h.state.stores.session.size).toBe(0)
  })

  it('a cancelled creation writes no lock', async () => {
    w.mode = 'cancel'
    expect(await createLock({ network: 'testnet', openCheck: 'passkey', autoLockMinutes: 5 })).toEqual({ status: 'cancelled' })
    expect(lockRecords()).toEqual([])
  })

  it('a presented passkey that cannot unwrap counts as a wrong credential, as it does today', async () => {
    const created = ok(await createLock({ network: 'testnet', openCheck: 'passkey', autoLockMinutes: 5 }))
    w.mode = 'other-key'
    expect(await openLock(created.id, 'passkey')).toMatchObject({ status: 'wrong-credential', kind: 'passkey' })
    expect(failedAttempts()).toBe(1)
  })

  it('a hard lock never blocks a passkey-only lock, and the passkey does not undo the PIN hard lock', async () => {
    const created = ok(await createLock({ network: 'testnet', openCheck: 'passkey', autoLockMinutes: 5 }))
    h.state.stores.vault.set('vault', { key: 'vault', failedAttempts: 8 })
    expect((await openLock(created.id, 'passkey')).status).toBe('ok')
    expect(failedAttempts()).toBe(8)
  })

  it('an unsupported PRF is reported, not counted', async () => {
    const created = ok(await createLock({ network: 'testnet', openCheck: 'passkey', autoLockMinutes: 5 }))
    w.mode = 'no-prf'
    expect(await openLock(created.id, 'passkey')).toEqual({ status: 'unsupported' })
    expect(failedAttempts()).toBe(0)
  })
})

describe('a lock with no Open Check (Testnet, Devnet)', () => {
  it('opens with no prompt and its key is a non-extractable CryptoKey stored in IndexedDB', async () => {
    const created = ok(await createLock({ network: 'testnet', openCheck: 'none', autoLockMinutes: 5 }))
    expect(created.key.extractable).toBe(false)
    expect(h.state.stores.vault.get(`lock:${created.id}`).openKey).toBeDefined()
    const opened = ok(await openLock(created.id, 'none'))
    expect(opened.key.extractable).toBe(false)
    expect(w.asserts).toBe(0)
    const sealed = await aesEncrypt(created.key, 'seedvalue')
    expect(await aesDecrypt(opened.key, sealed.ivB64, sealed.ciphertextB64)).toBe('seedvalue')
  })

  it('cannot be opened with a PIN or a passkey it does not have', async () => {
    const created = ok(await createLock({ network: 'testnet', openCheck: 'none', autoLockMinutes: 5 }))
    expect(await openLock(created.id, 'pin', { pin: PIN })).toEqual({ status: 'unsupported' })
    expect(await openLock(created.id, 'passkey')).toEqual({ status: 'unsupported' })
  })
})

describe('sessions are per lock', () => {
  it('restores only the lock whose session is valid, and clears an expired entry', async () => {
    const a = ok(await createLock({ network: 'testnet', openCheck: 'pin', autoLockMinutes: 5 }, { pin: PIN }))
    const b = ok(await createLock({ network: 'testnet', openCheck: 'pin', autoLockMinutes: 5 }, { pin: PIN }))
    const c = ok(await createLock({ network: 'testnet', openCheck: 'pin', autoLockMinutes: 5 }, { pin: PIN }))
    ok(await openLock(a.id, 'pin', { pin: PIN }))
    ok(await openLock(b.id, 'pin', { pin: PIN }))
    ok(await openLock(c.id, 'pin', { pin: PIN }))

    await endLockSession(b.id)
    h.state.stores.session.set(`session:${c.id}`, { ...h.state.stores.session.get(`session:${c.id}`), expiresAt: Date.now() - 1 })

    const restored = await restoreOpenLocks()
    expect(restored.map((r) => r.lockId)).toEqual([a.id])
    expect(h.state.stores.session.has(`session:${c.id}`)).toBe(false) // expired entry cleared
    expect(h.state.stores.session.has(`session:${a.id}`)).toBe(true)

    await endAllLockSessions()
    expect(await restoreOpenLocks()).toEqual([])
  })
})

describe('auto-lock minutes live on the lock', () => {
  it('a lock edit changes only that lock, and Mainnet under one minute is refused with a reason', async () => {
    const a = ok(await createLock({ network: 'testnet', openCheck: 'none', autoLockMinutes: 5 }))
    const b = ok(await createLock({ network: 'testnet', openCheck: 'none', autoLockMinutes: 5 }))
    expect(await setAutoLockMinutes(a.id, 15, ['testnet'])).toEqual({ ok: true })
    expect((await getLockInfo(a.id)).autoLockMinutes).toBe(15)
    expect((await getLockInfo(b.id)).autoLockMinutes).toBe(5)

    expect(await setAutoLockMinutes(a.id, 0.5, ['mainnet'])).toMatchObject({ ok: false, reason: expect.stringMatching(/Mainnet/) })
    expect((await getLockInfo(a.id)).autoLockMinutes).toBe(15)
    expect(await setAutoLockMinutes(a.id, 1, ['mainnet'])).toEqual({ ok: true })
  })

  it('keystore.setLockAutoLock reads the networks of the Wallets on the lock', async () => {
    const lock = await makePinLock(PIN)
    await storeSeedWallet('Main', lock, 'mainnet')
    expect(await setLockAutoLock(lock.lockId, 0.5, { prompts: pinPrompt(PIN) })).toMatchObject({ ok: false })
    expect(await setLockAutoLock(lock.lockId, 15, { prompts: pinPrompt(PIN) })).toEqual({ ok: true })
    expect(await openLock(lock.lockId, 'pin', { pin: PIN })).toMatchObject({ status: 'ok', value: { autoLockMinutes: 15 } })
  })
})

describe('persisted expiry and in-flight extends', () => {
  it('restoreOpenLocks carries the persisted expiresAt, so remaining time is not reset', async () => {
    const { lockId } = await makePinLock(PIN)
    ok(await openLock(lockId, 'pin', { pin: PIN }))
    const persisted = Date.now() + 20_000
    h.state.stores.session.set(`session:${lockId}`, { ...h.state.stores.session.get(`session:${lockId}`), expiresAt: persisted })
    const [restored] = await restoreOpenLocks()
    expect(restored.expiresAt).toBe(persisted)
  })

  it('an extend that lands after the lock closed writes nothing, so a refresh cannot restore it', async () => {
    const { lockId } = await makePinLock(PIN)
    ok(await openLock(lockId, 'pin', { pin: PIN }))
    await endLockSession(lockId)
    await extendLockSession(lockId, 5)
    expect(h.state.stores.session.has(`session:${lockId}`)).toBe(false)
    expect(await restoreOpenLocks()).toEqual([])
  })

  it('an extend on an open lock moves its expiry', async () => {
    const { lockId } = await makePinLock(PIN)
    ok(await openLock(lockId, 'pin', { pin: PIN }))
    h.state.stores.session.set(`session:${lockId}`, { ...h.state.stores.session.get(`session:${lockId}`), expiresAt: Date.now() + 1000 })
    await extendLockSession(lockId, 5)
    expect(h.state.stores.session.get(`session:${lockId}`).expiresAt).toBeGreaterThan(Date.now() + 200_000)
  })
})

describe('configuration errors are not wrong PINs', () => {
  it('an App PIN with no verifier is reported and does not count', async () => {
    h.state.stores.vault.set('vault', { key: 'vault', failedAttempts: 0, pinSaltB64: 'AAAAAAAAAAAAAAAAAAAAAA==' })
    expect(await createLock({ network: 'testnet', openCheck: 'pin', autoLockMinutes: 5 }, { pin: PIN })).toEqual({ status: 'unsupported' })
    expect(failedAttempts()).toBe(0)
    expect(lockRecords()).toEqual([])
  })
})

describe('the Open Check kinds', () => {
  it('are pin, passkey and none: there is no `either`', async () => {
    expectTypeOf<OpenCheck>().toEqualTypeOf<'pin' | 'passkey' | 'none'>()
    const pin = ok(await createLock({ network: 'testnet', openCheck: 'pin', autoLockMinutes: 5 }, { pin: PIN }))
    expect(await getLockInfo(pin.id)).toMatchObject({ openCheck: 'pin', pin: true, passkey: false })
    const passkey = ok(await createLock({ network: 'testnet', openCheck: 'passkey', autoLockMinutes: 5 }))
    expect(await getLockInfo(passkey.id)).toMatchObject({ openCheck: 'passkey', pin: false, passkey: true })
  })
})

describe('a lock record with a missing or invalid Open Check', () => {
  it.each([undefined, 'either', 'other'])('reads as missing through every reader when it is %s', async (openCheck) => {
    const lock = ok(await createLock({ network: 'testnet', openCheck: 'none', autoLockMinutes: 5 }))
    const record = h.state.stores.vault.get(`lock:${lock.id}`)
    h.state.stores.vault.set(`lock:${lock.id}`, { ...record, openCheck })
    expect(await getLockRecord(lock.id)).toBeUndefined()
    expect(await listLockRecords()).toEqual([])
    await expect(getLockInfo(lock.id)).rejects.toThrow('Lock not found.')
  })
})

describe('an unknown lock', () => {
  it('is reported as not found', async () => {
    await expect(getLockInfo('missing')).rejects.toThrow('Lock not found.')
    await expect(setAutoLockMinutes('missing', 5, ['testnet'])).rejects.toThrow('Lock not found.')
  })
})
