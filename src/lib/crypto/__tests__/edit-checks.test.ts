import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Story 8 / AD-28, FR-73: `editChecks` changes a Wallet's Open Check, auto-lock,
 * Signing Check and passkeys atomically. `idb` is the external resource replaced;
 * WebAuthn goes through its own substitution seam (AD-12). The cryptography is real.
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
      put: async (s: string, v: any) => {
        if (state.failNextPutOn === s) {
          state.failNextPutOn = null
          throw new Error('put failed')
        }
        state.stores[s].set(v[KEY_PATH[s]], clone(v))
      },
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

import { setUpVaultAuth } from '../auth'
import { LEGACY_LOCK_ID } from '../db'
import { getLockInfo, openLock } from '../lock'
import { aesDecrypt } from '../aes'
import {
  createDerivedWallet,
  createStoredWallet,
  editChecks,
  addNetworkView,
  generateAndStoreWallet,
  listWallets,
  openSigner,
  revealSeed,
  setLockAutoLock,
  type CreateStoredWalletInput,
  type Prompts,
} from '../keystore'
import { resetCredentials, substituteCredentials } from '../webauthn'
import { Wallet } from 'xrpl'

const PIN = '123456'
const pinPrompt = (pin: string | null): Prompts => ({ pin: async () => pin })
const failedAttempts = () => h.state.stores.vault.get('vault')?.failedAttempts ?? 0
const lockRecords = () => [...h.state.stores.vault.values()].filter((r) => String(r.key).startsWith('lock:'))
const snapshot = () => JSON.stringify([[...h.state.stores.wallets.entries()], [...h.state.stores.vault.entries()]])
const recordOf = (id: string) => h.state.stores.wallets.get(id)

// A fake authenticator.
const auth = {
  secrets: new Map<string, Uint8Array>(),
  registers: 0,
  mode: 'ok' as 'ok' | 'cancel' | 'no-prf',
  backupEligible: true as boolean | undefined,
  /** The credential an assertion with no allowCredentials picks. */
  picked: null as string | null,
  creates: [] as any[],
  gets: [] as any[],
  /** An assertion presents this credential instead of the requested one: a wrong passkey. */
  impostor: null as string | null,
}
const b64 = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf as Uint8Array).toString('base64')

async function prfOf(secret: Uint8Array, salt: ArrayBuffer): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', secret as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', key, salt)
}

const fakeCredentials = {
  async create(options: any) {
    auth.creates.push(options)
    if (auth.mode === 'cancel') throw Object.assign(new Error('dismissed'), { name: 'NotAllowedError' })
    auth.registers += 1
    const id = new Uint8Array(16).fill(auth.registers)
    auth.secrets.set(b64(id), crypto.getRandomValues(new Uint8Array(32)))
    const flags = new Uint8Array(37)
    if (auth.backupEligible) flags[32] = 0x08
    return {
      rawId: id.buffer,
      getClientExtensionResults: () => ({ prf: { enabled: true } }),
      response: auth.backupEligible === undefined ? {} : { getAuthenticatorData: () => flags.buffer },
    }
  },
  async get(options: any) {
    auth.gets.push(options)
    if (auth.mode === 'cancel') throw Object.assign(new Error('dismissed'), { name: 'NotAllowedError' })
    const requested = options.publicKey.allowCredentials?.[0]?.id
    const id = auth.impostor ?? (requested ? b64(requested) : auth.picked)
    const secret = id ? auth.secrets.get(id) : undefined
    if (!id || !secret) throw Object.assign(new Error('no credential'), { name: 'NotAllowedError' })
    const salt = options.publicKey.extensions.prf.eval.first
    const rawId = new Uint8Array(Buffer.from(id, 'base64')).buffer
    return {
      rawId,
      getClientExtensionResults: () => (auth.mode === 'no-prf' ? {} : { prf: { results: { first: undefined as unknown } } }),
      _prf: await prfOf(secret, salt.buffer ? salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) : salt),
    }
  },
}
// `getClientExtensionResults` needs the PRF computed above.
const realGet = fakeCredentials.get
fakeCredentials.get = async (options: any) => {
  const result: any = await realGet(options)
  const prf = result._prf
  result.getClientExtensionResults = () => (auth.mode === 'no-prf' ? {} : { prf: { results: { first: prf } } })
  return result
}


const base: CreateStoredWalletInput = {
  label: 'Savings',
  network: 'testnet',
  algorithm: 'ed25519',
  openCheck: 'pin',
  autoLockMinutes: 5,
  signing: 'standard',
  passkey: 'yes',
}

function ok<T>(r: { status: string; value?: T }): T {
  if (r.status !== 'ok') throw new Error(`expected ok, got ${r.status}: ${JSON.stringify(r)}`)
  return r.value as T
}

beforeEach(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  vi.stubGlobal('location', { hostname: 'localhost' })
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
  auth.secrets = new Map()
  auth.registers = 0
  auth.mode = 'ok'
  auth.backupEligible = true
  auth.picked = null
  auth.creates = []
  auth.gets = []
  auth.impostor = null
  substituteCredentials(fakeCredentials as any)
})
afterEach(() => {
  resetCredentials()
  vi.unstubAllGlobals()
})

/** A Stored Wallet made the way the creation flow makes it, and its Seed. */
async function made(input: Partial<CreateStoredWalletInput> = {}) {
  const created = ok(await createStoredWallet({ ...base, ...input }, { pin: PIN, confirmWrittenSeed: async () => true }))
  return created
}

/** Prompts that count how often the PIN is asked. */
function counting(pin: string | null = PIN) {
  const calls = { pin: 0 }
  const prompts: Prompts = { pin: async () => (calls.pin++, pin) }
  return { calls, prompts }
}

describe('adding a Signing Check', () => {
  it('re-passes the Open Check, seals the Seed under a passkey, deletes the old ciphertext, address unchanged', async () => {
    const { meta, seed } = await made()
    const before = recordOf(meta.id)
    expect(before.encryptedSeed).toBeDefined()
    const { calls, prompts } = counting()
    const result = ok(await editChecks(meta.id, { signing: { kind: 'passkey' } }, { prompts }))
    expect(result.changed).toBe(true)
    expect(calls.pin).toBe(1) // the Open Check, re-passed
    const after = recordOf(meta.id)
    expect(after.address).toBe(meta.address)
    expect(after.encryptedSeed).toBeUndefined()
    expect(after.sealedSeed).toBeDefined()
    expect(after.signing).toMatchObject({ kind: 'passkey', credentialIdB64: expect.any(String), prfSaltB64: expect.any(String), hkdfInfo: expect.stringContaining(meta.id) })
    expect(after.signingCheck).toBe('passkey')
    expect(after.rev).toBe(1)
    expect(after.lockId).toBe(meta.lockId) // no new lock for a Signing Check edit
    expect(JSON.stringify([...h.state.stores.wallets.values(), ...h.state.stores.vault.values()])).not.toContain(seed)
    // The session key cannot open it, the passkey signs.
    const opened = ok(await openLock(meta.lockId, 'pin', { pin: PIN }))
    expect((await openSigner(meta.id, { openKey: opened.key, prompts })).status).toBe('ok')
    expect(await revealSeed(meta.id, { openKey: opened.key, prompts })).toEqual({ status: 'ok', value: seed })
  })

  it('adds a PIN Signing Check, own info string, and the PIN signs', async () => {
    const { meta, seed } = await made()
    ok(await editChecks(meta.id, { signing: { kind: 'pin' } }, { prompts: pinPrompt(PIN), pin: PIN }))
    const after = recordOf(meta.id)
    expect(after.signing.kind).toBe('pin')
    expect(after.signing.hkdfInfo).not.toBe(`xrpl-bench:sign:${meta.id}:v1`) // random per edit
    expect(ok(await revealSeed(meta.id, { openKey: null, prompts: pinPrompt(PIN) }))).toBe(seed)
  })

  it('a wrong current PIN counts and writes nothing; a cancel never counts', async () => {
    const { meta } = await made()
    const before = snapshot()
    expect(await editChecks(meta.id, { signing: { kind: 'passkey' } }, { prompts: pinPrompt('000000') })).toMatchObject({ status: 'wrong-credential', kind: 'pin' })
    expect(failedAttempts()).toBe(1)
    expect(snapshot().replace(/"failedAttempts":1/, '"failedAttempts":0')).toBe(before)
    expect(await editChecks(meta.id, { signing: { kind: 'passkey' } }, { prompts: pinPrompt(null) })).toEqual({ status: 'cancelled' })
    expect(failedAttempts()).toBe(1)
  })

  it('a cancelled passkey prompt leaves the Wallet exactly as it was', async () => {
    const { meta, seed } = await made()
    const before = snapshot()
    auth.mode = 'cancel'
    expect(await editChecks(meta.id, { signing: { kind: 'passkey' } }, { prompts: pinPrompt(PIN) })).toEqual({ status: 'cancelled' })
    expect(snapshot()).toBe(before)
    auth.mode = 'ok'
    const opened = ok(await openLock(meta.lockId, 'pin', { pin: PIN }))
    expect(await aesDecrypt(opened.key, recordOf(meta.id).encryptedSeed.ivB64, recordOf(meta.id).encryptedSeed.ciphertextB64)).toBe(seed)
  })

  it('a device without PRF is unsupported and writes nothing', async () => {
    const { meta } = await made()
    const before = snapshot()
    auth.mode = 'no-prf'
    expect((await editChecks(meta.id, { signing: { kind: 'passkey' } }, { prompts: pinPrompt(PIN) })).status).toBe('unsupported')
    expect(snapshot()).toBe(before)
  })
})

describe('removing a Signing Check', () => {
  it('passes the Signing Check, encrypts under the Open Key and deletes the seal', async () => {
    const { meta, seed } = await made({ signing: 'passkey' })
    expect(recordOf(meta.id).sealedSeed).toBeDefined()
    const getsBefore = auth.gets.length
    const { calls, prompts } = counting()
    ok(await editChecks(meta.id, { signing: { kind: 'standard' } }, { prompts }))
    expect(auth.gets.length).toBeGreaterThan(getsBefore) // the passkey Signing Check
    expect(calls.pin).toBe(1) // the Open Key it is re-encrypted under is proven
    const after = recordOf(meta.id)
    expect(after.sealedSeed).toBeUndefined()
    expect(after.signing).toBeUndefined()
    expect(after.signingCheck).toBe('standard')
    const opened = ok(await openLock(meta.lockId, 'pin', { pin: PIN }))
    expect(await aesDecrypt(opened.key, after.encryptedSeed.ivB64, after.encryptedSeed.ciphertextB64)).toBe(seed)
    expect(Wallet.fromSeed(seed).address).toBe(meta.address)
  })

  it('a wrong passkey at the Signing Check changes nothing', async () => {
    const { meta } = await made({ signing: 'passkey' })
    const before = snapshot()
    auth.impostor = Buffer.from(new Uint8Array(16).fill(99)).toString('base64')
    auth.secrets.set(auth.impostor, crypto.getRandomValues(new Uint8Array(32)))
    expect((await editChecks(meta.id, { signing: { kind: 'standard' } }, { prompts: pinPrompt(PIN) })).status).toBe('wrong-credential')
    expect(snapshot().replace(/"failedAttempts":1/, '"failedAttempts":0')).toBe(before)
  })

  it('a new passkey on the same kind replaces the credential, salt and info', async () => {
    const { meta, seed } = await made({ signing: 'passkey' })
    const old = recordOf(meta.id).signing
    ok(await editChecks(meta.id, { signing: { kind: 'passkey', passkey: 'new' } }, { prompts: pinPrompt(null) }))
    const fresh = recordOf(meta.id).signing
    expect(fresh.credentialIdB64).not.toBe(old.credentialIdB64)
    expect(fresh.prfSaltB64).not.toBe(old.prfSaltB64)
    expect(fresh.hkdfInfo).not.toBe(old.hkdfInfo)
    expect(ok(await revealSeed(meta.id, { openKey: null, prompts: pinPrompt(null) }))).toBe(seed)
  })

  it('an existing passkey can be picked for the new Signing Check', async () => {
    const { meta, seed } = await made({ signing: 'passkey' })
    auth.picked = recordOf(meta.id).signing.credentialIdB64
    ok(await editChecks(meta.id, { signing: { kind: 'pin' } }, { prompts: pinPrompt(null), pin: PIN }))
    ok(await editChecks(meta.id, { signing: { kind: 'passkey', passkey: 'existing' } }, { prompts: pinPrompt(PIN) }))
    expect(recordOf(meta.id).signing.credentialIdB64).toBe(auth.picked)
    expect(ok(await revealSeed(meta.id, { openKey: null, prompts: pinPrompt(null) }))).toBe(seed)
  })
})

describe('changing the Open Check', () => {
  it('moves the Seed to a new lock: old lock deleted, new one opens, Seed re-encrypted, address unchanged', async () => {
    const { meta, seed } = await made()
    const oldLock = meta.lockId
    const { calls, prompts } = counting()
    const result = ok(await editChecks(meta.id, { openCheck: { kind: 'passkey' } }, { prompts }))
    expect(calls.pin).toBe(1)
    expect(result.previousLockId).toBe(oldLock)
    expect(result.previousLockRemoved).toBe(true)
    expect(result.meta.lockId).not.toBe(oldLock)
    const after = recordOf(meta.id)
    expect(after.lockId).toBe(result.meta.lockId)
    expect(after.openCheck).toBe('passkey')
    expect(h.state.stores.vault.has(`lock:${oldLock}`)).toBe(false)
    expect(lockRecords().map((r) => r.id)).toEqual([result.meta.lockId])
    expect(await aesDecrypt(result.openKey!, after.encryptedSeed.ivB64, after.encryptedSeed.ciphertextB64)).toBe(seed)
    // It opens by the passkey now, and the PIN lock is gone.
    expect((await openLock(result.meta.lockId, 'passkey')).status).toBe('ok')
    expect(after.address).toBe(meta.address)
    expect((await getLockInfo(result.meta.lockId)).autoLockMinutes).toBe(5)
  })

  it('from a passkey Open Check to none (Testnet) and a PIN back', async () => {
    const { meta, seed } = await made({ openCheck: 'passkey' })
    const toNone = ok(await editChecks(meta.id, { openCheck: { kind: 'none' } }, { prompts: pinPrompt(null) }))
    expect(recordOf(meta.id).openCheck).toBe('none')
    expect(await aesDecrypt(toNone.openKey!, recordOf(meta.id).encryptedSeed.ivB64, recordOf(meta.id).encryptedSeed.ciphertextB64)).toBe(seed)
    const { calls, prompts } = counting()
    const toPin = ok(await editChecks(meta.id, { openCheck: { kind: 'pin' } }, { prompts, pin: PIN }))
    expect(calls.pin).toBe(0) // `none` asks nothing
    expect(await aesDecrypt(toPin.openKey!, recordOf(meta.id).encryptedSeed.ivB64, recordOf(meta.id).encryptedSeed.ciphertextB64)).toBe(seed)
  })

  it('a wrong PIN counts, a cancel does not, and nothing changes either way', async () => {
    const { meta } = await made()
    const before = snapshot()
    expect((await editChecks(meta.id, { openCheck: { kind: 'passkey' } }, { prompts: pinPrompt('999999') })).status).toBe('wrong-credential')
    expect(failedAttempts()).toBe(1)
    expect((await editChecks(meta.id, { openCheck: { kind: 'passkey' } }, { prompts: pinPrompt(null) })).status).toBe('cancelled')
    expect(failedAttempts()).toBe(1)
    expect(snapshot().replace(/"failedAttempts":1/, '"failedAttempts":0')).toBe(before)
  })

  it('a sealed Wallet keeps its seal untouched when only its Open Check changes', async () => {
    const { meta, seed } = await made({ signing: 'pin' })
    const seal = recordOf(meta.id).sealedSeed
    const signing = recordOf(meta.id).signing
    const result = ok(await editChecks(meta.id, { openCheck: { kind: 'none' } }, { prompts: pinPrompt(PIN) }))
    expect(recordOf(meta.id).sealedSeed).toEqual(seal)
    expect(recordOf(meta.id).signing).toEqual(signing)
    expect(recordOf(meta.id).encryptedSeed).toBeUndefined()
    expect(result.openKey).toBeDefined()
    expect(ok(await revealSeed(meta.id, { openKey: result.openKey!, prompts: pinPrompt(PIN) }))).toBe(seed)
  })

  it('a new passkey on the same Open Check kind makes a new lock with its own salt', async () => {
    const { meta } = await made({ openCheck: 'passkey' })
    const old = lockRecords()[0]
    const result = ok(await editChecks(meta.id, { openCheck: { kind: 'passkey', passkey: 'new' } }, { prompts: pinPrompt(null) }))
    const fresh = lockRecords()[0]
    expect(fresh.id).not.toBe(old.id)
    expect(fresh.passkeyCredentialIdB64).not.toBe(old.passkeyCredentialIdB64)
    expect(fresh.prfSaltB64).not.toBe(old.prfSaltB64)
    expect(result.meta.lockId).toBe(fresh.id)
  })
})

describe('a Wallet on the legacy lock', () => {
  it('moves to its own lock, its old encryptedSeed goes, and the other legacy Wallets still open', async () => {
    const key = await setUpVaultAuth('tester', PIN)
    const a = await generateAndStoreWallet('A', key, 'testnet')
    const b = await generateAndStoreWallet('B', key, 'testnet')
    const aSeed = ok(await revealSeed(a.meta.id, { openKey: key, prompts: pinPrompt(PIN) }))
    auth.mode = 'ok'
    const result = ok(await editChecks(a.meta.id, { openCheck: { kind: 'pin' } }, { prompts: pinPrompt(PIN), pin: PIN }))
    expect(result.previousLockId).toBe(LEGACY_LOCK_ID)
    expect(result.previousLockRemoved).toBe(false)
    expect(result.meta.lockId).not.toBe(LEGACY_LOCK_ID)
    const moved = recordOf(a.meta.id)
    expect(moved.encryptedSeed.ciphertextB64).not.toBe(undefined)
    expect(await aesDecrypt(result.openKey!, moved.encryptedSeed.ivB64, moved.encryptedSeed.ciphertextB64)).toBe(aSeed)
    // The legacy lock and the other Wallet are as they were.
    expect(recordOf(b.meta.id).lockId ?? LEGACY_LOCK_ID).toBe(LEGACY_LOCK_ID)
    expect((await openSigner(b.meta.id, { openKey: key, prompts: pinPrompt(null) })).status).toBe('ok')
    expect((await openLock(LEGACY_LOCK_ID, 'pin', { pin: PIN })).status).toBe('ok')
    expect(h.state.stores.vault.has(`lock:${LEGACY_LOCK_ID}`)).toBe(true)
  })

  it('adding a Signing Check deletes the legacy encryptedSeed (one form only)', async () => {
    const key = await setUpVaultAuth('tester', PIN)
    const a = await generateAndStoreWallet('A', key, 'testnet')
    const b = await generateAndStoreWallet('B', key, 'testnet')
    const seed = ok(await revealSeed(a.meta.id, { openKey: key, prompts: pinPrompt(PIN) }))
    ok(await editChecks(a.meta.id, { signing: { kind: 'pin' } }, { prompts: pinPrompt(PIN), pin: PIN }))
    expect(recordOf(a.meta.id).encryptedSeed).toBeUndefined()
    expect(recordOf(a.meta.id).sealedSeed).toBeDefined()
    expect(ok(await revealSeed(a.meta.id, { openKey: key, prompts: pinPrompt(PIN) }))).toBe(seed)
    expect((await openSigner(b.meta.id, { openKey: key, prompts: pinPrompt(null) })).status).toBe('ok')
  })

  it('auto-lock on the shared lock applies to every Wallet on it, and Mainnet is the floor', async () => {
    const key = await setUpVaultAuth('tester', PIN)
    await generateAndStoreWallet('Test', key, 'testnet')
    await generateAndStoreWallet('Main', key, 'mainnet')
    expect(await setLockAutoLock(LEGACY_LOCK_ID, 0.5, { prompts: pinPrompt(PIN) })).toMatchObject({ ok: false, reason: expect.stringMatching(/Mainnet/) })
    expect(await setLockAutoLock(LEGACY_LOCK_ID, 15, { prompts: pinPrompt(PIN) })).toEqual({ ok: true })
    expect((await getLockInfo(LEGACY_LOCK_ID)).autoLockMinutes).toBe(15)
  })
})

describe('the policy decides, and a refusal writes nothing', () => {
  it('Mainnet: no Open Check, and auto-lock under one minute, are refused with the reason', async () => {
    const { meta } = await made({ network: 'mainnet', openCheck: 'pin', signing: 'pin' })
    const before = snapshot()
    expect(await editChecks(meta.id, { openCheck: { kind: 'none' } }, { prompts: pinPrompt(PIN) })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/Mainnet wallet needs an Open Check/) })
    expect(await editChecks(meta.id, { autoLockMinutes: 0.5 }, { prompts: pinPrompt(PIN) })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/at least 1 minute/) })
    expect(snapshot()).toBe(before)
  })

  it('a refusal comes before any prompt', async () => {
    const { meta } = await made({ network: 'mainnet', openCheck: 'pin', signing: 'pin' })
    const { calls, prompts } = counting()
    await editChecks(meta.id, { openCheck: { kind: 'none' } }, { prompts })
    expect(calls.pin).toBe(0)
  })

  it('no PRF on the device refuses a passkey check', async () => {
    const { meta } = await made()
    const before = snapshot()
    expect(await editChecks(meta.id, { signing: { kind: 'passkey' } }, { prompts: pinPrompt(PIN), passkey: 'no' })).toMatchObject({ status: 'refused' })
    expect(snapshot()).toBe(before)
  })

  it('the Seed Method rule is the policy: a Standard-or-PIN Signing Check cannot be given to a Passkey-Derived Wallet', async () => {
    const derived = ok(await createDerivedWallet({ label: 'D', network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', autoLockMinutes: 5, passkeyChoice: 'new', passkey: 'yes' }, { pin: PIN }))
    const before = snapshot()
    expect(await editChecks(derived.meta.id, { signing: { kind: 'pin' } }, { prompts: pinPrompt(PIN), pin: PIN })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/Passkey-Derived/) })
    expect(await editChecks(derived.meta.id, { signing: { kind: 'passkey', passkey: 'new' } }, { prompts: pinPrompt(PIN) })).toMatchObject({ status: 'refused' })
    expect(snapshot()).toBe(before)
  })
})

describe('a Passkey-Derived Wallet', () => {
  it('can change its Open Check; the address and the derived Seed are unchanged', async () => {
    const derived = ok(await createDerivedWallet({ label: 'D', network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', autoLockMinutes: 5, passkeyChoice: 'new', passkey: 'yes' }, { pin: PIN }))
    const seedBefore = ok(await revealSeed(derived.meta.id, { openKey: null, prompts: pinPrompt(null) }))
    const result = ok(await editChecks(derived.meta.id, { openCheck: { kind: 'none' } }, { prompts: pinPrompt(PIN) }))
    expect(recordOf(derived.meta.id).openCheck).toBe('none')
    expect(recordOf(derived.meta.id).address).toBe(derived.meta.address)
    expect(recordOf(derived.meta.id).encryptedSeed).toBeUndefined()
    expect(result.previousLockRemoved).toBe(true)
    expect(ok(await revealSeed(derived.meta.id, { openKey: null, prompts: pinPrompt(null) }))).toBe(seedBefore)
  })
})

describe('FR-72 after an edit', () => {
  it('asks for the written Seed first when a Mainnet result is passkey-only; stores the time; cancel writes nothing', async () => {
    const { meta, seed } = await made({ network: 'mainnet', openCheck: 'pin', signing: 'pin' })
    expect(recordOf(meta.id).writtenSeedConfirmedAt).toBeUndefined()
    const before = snapshot()
    const asked: string[] = []
    const registersBefore = auth.registers
    expect(
      await editChecks(meta.id, { openCheck: { kind: 'passkey' }, signing: { kind: 'passkey' } }, { prompts: pinPrompt(PIN), confirmWrittenSeed: async (s) => (asked.push(s), false) }),
    ).toEqual({ status: 'cancelled' })
    expect(asked).toEqual([seed])
    expect(auth.registers).toBe(registersBefore) // asked before any credential was made
    expect(snapshot()).toBe(before)

    const result = ok(await editChecks(meta.id, { openCheck: { kind: 'passkey' }, signing: { kind: 'passkey' } }, { prompts: pinPrompt(PIN), confirmWrittenSeed: async () => true }))
    expect(recordOf(meta.id).writtenSeedConfirmedAt).toEqual(expect.any(Number))
    expect(result.meta.writtenSeedConfirmedAt).toBeDefined()
  })

  it('without a confirmation callback the result is refused', async () => {
    const { meta } = await made({ network: 'mainnet', openCheck: 'pin', signing: 'pin' })
    const before = snapshot()
    expect(await editChecks(meta.id, { openCheck: { kind: 'passkey' }, signing: { kind: 'passkey' } }, { prompts: pinPrompt(PIN) })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/written, confirmed Seed/) })
    expect(snapshot()).toBe(before)
  })

  it('a Wallet already confirmed is not asked again', async () => {
    const { meta } = await made({ network: 'mainnet', openCheck: 'passkey', signing: 'passkey' })
    expect(recordOf(meta.id).writtenSeedConfirmedAt).toBeDefined()
    let asked = 0
    ok(await editChecks(meta.id, { autoLockMinutes: 15 }, { prompts: pinPrompt(PIN), confirmWrittenSeed: async () => (asked++, true) }))
    expect(asked).toBe(0)
  })
})

describe('auto-lock', () => {
  it('re-passes the Open Check, changes this lock only, and does not move the Wallet', async () => {
    const a = await made()
    const b = await made()
    const { calls, prompts } = counting()
    const result = ok(await editChecks(a.meta.id, { autoLockMinutes: 15 }, { prompts }))
    expect(calls.pin).toBe(1)
    expect(result.openKey).toBeUndefined()
    expect((await getLockInfo(a.meta.lockId)).autoLockMinutes).toBe(15)
    expect((await getLockInfo(b.meta.lockId)).autoLockMinutes).toBe(5)
    expect(recordOf(a.meta.id).lockId).toBe(a.meta.lockId)
    expect(recordOf(a.meta.id).rev).toBe(1)
  })

  it('a wrong PIN leaves the window as it was', async () => {
    const a = await made()
    expect((await editChecks(a.meta.id, { autoLockMinutes: 15 }, { prompts: pinPrompt('000000') })).status).toBe('wrong-credential')
    expect((await getLockInfo(a.meta.lockId)).autoLockMinutes).toBe(5)
  })

  it('with no Open Check nothing is asked', async () => {
    const a = await made({ openCheck: 'none' })
    const { calls, prompts } = counting()
    ok(await editChecks(a.meta.id, { autoLockMinutes: 30 }, { prompts }))
    expect(calls.pin).toBe(0)
    expect((await getLockInfo(a.meta.lockId)).autoLockMinutes).toBe(30)
  })
})

describe('nothing changes, nothing is asked', () => {
  it('the same values: no prompt, no write', async () => {
    const { meta } = await made()
    const before = snapshot()
    const { calls, prompts } = counting()
    const result = ok(await editChecks(meta.id, { openCheck: { kind: 'pin' }, autoLockMinutes: 5, signing: { kind: 'standard' } }, { prompts }))
    expect(result.changed).toBe(false)
    expect(calls.pin).toBe(0)
    expect(snapshot()).toBe(before)
  })
})

describe('atomic and conflict-safe', () => {
  it('a concurrent change between the read and the commit aborts with a plain message', async () => {
    const { meta } = await made()
    const prompts: Prompts = {
      pin: async () => {
        // Another tab edits the record while the PIN prompt is open.
        const row = h.state.stores.wallets.get(meta.id)
        h.state.stores.wallets.set(meta.id, { ...row, rev: 7 })
        return PIN
      },
    }
    const result = await editChecks(meta.id, { signing: { kind: 'passkey' } }, { prompts })
    expect(result).toMatchObject({ status: 'refused', reason: expect.stringMatching(/changed while/) })
    expect(recordOf(meta.id).rev).toBe(7)
    expect(recordOf(meta.id).encryptedSeed).toBeDefined()
  })

  it('a changed ciphertext (another edit sealed it) aborts', async () => {
    const { meta } = await made()
    const prompts: Prompts = {
      pin: async () => {
        const row = h.state.stores.wallets.get(meta.id)
        h.state.stores.wallets.set(meta.id, { ...row, encryptedSeed: { ...row.encryptedSeed, ciphertextB64: 'AAAA' } })
        return PIN
      },
    }
    expect((await editChecks(meta.id, { openCheck: { kind: 'none' } }, { prompts })).status).toBe('refused')
    expect(lockRecords()).toHaveLength(1)
  })

  it('a changed lock (its auto-lock edited meanwhile) aborts', async () => {
    const { meta } = await made()
    const prompts: Prompts = {
      pin: async () => {
        const lock = h.state.stores.vault.get(`lock:${meta.lockId}`)
        h.state.stores.vault.set(`lock:${meta.lockId}`, { ...lock, autoLockMinutes: 30 })
        return PIN
      },
    }
    expect((await editChecks(meta.id, { openCheck: { kind: 'none' } }, { prompts })).status).toBe('refused')
    expect((await getLockInfo(meta.lockId)).autoLockMinutes).toBe(30)
    expect(lockRecords()).toHaveLength(1)
  })

  it.each([
    ['the Wallet write', 'wallets'],
    ['the new lock write', 'vault'],
  ])('a failure at %s leaves the old Wallet opening and signing', async (_name, store) => {
    const { meta, seed } = await made()
    const before = snapshot()
    h.state.failNextPutOn = store
    await expect(editChecks(meta.id, { openCheck: { kind: 'passkey' } }, { prompts: pinPrompt(PIN) })).rejects.toThrow()
    expect(snapshot()).toBe(before)
    const opened = ok(await openLock(meta.lockId, 'pin', { pin: PIN }))
    expect((await openSigner(meta.id, { openKey: opened.key, prompts: pinPrompt(null) })).status).toBe('ok')
    expect(ok(await revealSeed(meta.id, { openKey: opened.key, prompts: pinPrompt(PIN) }))).toBe(seed)
  })

  it('a failure while building the credential leaves everything as it was, and discards a fresh App PIN', async () => {
    const { meta } = await made({ openCheck: 'none' })
    const before = snapshot()
    auth.mode = 'cancel'
    expect(await editChecks(meta.id, { signing: { kind: 'passkey' } }, { prompts: pinPrompt(null) })).toEqual({ status: 'cancelled' })
    // (A bare vault meta may be written by the App PIN clean-up; it holds nothing.)
    expect(snapshot().replace(',["vault",{"key":"vault","failedAttempts":0}]', '')).toBe(before)
    // An App PIN made by an edit that then fails does not linger.
    expect(h.state.stores.vault.get('vault')?.pinSaltB64).toBeUndefined()
    const withPin = await editChecks(meta.id, { signing: { kind: 'pin' } }, { prompts: pinPrompt(null), pin: PIN })
    expect(withPin.status).toBe('ok')
    expect(h.state.stores.vault.get('vault')?.pinSaltB64).toBeDefined()
  })

  it('leaves the session untouched: it is the caller that swaps locks', async () => {
    const { meta } = await made()
    h.state.stores.session.set('session:' + meta.lockId, { key: 'session:' + meta.lockId, masterKey: 'x', expiresAt: Date.now() + 1e6 })
    const sessions = JSON.stringify([...h.state.stores.session.entries()])
    ok(await editChecks(meta.id, { openCheck: { kind: 'none' } }, { prompts: pinPrompt(PIN) }))
    expect(JSON.stringify([...h.state.stores.session.entries()])).toBe(sessions)
  })
})

describe('what is stored', () => {
  it('never holds a typed PIN, a Seed or a key after any edit', async () => {
    const { meta, seed } = await made()
    ok(await editChecks(meta.id, { signing: { kind: 'pin' }, openCheck: { kind: 'passkey' } }, { prompts: pinPrompt(PIN), pin: PIN }))
    const everything = JSON.stringify([...h.state.stores.wallets.values(), ...h.state.stores.vault.values(), ...h.state.stores.session.values()])
    expect(everything).not.toContain(seed)
    expect(everything).not.toContain(PIN)
    expect((await listWallets()).find((m) => m.id === meta.id)).toMatchObject({ openCheck: 'passkey', signingCheck: 'pin', address: meta.address })
  })
})

describe('review fixes', () => {
  it('an auto-lock-only edit is judged on the floor alone: a Mainnet passkey-only Wallet never confirmed still edits, and PRF "no" does not refuse it', async () => {
    const { meta } = await made({ openCheck: 'passkey', signing: 'passkey' })
    const main = await addNetworkView(meta.id, 'mainnet')
    expect(recordOf(meta.id).writtenSeedConfirmedAt).toBeUndefined()
    let asked = 0
    const result = ok(await editChecks(main.id, { autoLockMinutes: 15 }, { prompts: pinPrompt(null), passkey: 'no', confirmWrittenSeed: async () => (asked++, true) }))
    expect(result.changed).toBe(true)
    expect(asked).toBe(0)
    expect((await getLockInfo(meta.lockId)).autoLockMinutes).toBe(15)
    // The floor still applies.
    expect(await editChecks(main.id, { autoLockMinutes: 0.5 }, { prompts: pinPrompt(null) })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/Mainnet/) })
  })

  it('an existing passkey for the Open Check: the new lock uses the picked credential and registers nothing', async () => {
    const { meta } = await made({ signing: 'passkey' })
    const picked = recordOf(meta.id).signing.credentialIdB64
    auth.picked = picked
    const registers = auth.registers
    const result = ok(await editChecks(meta.id, { openCheck: { kind: 'passkey', passkey: 'existing' } }, { prompts: pinPrompt(PIN) }))
    expect(auth.registers).toBe(registers)
    expect(lockRecords().map((r) => r.passkeyCredentialIdB64)).toEqual([picked])
    expect((await openLock(result.meta.lockId, 'passkey')).status).toBe('ok')
  })

  it('a Testnet-primary Seed with a Mainnet view: no Open Check and a sub-minute lock are refused, and a passkey-only result asks for the written Seed', async () => {
    const { meta, seed } = await made()
    await addNetworkView(meta.id, 'mainnet')
    const before = snapshot()
    expect(await editChecks(meta.id, { openCheck: { kind: 'none' } }, { prompts: pinPrompt(PIN) })).toMatchObject({ status: 'refused' })
    expect(await editChecks(meta.id, { autoLockMinutes: 0.5 }, { prompts: pinPrompt(PIN) })).toMatchObject({ status: 'refused' })
    expect(snapshot()).toBe(before)
    const asked: string[] = []
    ok(await editChecks(meta.id, { openCheck: { kind: 'passkey' } }, { prompts: pinPrompt(PIN), confirmWrittenSeed: async (s) => (asked.push(s), true) }))
    expect(asked).toEqual([seed])
  })

  it('a throw after the commit keeps the App PIN the new seal depends on', async () => {
    const { meta, seed } = await made({ openCheck: 'passkey' })
    expect(h.state.stores.vault.get('vault')?.pinSaltB64).toBeUndefined()
    const realGet = fakeCredentials.get
    // While the Open Check is re-passed (before the commit) the record loses its view,
    // so that looking the Wallet up after the commit throws.
    fakeCredentials.get = async (options: any) => {
      const row = h.state.stores.wallets.get(meta.id)
      h.state.stores.wallets.set(meta.id, { ...row, views: [{ walletId: 'other', network: 'testnet' }] })
      return realGet(options)
    }
    await expect(editChecks(meta.id, { signing: { kind: 'pin' } }, { prompts: pinPrompt(null), pin: PIN })).rejects.toThrow()
    fakeCredentials.get = realGet
    expect(recordOf(meta.id).signing.kind).toBe('pin')
    expect(h.state.stores.vault.get('vault')?.pinSaltB64).toBeDefined()
    expect(ok(await revealSeed('other', { openKey: null, prompts: pinPrompt(PIN) }))).toBe(seed)
  })
})

describe('follow-up review: combined and shared-lock edits', () => {
  it.each(['pin', 'passkey'] as const)(
    'a %s-sealed Wallet going back to Standard while the Open Check changes is encrypted under the NEW lock',
    async (sealedWith) => {
      const { meta, seed } = await made({ signing: sealedWith })
      const oldLock = meta.lockId
      const result = ok(
        await editChecks(meta.id, { signing: { kind: 'standard' }, openCheck: { kind: 'passkey' } }, { prompts: pinPrompt(PIN), pin: PIN }),
      )
      const after = recordOf(meta.id)
      expect(after.sealedSeed).toBeUndefined()
      expect(after.signing).toBeUndefined()
      expect(after.signingCheck).toBe('standard')
      expect(h.state.stores.vault.has(`lock:${oldLock}`)).toBe(false)
      expect(await aesDecrypt(result.openKey!, after.encryptedSeed.ivB64, after.encryptedSeed.ciphertextB64)).toBe(seed)
      expect(Wallet.fromSeed(seed).address).toBe(meta.address)
    },
  )

  it('an Open Check edit never deletes a non-legacy lock another Wallet still uses', async () => {
    const { meta } = await made()
    const key = ok(await openLock(meta.lockId, 'pin', { pin: PIN })).key
    const other = await generateAndStoreWallet('Other', key, 'testnet', meta.lockId)
    const result = ok(await editChecks(meta.id, { openCheck: { kind: 'passkey' } }, { prompts: pinPrompt(PIN) }))
    expect(result.previousLockRemoved).toBe(false)
    expect(h.state.stores.vault.has(`lock:${meta.lockId}`)).toBe(true)
    expect(recordOf(other.meta.id).lockId).toBe(meta.lockId)
    expect((await openSigner(other.meta.id, { openKey: key, prompts: pinPrompt(null) })).status).toBe('ok')
  })
})
