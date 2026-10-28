import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'

/**
 * Story 12 / AD-39: `importStoredWallet` imports a Seed on its own lock,
 * with the Seed in exactly one form, atomically. `idb` and WebAuthn are
 * the external resources replaced; the cryptography is real.
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


// WebAuthn stand-in: the PRF output is a function of the salt, so a different
// salt (a different purpose) gives a different key, as on a real authenticator.
const w = vi.hoisted(() => ({
  mode: 'ok' as 'ok' | 'cancel' | 'no-prf' | 'other-key',
  supported: true,
  asserts: 0,
  registers: 0,
  salts: [] as string[],
  names: [] as string[],
}))
vi.mock('../webauthn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../webauthn')>()
  return {
    ...actual,
    isWebAuthnSupported: () => w.supported,
    registerPasskey: async (name: string) => {
      w.names.push(name)
      w.registers += 1
      if (w.mode === 'cancel') throw Object.assign(new Error('dismissed'), { name: 'NotAllowedError' })
      return { credentialIdB64: `cred-${w.registers}`, prfSupported: true }
    },
    assertPasskeyAndDeriveBits: async (_id: string, salt: BufferSource = actual.PRF_SALT) => {
      w.asserts += 1
      w.salts.push(Buffer.from(new Uint8Array(salt as ArrayBuffer)).toString('base64'))
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

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { ECDSA, Wallet } from 'xrpl'
import { aesDecrypt } from '../aes'
import { createStoredWallet, importStoredWallet, type ImportStoredWalletInput } from '../keystore'
import * as lockModule from '../lock'

const PIN = '123456'
const SEED = Wallet.generate().seed!
const lockRecords = () => [...h.state.stores.vault.values()].filter((r) => String(r.key).startsWith('lock:'))
const appPin = () => (h.state.stores.vault.get('vault') as { pinSaltB64?: string } | undefined)?.pinSaltB64

const base: ImportStoredWalletInput = {
  label: 'Imported',
  network: 'testnet',
  openCheck: 'pin',
  autoLockMinutes: 5,
  signing: 'standard',
  seed: SEED,
  passkey: 'yes',
}

function ok<T>(r: { status: string; value?: T }): T {
  if (r.status !== 'ok') throw new Error(`expected ok, got ${r.status}: ${JSON.stringify(r)}`)
  return r.value as T
}

const nothingWritten = () => {
  expect(h.state.stores.wallets.size).toBe(0)
  expect(lockRecords()).toEqual([])
  expect(appPin()).toBeUndefined()
}

beforeEach(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
  w.mode = 'ok'
  w.supported = true
  w.asserts = 0
  w.registers = 0
  w.salts = []
  w.names = []
  vi.restoreAllMocks()
})

describe('importStoredWallet', () => {
  it('happy path: own new lock, one Wallet, Seed under the Open Key, none in the result', async () => {
    const result = await importStoredWallet(base, { pin: PIN })
    const { meta, openKey } = ok(result)
    expect(JSON.stringify(result, (_k, v) => (v instanceof CryptoKey ? '[key]' : v))).not.toContain(SEED)
    expect(Object.keys(result.status === 'ok' ? result.value : {}).sort()).toEqual(['meta', 'openKey'])
    expect(h.state.stores.wallets.size).toBe(1)
    expect(lockRecords()).toHaveLength(1)
    const rec = h.state.stores.wallets.get(meta.id)
    expect(rec.seedMethod).toBe('stored')
    expect(rec.address).toBe(Wallet.fromSeed(SEED).address)
    expect(rec.algorithm).toBe('ed25519')
    expect(rec.lockId).toBe(meta.lockId)
    expect(await aesDecrypt(openKey, rec.encryptedSeed.ivB64, rec.encryptedSeed.ciphertextB64)).toBe(SEED)
    expect(JSON.stringify([...h.state.stores.wallets.values(), ...h.state.stores.vault.values()])).not.toContain(SEED)
  })

  it('takes the algorithm from the Seed', async () => {
    const secp = Wallet.generate(ECDSA.secp256k1).seed!
    const { meta } = ok(await importStoredWallet({ ...base, seed: secp }, { pin: PIN }))
    expect(h.state.stores.wallets.get(meta.id).algorithm).toBe('secp256k1')
  })

  it.each(['testnet', 'devnet', 'mainnet'] as const)('refuses Open Check none on %s and writes nothing', async (network) => {
    const result = await importStoredWallet({ ...base, network, openCheck: 'none' }, { pin: PIN })
    expect(result.status).toBe('refused')
    nothingWritten()
  })

  it('applies the Mainnet floor (auto-lock under a minute)', async () => {
    const result = await importStoredWallet({ ...base, network: 'mainnet', autoLockMinutes: 0.5 }, { pin: PIN })
    expect(result.status).toBe('refused')
    nothingWritten()
  })

  it('Mainnet passkey-only without a confirmation callback is refused by policy', async () => {
    const result = await importStoredWallet({ ...base, network: 'mainnet', openCheck: 'passkey' }, {})
    expect(result.status).toBe('refused')
    nothingWritten()
  })

  it('Mainnet passkey-only: the callback returning false cancels and writes nothing; true proceeds', async () => {
    const no = vi.fn(async () => false)
    expect((await importStoredWallet({ ...base, network: 'mainnet', openCheck: 'passkey' }, { confirmWrittenSeed: no })).status).toBe('cancelled')
    expect(no).toHaveBeenCalledWith(SEED)
    nothingWritten()
    const yes = vi.fn(async () => true)
    const { meta } = ok(await importStoredWallet({ ...base, network: 'mainnet', openCheck: 'passkey' }, { confirmWrittenSeed: yes }))
    expect(h.state.stores.wallets.get(meta.id).writtenSeedConfirmedAt).toBeTypeOf('number')
  })

  it('refuses a duplicate address on any network before any prompt, credential or lock write', async () => {
    ok(await importStoredWallet({ ...base, network: 'testnet' }, { pin: PIN }))
    const lockWrites = vi.spyOn(lockModule, 'createLock')
    const confirm = vi.fn(async () => true)
    for (const network of ['testnet', 'devnet', 'mainnet'] as const) {
      const result = await importStoredWallet({ ...base, network, openCheck: 'passkey' }, { confirmWrittenSeed: confirm })
      expect(result.status).toBe('refused')
      expect(JSON.stringify(result)).toContain('Other networks')
      expect(JSON.stringify(result)).not.toContain(SEED)
    }
    expect(confirm).not.toHaveBeenCalled()
    expect(w.registers).toBe(0)
    expect(w.asserts).toBe(0)
    expect(lockWrites).not.toHaveBeenCalled()
    expect(h.state.stores.wallets.size).toBe(1)
    expect(lockRecords()).toHaveLength(1)
  })

  it('a Generated wallet with the same key is a duplicate too', async () => {
    const gen = ok(await createStoredWallet({ label: 'G', network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', autoLockMinutes: 5, signing: 'standard', passkey: 'yes' }, { pin: PIN }))
    const result = await importStoredWallet({ ...base, seed: gen.seed }, { pin: PIN })
    expect(result.status).toBe('refused')
    expect(h.state.stores.wallets.size).toBe(1)
  })

  it('a malformed Seed is refused with a reason that does not contain it', async () => {
    const bad = 'sNotASeed' + 'x'.repeat(10)
    const result = await importStoredWallet({ ...base, seed: bad }, { pin: PIN })
    expect(result.status).toBe('refused')
    expect(JSON.stringify(result)).not.toContain(bad)
    nothingWritten()
  })

  it('a late failure deletes the new lock and the App PIN made for it, rethrowing without the Seed', async () => {
    h.state.failNextPutOn = 'wallets'
    let error: Error | undefined
    try {
      await importStoredWallet(base, { pin: PIN })
    } catch (e) {
      error = e as Error
    }
    expect(error).toBeDefined()
    expect(String(error?.message)).not.toContain(SEED)
    nothingWritten()
  })

  it('honours appPinExpected inside the guard', async () => {
    const result = await importStoredWallet(base, { pin: PIN, appPinExpected: true })
    expect(result.status).toBe('refused')
    nothingWritten()
  })

  it('a PIN check without a PIN is cancelled and writes nothing', async () => {
    expect((await importStoredWallet(base, {})).status).toBe('cancelled')
    nothingWritten()
  })

  it('never imports under an existing lock: each import gets its own', async () => {
    const a = ok(await importStoredWallet(base, { pin: PIN }))
    const b = ok(await importStoredWallet({ ...base, label: 'Two', seed: Wallet.generate().seed! }, { pin: PIN }))
    expect(a.meta.lockId).not.toBe(b.meta.lockId)
  })
})

describe('no chooser-side caller of importAndStoreWallet', () => {
  it.each(['Chooser.tsx', 'WalletCard.tsx', 'AppShell.tsx', 'SettingsScreen.tsx', 'AppSettings.tsx'])('%s', (name) => {
    const found = execSync(`find src -name ${name}`, { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    expect(found.length, `${name} must exist, or the guard checks nothing`).toBeGreaterThan(0)
    for (const f of found) expect(readFileSync(f, 'utf8'), f).not.toContain('importAndStoreWallet')
  })
})
