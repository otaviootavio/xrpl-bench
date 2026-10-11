
import { webcrypto } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Story 6 / AD-24: a Passkey-Derived Seed Wallet. `idb` is the external resource
 * replaced; WebAuthn goes through its own substitution seam (AD-12), with a fake
 * authenticator whose PRF output is a function of (credential secret, salt). The
 * cryptography is real.
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
import { openLock } from '../lock'
import { seedSalt } from '../derive'
import {
  createDerivedWallet,
  addNetworkView,
  createStoredWallet,
  listWallets,
  openSigner,
  restorePasskeyWallet,
  revealSeed,
  sealSeedUnderSigningCheck,
  type CreateDerivedWalletInput,
  type Prompts,
} from '../keystore'
import { getRpId, resetCredentials, substituteCredentials } from '../webauthn'
import { Wallet } from 'xrpl'

const PIN = '123456'
const prompts: Prompts = { pin: async () => null }
const failedAttempts = () => h.state.stores.vault.get('vault')?.failedAttempts ?? 0
const lockRecords = () => [...h.state.stores.vault.values()].filter((r) => String(r.key).startsWith('lock:'))
const emptyVault = () => {
  expect(h.state.stores.wallets.size).toBe(0)
  expect(lockRecords()).toEqual([])
  expect(h.state.stores.vault.get('vault')?.pinSaltB64).toBeUndefined()
}

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

const base: CreateDerivedWalletInput = {
  label: 'Spending',
  network: 'testnet',
  algorithm: 'ed25519',
  openCheck: 'pin',
  autoLockMinutes: 5,
  passkeyChoice: 'new',
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

const recordOf = (id: string) => h.state.stores.wallets.get(id)

describe('a new passkey on Testnet', () => {
  it('saves the record with the ordinal, credential, rpId and BE, and no Seed in any form', async () => {
    const { meta, ordinal, backupEligible } = ok(await createDerivedWallet(base, { pin: PIN }))
    const rec = recordOf(meta.id)
    expect(rec.seedMethod).toBe('passkey-derived')
    expect(meta.seedMethod).toBe('passkey-derived')
    expect(rec.signingCheck).toBe('passkey')
    expect(rec.derived).toEqual({ credentialIdB64: expect.any(String), rpId: 'localhost', ordinal, backupEligible: true })
    expect(backupEligible).toBe(true)
    expect(ordinal).toMatch(/^\d{6}$/)
    expect(rec.encryptedSeed).toBeUndefined()
    expect(rec.sealedSeed).toBeUndefined()
    expect(rec.signing).toBeUndefined()
    expect(rec.lockId).toBe(meta.lockId)
    expect(meta.lockId).not.toBe(LEGACY_LOCK_ID)
  })

  it('holds no Seed, entropy or PRF output anywhere in the vault', async () => {
    const { meta } = ok(await createDerivedWallet(base, { pin: PIN }))
    // Derive the Seed the way a signature would, then look for it everywhere.
    const seed = ok(await revealSeed(meta.id, { openKey: null, prompts }))
    expect(Wallet.fromSeed(seed).address).toBe(meta.address)
    const everything = JSON.stringify([...h.state.stores.wallets.values(), ...h.state.stores.vault.values(), ...h.state.stores.session.values()])
    expect(everything).not.toContain(seed)
    // Nor in what the app persists or any web storage: the display meta the store keeps, and localStorage/sessionStorage.
    const web = new Map<string, string>()
    const storage = { getItem: (k: string) => web.get(k) ?? null, setItem: (k: string, v: string) => void web.set(k, v) }
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('sessionStorage', storage)
    const persisted = JSON.stringify(await listWallets()) + JSON.stringify([...web.entries()])
    expect(persisted).not.toContain(seed)
    expect(persisted).not.toContain(Buffer.from((await import('xrpl')).decodeSeed(seed).bytes).toString('hex'))
    const entropyHex = Buffer.from((await import('xrpl')).decodeSeed(seed).bytes).toString('hex')
    expect(everything).not.toContain(entropyHex)
    expect(everything).not.toContain(Buffer.from((await import('xrpl')).decodeSeed(seed).bytes).toString('base64'))
  })

  it('registers under the explicit rpId, named after the Wallet, then asserts the seed salt for that ordinal', async () => {
    const { ordinal } = ok(await createDerivedWallet(base, { pin: PIN }))
    expect(auth.creates).toHaveLength(1)
    expect(auth.creates[0].publicKey.rp).toEqual({ name: 'XRPL Bench', id: 'localhost' })
    expect(auth.creates[0].publicKey.user.name).toContain('Spending')
    expect(auth.gets).toHaveLength(1)
    expect(auth.gets[0].publicKey.rpId).toBe('localhost')
    expect(auth.gets[0].publicKey.allowCredentials).toHaveLength(1)
    expect(Buffer.from(auth.gets[0].publicKey.extensions.prf.eval.first).toString('hex')).toBe(Buffer.from(await seedSalt(ordinal)).toString('hex'))
  })

  it('states BE unknown when the authenticator does not say', async () => {
    auth.backupEligible = undefined
    const { meta, backupEligible } = ok(await createDerivedWallet(base, { pin: PIN }))
    expect(backupEligible).toBeUndefined()
    expect(recordOf(meta.id).derived).not.toHaveProperty('backupEligible')
  })

  it('stores BE false for a device-bound passkey', async () => {
    auth.backupEligible = false
    const { meta, backupEligible } = ok(await createDerivedWallet(base, { pin: PIN }))
    expect(backupEligible).toBe(false)
    expect(recordOf(meta.id).derived.backupEligible).toBe(false)
  })
})

describe('an existing passkey', () => {
  it('asserts with no allowCredentials, takes the credential id from the result, and saves', async () => {
    // A passkey made earlier, e.g. by another wallet.
    const first = ok(await createDerivedWallet(base, { pin: PIN }))
    const credentialId = recordOf(first.meta.id).derived.credentialIdB64
    auth.picked = credentialId
    auth.gets = []
    const second = ok(await createDerivedWallet({ ...base, passkeyChoice: 'existing' }, { pin: PIN }))
    expect(auth.gets[0].publicKey.allowCredentials).toBeUndefined()
    expect(auth.gets[0].publicKey.rpId).toBe('localhost')
    expect(auth.registers).toBe(1)
    const rec = recordOf(second.meta.id)
    expect(rec.derived.credentialIdB64).toBe(credentialId)
    // Another ordinal on the same credential is another Wallet.
    expect(second.ordinal).not.toBe(first.ordinal)
    expect(second.meta.address).not.toBe(first.meta.address)
    expect(second.backupEligible).toBeUndefined()
  })

  it('a cancelled prompt writes nothing', async () => {
    auth.mode = 'cancel'
    expect(await createDerivedWallet({ ...base, passkeyChoice: 'existing' }, { pin: PIN })).toEqual({ status: 'cancelled' })
    emptyVault()
  })

  it('refuses a duplicate (credential, ordinal, algorithm), and allows another algorithm', async () => {
    const first = ok(await createDerivedWallet(base, { pin: PIN }))
    auth.picked = recordOf(first.meta.id).derived.credentialIdB64
    const dup = await createDerivedWallet({ ...base, passkeyChoice: 'existing', ordinal: first.ordinal }, { pin: PIN })
    expect(dup).toMatchObject({ status: 'refused', reason: expect.stringContaining('already exists') })
    expect(h.state.stores.wallets.size).toBe(1)
    expect(lockRecords()).toHaveLength(1)
    const other = await createDerivedWallet({ ...base, passkeyChoice: 'existing', ordinal: first.ordinal, algorithm: 'secp256k1' }, { pin: PIN })
    expect(other.status).toBe('ok')
  })
})

describe('signing and reveal', () => {
  it('one passkey assertion yields the Seed for that use, and signs', async () => {
    const { meta } = ok(await createDerivedWallet(base, { pin: PIN }))
    auth.gets = []
    const signer = ok(await openSigner(meta.id, { openKey: null, prompts }))
    expect(auth.gets).toHaveLength(1)
    const signed = signer.sign({ TransactionType: 'Payment', Account: meta.address, Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', Amount: '1', Fee: '12', Sequence: 1 } as any)
    expect(signed.tx_blob.length).toBeGreaterThan(0)
    // One use only.
    expect(() => signer.sign({} as any)).toThrow(/already used/)
  })

  it('the Open Key never opens it: a derived record has no ciphertext for a session key', async () => {
    const { meta, openKey } = ok(await createDerivedWallet(base, { pin: PIN }))
    auth.gets = []
    // Handing the session's Open Key changes nothing: the passkey is still asked.
    ok(await openSigner(meta.id, { openKey, prompts }))
    expect(auth.gets).toHaveLength(1)
  })

  it('a different passkey derives a different address: a wrong credential, counted', async () => {
    const { meta } = ok(await createDerivedWallet(base, { pin: PIN }))
    auth.secrets.set('other', crypto.getRandomValues(new Uint8Array(32)))
    auth.impostor = 'other'
    const before = failedAttempts()
    const result = await openSigner(meta.id, { openKey: null, prompts })
    expect(result).toMatchObject({ status: 'wrong-credential', kind: 'passkey' })
    expect(failedAttempts()).toBe(before + 1)
    expect(await revealSeed(meta.id, { openKey: null, prompts })).toMatchObject({ status: 'wrong-credential' })
  })

  it('a cancelled prompt signs nothing and counts nothing', async () => {
    const { meta } = ok(await createDerivedWallet(base, { pin: PIN }))
    auth.mode = 'cancel'
    const before = failedAttempts()
    expect(await openSigner(meta.id, { openKey: null, prompts })).toEqual({ status: 'cancelled' })
    expect(failedAttempts()).toBe(before)
  })

  it('a derived Wallet cannot be given a stored signing check', async () => {
    const { meta, openKey } = ok(await createDerivedWallet(base, { pin: PIN }))
    await expect(sealSeedUnderSigningCheck(meta.id, 'passkey', { openKey, prompts })).rejects.toThrow(/no stored Seed/)
  })
})

describe('one passkey, one purpose per salt', () => {
  it('the same passkey as Open Check has its own random salt and info, not the seed salt', async () => {
    const { meta, ordinal } = ok(await createDerivedWallet({ ...base, openCheck: 'passkey' }))
    const rec = recordOf(meta.id)
    const lock = h.state.stores.vault.get(`lock:${meta.lockId}`)
    expect(lock.passkeyCredentialIdB64).toBe(rec.derived.credentialIdB64)
    expect(lock.rpId).toBe('localhost')
    expect(auth.registers).toBe(1)
    const seed = Buffer.from(await seedSalt(ordinal)).toString('base64')
    expect(lock.prfSaltB64).not.toBe(seed)
    expect(lock.hkdfInfo).toContain(meta.lockId)
    // Every assertion in the flow used a different salt per purpose.
    const salts = auth.gets.map((g) => Buffer.from(g.publicKey.extensions.prf.eval.first).toString('base64'))
    expect(new Set(salts).size).toBe(salts.length)
    // The lock opens with that passkey and still carries the rpId.
    auth.gets = []
    ok(await openLock(meta.lockId, 'passkey'))
    expect(auth.gets[0].publicKey.rpId).toBe('localhost')
  })
})

describe('restore on a device with no local storage', () => {
  it('yields the same address from the same passkey, ordinal and algorithm', async () => {
    const { meta, ordinal } = ok(await createDerivedWallet(base, { pin: PIN }))
    const credentialId = recordOf(meta.id).derived.credentialIdB64
    // A new device: the vault is empty; the passkey (synced) is there.
    h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
    auth.picked = credentialId
    const restored = ok(await restorePasskeyWallet(ordinal, 'ed25519', 'testnet', undefined, prompts, { expectedAddress: meta.address, openCheck: 'none' }))
    expect(restored.meta.address).toBe(meta.address)
    expect(recordOf(restored.meta.id).derived).toMatchObject({ credentialIdB64: credentialId, ordinal })
    expect(recordOf(restored.meta.id).encryptedSeed).toBeUndefined()
  })

  it('refuses a mismatch and writes nothing', async () => {
    const { meta, ordinal } = ok(await createDerivedWallet(base, { pin: PIN }))
    auth.picked = recordOf(meta.id).derived.credentialIdB64
    h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
    // Wrong ordinal, wrong algorithm, wrong expected address: each derives another address.
    const wrongOrdinal = ordinal === '000000' ? '000001' : '000000'
    for (const attempt of [
      restorePasskeyWallet(wrongOrdinal, 'ed25519', 'testnet', undefined, prompts, { expectedAddress: meta.address, openCheck: 'none' }),
      restorePasskeyWallet(ordinal, 'secp256k1', 'testnet', undefined, prompts, { expectedAddress: meta.address, openCheck: 'none' }),
      restorePasskeyWallet(ordinal, 'ed25519', 'testnet', undefined, prompts, { expectedAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', openCheck: 'none' }),
    ]) {
      expect(await attempt).toMatchObject({ status: 'wrong-credential', kind: 'passkey' })
    }
    emptyVault()
  })

  it('refuses a malformed ordinal', async () => {
    expect(await restorePasskeyWallet('12', 'ed25519', 'testnet', undefined, prompts, { expectedAddress: 'r', openCheck: 'none' })).toMatchObject({ status: 'refused' })
  })
})

describe('Mainnet and the origin', () => {
  it('on *.b-cdn.net is refused, and writes nothing', async () => {
    vi.stubGlobal('location', { hostname: 'sites-xrpl-bench-prod-pdbywc.b-cdn.net' })
    const result = await createDerivedWallet({ ...base, network: 'mainnet' }, { pin: PIN })
    expect(result).toMatchObject({ status: 'refused', reason: expect.stringContaining('Mainnet') })
    expect(auth.creates).toHaveLength(0)
    emptyVault()
  })

  it('on a custom domain with an App PIN Open Check is allowed', async () => {
    vi.stubGlobal('location', { hostname: 'wallet.example.com' })
    const { meta } = ok(await createDerivedWallet({ ...base, network: 'mainnet' }, { pin: PIN }))
    expect(recordOf(meta.id).derived.rpId).toBe('wallet.example.com')
  })

  it('on a custom domain with a passkey Open Check hits the written-Seed refusal until story 7', async () => {
    vi.stubGlobal('location', { hostname: 'wallet.example.com' })
    expect(await createDerivedWallet({ ...base, network: 'mainnet', openCheck: 'passkey' })).toMatchObject({
      status: 'refused',
      reason: expect.stringContaining('written, confirmed Seed'),
    })
    emptyVault()
  })

  it('Testnet and Devnet are allowed at a b-cdn.net origin', async () => {
    vi.stubGlobal('location', { hostname: 'x.b-cdn.net' })
    expect((await createDerivedWallet(base, { pin: PIN })).status).toBe('ok')
    expect((await createDerivedWallet({ ...base, network: 'devnet' }, { pin: PIN })).status).toBe('ok')
  })
})

describe('PRF', () => {
  it('capability no is refused without a prompt', async () => {
    expect(await createDerivedWallet({ ...base, passkey: 'no' }, { pin: PIN })).toMatchObject({ status: 'refused' })
    expect(auth.creates).toHaveLength(0)
    emptyVault()
  })

  it('PRF skipped at registration and absent at the assertion writes nothing', async () => {
    auth.mode = 'no-prf'
    expect(await createDerivedWallet(base, { pin: PIN })).toEqual({ status: 'unsupported' })
    expect(auth.registers).toBe(1)
    emptyVault()
  })
})

describe('atomic', () => {
  it('a write failure after the lock is written removes the lock and writes no Wallet', async () => {
    h.state.failNextPutOn = 'wallets'
    await expect(createDerivedWallet(base, { pin: PIN })).rejects.toThrow('put failed')
    emptyVault()
  })

  it('a cancelled registration leaves the vault as it was', async () => {
    auth.mode = 'cancel'
    expect(await createDerivedWallet(base, { pin: PIN })).toEqual({ status: 'cancelled' })
    emptyVault()
  })

  it('does not disturb an existing Stored Seed Wallet', async () => {
    const stored = ok(
      await createStoredWallet({ label: 'Old', network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', autoLockMinutes: 5, signing: 'standard', passkey: 'yes' }, { pin: PIN }),
    )
    const before = JSON.stringify(recordOf(stored.meta.id))
    ok(await createDerivedWallet(base, { pin: PIN }))
    expect(JSON.stringify(recordOf(stored.meta.id))).toBe(before)
    expect(stored.meta.seedMethod).toBe('stored')
  })
})

describe('getRpId is the only rpId source', () => {
  it('falls back to the page host only where no build value is configured', () => {
    expect(getRpId()).toBe('localhost')
    vi.stubGlobal('__RP_ID__', 'wallet.example.com')
    expect(getRpId()).toBe('wallet.example.com')
  })

  it('no other module reads the page host', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) {
          if (name !== '__tests__') walk(path)
        } else if (/\.(ts|tsx)$/.test(name) && !path.endsWith('webauthn.ts')) {
          if (/(location\.(hostname|host|href|origin)|document\.domain)/.test(readFileSync(path, 'utf8'))) offenders.push(path)
        }
      }
    }
    walk(join(process.cwd(), 'src'))
    expect(offenders).toEqual([])
  })
})

describe('legacy vault set-up records the rpId of a new passkey', () => {
  it('stores it on the vault meta', async () => {
    await setUpVaultAuth('Me', PIN)
    expect(h.state.stores.vault.get('vault').rpId).toBe('localhost')
  })
})

describe('rpId recording and replay on the existing paths', () => {
  const stored = {
    label: 'Old',
    network: 'testnet' as const,
    algorithm: 'ed25519' as const,
    openCheck: 'pin' as const,
    autoLockMinutes: 5,
    signing: 'passkey' as const,
    passkey: 'yes' as const,
  }

  it('a Stored Seed passkey Signing Check records signing.rpId and openSigner asserts with it', async () => {
    const { meta } = ok(await createStoredWallet(stored, { pin: PIN }))
    expect(recordOf(meta.id).signing.rpId).toBe('localhost')
    auth.gets = []
    ok(await openSigner(meta.id, { openKey: null, prompts }))
    expect(auth.gets).toHaveLength(1)
    expect(auth.gets[0].publicKey.rpId).toBe('localhost')
  })

  it('a seal with no rpId asserts without one', async () => {
    const { meta } = ok(await createStoredWallet(stored, { pin: PIN }))
    const rec = recordOf(meta.id)
    delete rec.signing.rpId
    h.state.stores.wallets.set(rec.id, rec)
    auth.gets = []
    ok(await openSigner(meta.id, { openKey: null, prompts }))
    expect(auth.gets[0].publicKey).not.toHaveProperty('rpId')
  })

  it("openLock('legacy', 'passkey') passes the vault meta's rpId, and none when it has none", async () => {
    await setUpVaultAuth('Me', PIN)
    auth.gets = []
    ok(await openLock(LEGACY_LOCK_ID, 'passkey'))
    expect(auth.gets[0].publicKey.rpId).toBe('localhost')
    const meta = h.state.stores.vault.get('vault')
    delete meta.rpId
    h.state.stores.vault.set('vault', meta)
    auth.gets = []
    ok(await openLock(LEGACY_LOCK_ID, 'passkey'))
    expect(auth.gets[0].publicKey).not.toHaveProperty('rpId')
  })

  it('signs with a derived secp256k1 Wallet', async () => {
    const { meta } = ok(await createDerivedWallet({ ...base, algorithm: 'secp256k1' }, { pin: PIN }))
    const signer = ok(await openSigner(meta.id, { openKey: null, prompts }))
    const signed = signer.sign({ TransactionType: 'Payment', Account: meta.address, Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', Amount: '1', Fee: '12', Sequence: 1 } as any)
    expect(signed.tx_blob.length).toBeGreaterThan(0)
  })
})

describe('a Mainnet view of a derived Seed goes through policy', () => {
  it('is refused at a b-cdn.net origin, and when the origin is unknown', async () => {
    const { meta } = ok(await createDerivedWallet(base, { pin: PIN }))
    vi.stubGlobal('location', { hostname: 'x.b-cdn.net' })
    await expect(addNetworkView(meta.id, 'mainnet')).rejects.toThrow(/temporary web address/)
    vi.stubGlobal('location', { hostname: '' })
    await expect(addNetworkView(meta.id, 'mainnet')).rejects.toThrow(/could not be determined/)
    expect(recordOf(meta.id).views).toHaveLength(1)
  })

  it('is allowed on a custom domain with an App PIN Open Check, and refused for a passkey-only one', async () => {
    const pinned = ok(await createDerivedWallet(base, { pin: PIN }))
    const passkeyOnly = ok(await createDerivedWallet({ ...base, openCheck: 'passkey' }))
    vi.stubGlobal('location', { hostname: 'wallet.example.com' })
    expect((await addNetworkView(pinned.meta.id, 'mainnet')).network).toBe('mainnet')
    await expect(addNetworkView(passkeyOnly.meta.id, 'mainnet')).rejects.toThrow(/written, confirmed Seed/)
    // Testnet-to-Devnet is unaffected at any origin.
    vi.stubGlobal('location', { hostname: 'x.b-cdn.net' })
    expect((await addNetworkView(passkeyOnly.meta.id, 'devnet')).network).toBe('devnet')
  })
})
