import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'

/**
 * Story 5 / AD-21, AD-23, AD-28: `createStoredWallet` makes a Wallet on its own lock,
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

import { setUpVaultAuth } from '../auth'
import { LEGACY_LOCK_ID } from '../db'
import { discardUnusedAppPin, getLockInfo, openLock } from '../lock'
import { addNetworkView, createStoredWallet, listWallets, openSigner, removeWallet, revealSeed, type CreateStoredWalletInput, type Prompts } from '../keystore'
import { aesDecrypt } from '../aes'
import { putVaultMeta, getVaultMeta } from '../db'

const PIN = '123456'
const pinPrompt = (pin: string | null): Prompts => ({ pin: async () => pin })
const failedAttempts = () => h.state.stores.vault.get('vault')?.failedAttempts ?? 0
const lockRecords = () => [...h.state.stores.vault.values()].filter((r) => String(r.key).startsWith('lock:'))
const emptyVault = () => {
  expect(h.state.stores.wallets.size).toBe(0)
  expect(lockRecords()).toEqual([])
  expect(h.state.stores.vault.get('vault')?.pinSaltB64).toBeUndefined()
  expect(h.state.stores.vault.get('vault')?.pinVerifier).toBeUndefined()
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
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
  w.mode = 'ok'
  w.supported = true
  w.asserts = 0
  w.registers = 0
  w.salts = []
  w.names = []
})

const recordOf = (id: string) => h.state.stores.wallets.get(id)

describe('defaults: App PIN open, Standard signing', () => {
  it('writes one Wallet on its own lock, the Seed under the lock Open Key only', async () => {
    const { meta, openKey, seed } = ok(await createStoredWallet(base, { pin: PIN }))
    const rec = recordOf(meta.id)
    expect(meta.lockId).not.toBe(LEGACY_LOCK_ID)
    expect(rec.lockId).toBe(meta.lockId)
    expect(rec.seedMethod).toBe('stored')
    expect(rec.algorithm).toBe('ed25519')
    expect(rec.openCheck).toBe('pin')
    expect(rec.signingCheck).toBe('standard')
    expect(rec.views).toEqual([{ walletId: meta.id, network: 'testnet' }])
    expect(rec.sealedSeed).toBeUndefined()
    expect(rec.signing).toBeUndefined()
    expect(await aesDecrypt(openKey, rec.encryptedSeed.ivB64, rec.encryptedSeed.ciphertextB64)).toBe(seed)
    expect(JSON.stringify([...h.state.stores.wallets.values(), ...h.state.stores.vault.values()])).not.toContain(seed)
    // Every derivation input is generated and stored on the record.
    const lock = h.state.stores.vault.get(`lock:${meta.lockId}`)
    expect(lock.hkdfInfo).toContain(meta.lockId)
    expect(lock.wrappedOpenKeyForPin).toBeDefined()
    expect((await getLockInfo(meta.lockId)).autoLockMinutes).toBe(5)
    // It opens with the App PIN and signs.
    const opened = ok(await openLock(meta.lockId, 'pin', { pin: PIN }))
    expect((await openSigner(meta.id, { openKey: opened.key, prompts: pinPrompt(null) })).status).toBe('ok')
  })

  it('every Wallet gets its own lock, even with the same Open Check', async () => {
    const a = ok(await createStoredWallet(base, { pin: PIN })).meta
    const b = ok(await createStoredWallet(base, { pin: PIN })).meta
    expect(a.lockId).not.toBe(b.lockId)
    expect(lockRecords()).toHaveLength(2)
    expect(lockRecords().map((r) => r.hkdfInfo)).toEqual([expect.stringContaining(a.lockId), expect.stringContaining(b.lockId)])
  })

  it('the first App PIN is created by the first Wallet; the second asks for it and a wrong one counts', async () => {
    ok(await createStoredWallet(base, { pin: PIN }))
    expect(h.state.stores.vault.get('vault').pinSaltB64).toBeDefined()
    expect(await createStoredWallet(base, { pin: '000000' })).toMatchObject({ status: 'wrong-credential', kind: 'pin', triesRemaining: 7 })
    expect(failedAttempts()).toBe(1)
    expect(h.state.stores.wallets.size).toBe(1)
    expect(lockRecords()).toHaveLength(1)
  })

  it('no PIN given means cancelled, not counted, nothing written', async () => {
    expect(await createStoredWallet(base)).toEqual({ status: 'cancelled' })
    expect(failedAttempts()).toBe(0)
    emptyVault()
  })

  it('stores a custom Node canonically on the view, and refuses a bad one', async () => {
    const { meta } = ok(await createStoredWallet({ ...base, node: 'WSS://node.example.com/' }, { pin: PIN }))
    expect(recordOf(meta.id).views[0].node).toBe('wss://node.example.com')
    expect((await createStoredWallet({ ...base, node: 'http://x' }, { pin: PIN })).status).toBe('refused')
  })

  it('creates a secp256k1 Wallet when asked', async () => {
    const { meta, seed } = ok(await createStoredWallet({ ...base, algorithm: 'secp256k1' }, { pin: PIN }))
    expect(recordOf(meta.id).algorithm).toBe('secp256k1')
    expect(seed.startsWith('sEd')).toBe(false)
  })
})

describe('sealed by a PIN Signing Check', () => {
  it('has sealedSeed and signing, no encryptedSeed, and the Open Key cannot open it', async () => {
    const { meta, openKey, seed } = ok(await createStoredWallet({ ...base, signing: 'pin' }, { pin: PIN }))
    const rec = recordOf(meta.id)
    expect(rec.encryptedSeed).toBeUndefined()
    expect(rec.sealedSeed).toBeDefined()
    expect(rec.signing).toMatchObject({ kind: 'pin', hkdfInfo: expect.stringContaining(meta.id) })
    expect(rec.signingCheck).toBe('pin')
    await expect(aesDecrypt(openKey, rec.sealedSeed.ivB64, rec.sealedSeed.ciphertextB64)).rejects.toThrow()
    expect(JSON.stringify(rec)).not.toContain(seed)
    // The PIN is typed once for both checks; signing asks the dialog.
    const prompt: string[] = []
    const result = await openSigner(meta.id, { openKey, prompts: { pin: async (i) => (prompt.push(String(i.triesRemaining)), PIN) } })
    expect(result.status).toBe('ok')
    expect(prompt).toEqual(['8'])
    expect(await revealSeed(meta.id, { openKey: null, prompts: pinPrompt(PIN) })).toEqual({ status: 'ok', value: seed })
  })

  it('a wrong PIN while signing counts and says how many tries remain', async () => {
    const { meta, openKey } = ok(await createStoredWallet({ ...base, signing: 'pin' }, { pin: PIN }))
    expect(await openSigner(meta.id, { openKey, prompts: pinPrompt('000000') })).toEqual({ status: 'wrong-credential', kind: 'pin', triesRemaining: 7 })
    expect((await openSigner(meta.id, { openKey, prompts: pinPrompt(null) })).status).toBe('cancelled')
    expect(failedAttempts()).toBe(1)
  })

  it('works with no Open Check on Testnet: the PIN is the signing check alone', async () => {
    const { meta } = ok(await createStoredWallet({ ...base, openCheck: 'none', signing: 'pin' }, { pin: PIN }))
    expect(recordOf(meta.id).sealedSeed).toBeDefined()
    expect(h.state.stores.vault.get(`lock:${meta.lockId}`).wrappedOpenKeyForPin).toBeUndefined()
  })
})

describe('sealed by a passkey Signing Check', () => {
  it('stores its own credential, PRF salt and info, distinct from the lock, and one prompt signs', async () => {
    const { meta, openKey } = ok(await createStoredWallet({ ...base, openCheck: 'passkey', signing: 'passkey', network: 'testnet' }, {}))
    const rec = recordOf(meta.id)
    const lock = h.state.stores.vault.get(`lock:${meta.lockId}`)
    expect(rec.encryptedSeed).toBeUndefined()
    expect(rec.signing).toMatchObject({ kind: 'passkey', credentialIdB64: expect.any(String), prfSaltB64: expect.any(String), hkdfInfo: expect.stringContaining(meta.id) })
    expect(rec.signing.prfSaltB64).not.toBe(lock.prfSaltB64)
    expect(rec.signing.hkdfInfo).not.toBe(lock.hkdfInfo)
    expect(rec.signing.credentialIdB64).not.toBe(lock.passkeyCredentialIdB64)
    await expect(aesDecrypt(openKey, rec.sealedSeed.ivB64, rec.sealedSeed.ciphertextB64)).rejects.toThrow()
    w.asserts = 0
    expect((await openSigner(meta.id, { openKey, prompts: pinPrompt(null) })).status).toBe('ok')
    expect(w.asserts).toBe(1)
    // Two passkeys of one Wallet are told apart by purpose.
    expect([...w.names].sort()).toEqual(['Savings – open', 'Savings – signing'])
  })

  it('a cancelled passkey leaves the vault as it was, even when it was to make the App PIN', async () => {
    w.mode = 'cancel'
    expect(await createStoredWallet({ ...base, signing: 'passkey' }, { pin: PIN })).toEqual({ status: 'cancelled' })
    expect(failedAttempts()).toBe(0)
    emptyVault()
  })

  it('a device that gives no PRF writes nothing', async () => {
    w.mode = 'no-prf'
    expect(await createStoredWallet({ ...base, passkey: 'unknown', signing: 'passkey' }, { pin: PIN })).toEqual({ status: 'unsupported' })
    emptyVault()
    expect(await createStoredWallet({ ...base, passkey: 'unknown', openCheck: 'passkey' }, {})).toEqual({ status: 'unsupported' })
    emptyVault()
  })
})

describe('open check none', () => {
  it('has an Open Key and no wrapper, and opens with no prompt', async () => {
    const { meta, seed } = ok(await createStoredWallet({ ...base, openCheck: 'none' }))
    const lock = h.state.stores.vault.get(`lock:${meta.lockId}`)
    expect(lock.openKey).toBeDefined()
    expect(lock.wrappedOpenKeyForPin).toBeUndefined()
    expect(lock.wrappedOpenKeyForPasskey).toBeUndefined()
    const opened = ok(await openLock(meta.lockId, 'none'))
    expect(await aesDecrypt(opened.key, recordOf(meta.id).encryptedSeed.ivB64, recordOf(meta.id).encryptedSeed.ciphertextB64)).toBe(seed)
  })
})

describe('the policy refuses before any write', () => {
  it.each([
    ['Mainnet with no Open Check', { network: 'mainnet', openCheck: 'none' }],
    ['Mainnet under a minute', { network: 'mainnet', autoLockMinutes: 0.5 }],
    ['Mainnet with only a passkey and no confirmation callback', { network: 'mainnet', openCheck: 'passkey', signing: 'passkey' }],
    ['Mainnet passkey Open Check with Standard signing', { network: 'mainnet', openCheck: 'passkey', signing: 'standard' }],
    ['a passkey on a device with no PRF', { openCheck: 'passkey', passkey: 'no' }],
    ['a passkey signing check on a device with no PRF', { signing: 'passkey', passkey: 'no' }],
  ] as const)('%s', async (_name, change) => {
    const result = await createStoredWallet({ ...base, ...change }, { pin: PIN })
    expect(result.status).toBe('refused')
    expect((result as { reason: string }).reason.length).toBeGreaterThan(10)
    expect(w.registers).toBe(0)
    emptyVault()
  })

  it('allows Mainnet with the App PIN for one or both checks, from one minute', async () => {
    expect(ok(await createStoredWallet({ ...base, network: 'mainnet', autoLockMinutes: 1, signing: 'pin' }, { pin: PIN })).meta.network).toBe('mainnet')
    expect(ok(await createStoredWallet({ ...base, network: 'mainnet', openCheck: 'passkey', signing: 'pin' }, { pin: PIN })).meta.network).toBe('mainnet')
  })
})

describe('discarding an App PIN a failed creation made', () => {
  it('never discards a PIN a Wallet is sealed under, even with no lock wrapper (passkey Open Check, PIN Signing Check)', async () => {
    const { meta } = ok(await createStoredWallet({ ...base, openCheck: 'passkey', signing: 'pin' }, { pin: PIN }))
    expect(lockRecords()[0].wrappedOpenKeyForPin).toBeUndefined()
    await discardUnusedAppPin()
    expect(h.state.stores.vault.get('vault').pinSaltB64).toBeDefined()
    expect((await openSigner(meta.id, { openKey: null, prompts: pinPrompt(PIN) })).status).toBe('ok')
  })

  it('does not reset the shared failure count', async () => {
    h.state.stores.vault.set('vault', { key: 'vault', pinSaltB64: 'AAAA', failedAttempts: 3 })
    await discardUnusedAppPin()
    expect(failedAttempts()).toBe(3)
  })
})

describe('atomic', () => {
  it('a write failure after the lock removes the lock and writes no Wallet', async () => {
    h.state.failNextPutOn = 'wallets'
    await expect(createStoredWallet(base, { pin: PIN })).rejects.toThrow()
    emptyVault()
  })

  it('a write failure after the lock leaves an earlier Wallet and its lock alone', async () => {
    const first = ok(await createStoredWallet(base, { pin: PIN })).meta
    h.state.failNextPutOn = 'wallets'
    await expect(createStoredWallet(base, { pin: PIN })).rejects.toThrow()
    expect(lockRecords().map((r) => r.id)).toEqual([first.lockId])
    expect(h.state.stores.wallets.size).toBe(1)
    expect(h.state.stores.vault.get('vault').pinSaltB64).toBeDefined()
  })
})

describe('a second view of a created Wallet', () => {
  it('removing one view keeps the lock, which still opens the Seed', async () => {
    const { meta, seed } = ok(await createStoredWallet(base, { pin: PIN }))
    const second = await addNetworkView(meta.id, 'devnet')
    await removeWallet(second.id)
    expect(h.state.stores.vault.get(`lock:${meta.lockId}`)).toBeDefined()
    const opened = ok(await openLock(meta.lockId, 'pin', { pin: PIN }))
    const rec = recordOf(meta.id)
    expect(await aesDecrypt(opened.key, rec.encryptedSeed.ivB64, rec.encryptedSeed.ciphertextB64)).toBe(seed)
    await removeWallet(meta.id)
    expect(h.state.stores.vault.get(`lock:${meta.lockId}`)).toBeUndefined()
  })
})

describe('removing the last Wallet on a created lock', () => {
  it('deletes its record and session and leaves the legacy lock and other locks', async () => {
    const legacyKey = await setUpVaultAuth('t', PIN)
    expect(legacyKey).toBeDefined()
    expect(h.state.stores.vault.get('lock:legacy')).toBeDefined()
    const a = ok(await createStoredWallet(base, { pin: PIN })).meta
    const b = ok(await createStoredWallet(base, { pin: PIN })).meta
    const { startLockSession } = await import('../lock')
    await startLockSession(a.lockId, legacyKey, 5)
    expect(h.state.stores.session.get(`session:${a.lockId}`)).toBeDefined()
    await removeWallet(a.id)
    expect(h.state.stores.vault.get(`lock:${a.lockId}`)).toBeUndefined()
    expect(h.state.stores.session.get(`session:${a.lockId}`)).toBeUndefined()
    expect(h.state.stores.vault.get(`lock:${b.lockId}`)).toBeDefined()
    expect(h.state.stores.vault.get('lock:legacy')).toBeDefined()
    expect((await listWallets()).map((m) => m.id)).toEqual([b.id])
  })

  it('removing a legacy Wallet never deletes the legacy lock', async () => {
    const { generateAndStoreWallet } = await import('../keystore')
    const key = await setUpVaultAuth('t', PIN)
    const legacy = (await generateAndStoreWallet('L', key, 'testnet')).meta
    await removeWallet(legacy.id)
    expect(h.state.stores.vault.get('lock:legacy')).toBeDefined()
  })
})

describe('the written-Seed confirmation (FR-72)', () => {
  const passkeyOnly = { ...base, network: 'mainnet', openCheck: 'passkey', signing: 'passkey' } as const

  it('Mainnet passkey-only: the callback sees the Seed before any credential, lock or Wallet exists, then the record notes it', async () => {
    let seen: { seed: string; registers: number; locks: number; wallets: number } | null = null
    const result = await createStoredWallet(passkeyOnly, {
      confirmWrittenSeed: async (seed) => {
        seen = { seed, registers: w.registers, locks: lockRecords().length, wallets: h.state.stores.wallets.size }
        return true
      },
    })
    const { meta, seed } = ok(result)
    expect(seen).toEqual({ seed, registers: 0, locks: 0, wallets: 0 })
    expect(typeof recordOf(meta.id).writtenSeedConfirmedAt).toBe('number')
    expect(JSON.stringify([...h.state.stores.wallets.values(), ...h.state.stores.vault.values()])).not.toContain(seed)
  })

  it('also for a Standard Signing Check', async () => {
    const { meta } = ok(await createStoredWallet({ ...passkeyOnly, signing: 'standard' }, { confirmWrittenSeed: async () => true }))
    expect(recordOf(meta.id).writtenSeedConfirmedAt).toBeGreaterThan(0)
  })

  it('cancelling at the confirm writes no credential, lock or Wallet', async () => {
    expect(await createStoredWallet(passkeyOnly, { confirmWrittenSeed: async () => false })).toEqual({ status: 'cancelled' })
    expect(w.registers).toBe(0)
    emptyVault()
  })

  it('with no callback a direct keystore call is refused with the written-Seed reason', async () => {
    const result = await createStoredWallet(passkeyOnly)
    expect(result).toMatchObject({ status: 'refused', reason: expect.stringContaining('written, confirmed Seed') })
    expect(w.registers).toBe(0)
    emptyVault()
  })

  it('is never asked on Testnet, Devnet, or Mainnet with a PIN check', async () => {
    const confirm = vi.fn(async () => true)
    ok(await createStoredWallet(base, { pin: PIN, confirmWrittenSeed: confirm }))
    ok(await createStoredWallet({ ...base, network: 'devnet', openCheck: 'passkey', signing: 'passkey' }, { confirmWrittenSeed: confirm }))
    ok(await createStoredWallet({ ...base, network: 'mainnet', openCheck: 'passkey', signing: 'pin' }, { pin: PIN, confirmWrittenSeed: confirm }))
    ok(await createStoredWallet({ ...base, network: 'mainnet', openCheck: 'pin', signing: 'passkey' }, { pin: PIN, confirmWrittenSeed: confirm }))
    expect(confirm).not.toHaveBeenCalled()
    for (const rec of h.state.stores.wallets.values()) expect(rec.writtenSeedConfirmedAt).toBeUndefined()
  })
})

describe('revealing a Seed (FR-69)', () => {
  const sessionWrites = () => h.state.stores.session.size
  const countingPin = (pin: string | null) => {
    const p = { calls: 0, pin: async () => (p.calls++, pin) }
    return p
  }

  it('a Standard Wallet on a PIN lock asks the PIN, shows the Seed, and writes no session', async () => {
    const { meta, openKey, seed } = ok(await createStoredWallet(base, { pin: PIN }))
    const prompt = countingPin(PIN)
    expect(await revealSeed(meta.id, { openKey, prompts: prompt })).toEqual({ status: 'ok', value: seed })
    expect(prompt.calls).toBe(1)
    expect(sessionWrites()).toBe(0)
  })

  it('a wrong PIN counts and reveals nothing; a cancelled prompt does not count', async () => {
    const { meta, openKey } = ok(await createStoredWallet(base, { pin: PIN }))
    expect(await revealSeed(meta.id, { openKey, prompts: pinPrompt('000000') })).toMatchObject({ status: 'wrong-credential', kind: 'pin' })
    expect(failedAttempts()).toBe(1)
    expect(await revealSeed(meta.id, { openKey, prompts: pinPrompt(null) })).toEqual({ status: 'cancelled' })
    expect(failedAttempts()).toBe(1)
    expect(sessionWrites()).toBe(0)
  })

  it('a Standard Wallet on a passkey lock asks the passkey, and a cancel counts nothing', async () => {
    const { meta, openKey, seed } = ok(await createStoredWallet({ ...base, openCheck: 'passkey' }))
    w.asserts = 0
    expect(await revealSeed(meta.id, { openKey, prompts: pinPrompt(null) })).toEqual({ status: 'ok', value: seed })
    expect(w.asserts).toBe(1)
    w.mode = 'cancel'
    expect(await revealSeed(meta.id, { openKey, prompts: pinPrompt(null) })).toEqual({ status: 'cancelled' })
    expect(failedAttempts()).toBe(0)
    expect(sessionWrites()).toBe(0)
  })

  it('a passkey that cannot open the lock is a wrong credential: no Seed', async () => {
    const { meta, openKey } = ok(await createStoredWallet({ ...base, openCheck: 'passkey' }))
    w.mode = 'other-key'
    expect(await revealSeed(meta.id, { openKey, prompts: pinPrompt(null) })).toMatchObject({ status: 'wrong-credential', kind: 'passkey' })
  })

  it('Open Check none needs only the confirm dialog: no prompt at all', async () => {
    const { meta, openKey, seed } = ok(await createStoredWallet({ ...base, openCheck: 'none' }))
    const prompt = countingPin(null)
    expect(await revealSeed(meta.id, { openKey, prompts: prompt })).toEqual({ status: 'ok', value: seed })
    expect(prompt.calls).toBe(0)
    expect(w.asserts).toBe(0)
  })

  it('a sealed Wallet asks its Signing Check only, not the Open Check as well', async () => {
    const { meta, openKey, seed } = ok(await createStoredWallet({ ...base, signing: 'pin' }, { pin: PIN }))
    const prompt = countingPin(PIN)
    expect(await revealSeed(meta.id, { openKey, prompts: prompt })).toEqual({ status: 'ok', value: seed })
    expect(prompt.calls).toBe(1)
  })
})

describe('a throwing confirmation callback', () => {
  it('leaves no lock, Wallet, or App PIN behind, and the error surfaces', async () => {
    const boom = new Error('dialog crashed')
    await expect(
      createStoredWallet({ ...base, network: 'mainnet', openCheck: 'passkey', signing: 'passkey' }, { confirmWrittenSeed: async () => { throw boom } }),
    ).rejects.toBe(boom)
    expect(w.registers).toBe(0)
    emptyVault()
  })
})

describe('revealing on a legacy lock (FR-69)', () => {
  async function legacyWallet(passkey: boolean) {
    const { generateAndStoreWallet } = await import('../keystore')
    const key = await setUpVaultAuth('t', PIN)
    if (!passkey) {
      const meta = await getVaultMeta()
      await putVaultMeta({ ...meta, passkeyCredentialIdB64: undefined, wrappedMasterKeyForPasskey: undefined })
    }
    const { meta, seed } = await generateAndStoreWallet('L', key, 'testnet')
    h.state.stores.session.clear()
    return { meta, seed, key }
  }
  const countingPin = (pin: string | null) => {
    const p = { calls: 0, pin: async () => (p.calls++, pin) }
    return p
  }

  it('PIN-only: asks the PIN, a wrong PIN counts, and no session is written', async () => {
    const { meta, seed, key } = await legacyWallet(false)
    expect((await getLockInfo('legacy')).openCheck).toBe('pin')
    const wrong = countingPin('000000')
    expect(await revealSeed(meta.id, { openKey: key, prompts: wrong })).toMatchObject({ status: 'wrong-credential', kind: 'pin' })
    expect(wrong.calls).toBe(1)
    expect(failedAttempts()).toBe(1)
    const right = countingPin(PIN)
    expect(await revealSeed(meta.id, { openKey: key, prompts: right })).toEqual({ status: 'ok', value: seed })
    expect(right.calls).toBe(1)
    expect(h.state.stores.session.size).toBe(0)
  })

  it("'either': asks the passkey when WebAuthn is supported, without touching the PIN or the failure count", async () => {
    const { meta, seed, key } = await legacyWallet(true)
    expect((await getLockInfo('legacy')).openCheck).toBe('either')
    const prompt = countingPin(null)
    w.asserts = 0
    expect(await revealSeed(meta.id, { openKey: key, prompts: prompt })).toEqual({ status: 'ok', value: seed })
    expect(w.asserts).toBe(1)
    expect(prompt.calls).toBe(0)
    expect(h.state.stores.session.size).toBe(0)
  })

  it("'either': a passkey reveal does not clear the PIN failure count", async () => {
    const { meta, key } = await legacyWallet(true)
    const meta0 = await getVaultMeta()
    await putVaultMeta({ ...meta0, failedAttempts: 3 })
    expect((await revealSeed(meta.id, { openKey: key, prompts: pinPrompt(null) })).status).toBe('ok')
    expect(failedAttempts()).toBe(3)
  })

  it("'either': a passkey that gives no PRF here falls back to the PIN, so a backup is never blocked", async () => {
    const { meta, seed, key } = await legacyWallet(true)
    w.mode = 'no-prf'
    const prompt = countingPin(PIN)
    expect(await revealSeed(meta.id, { openKey: key, prompts: prompt })).toEqual({ status: 'ok', value: seed })
    expect(prompt.calls).toBe(1)
  })

  it("'either': a cancelled passkey prompt stops there: no PIN is asked and nothing counts", async () => {
    const { meta, key } = await legacyWallet(true)
    w.mode = 'cancel'
    const prompt = countingPin(PIN)
    expect((await revealSeed(meta.id, { openKey: key, prompts: prompt })).status).toBe('cancelled')
    expect(prompt.calls).toBe(0)
    expect(failedAttempts()).toBe(0)
  })

  it("'either': falls back to the PIN when WebAuthn is not supported", async () => {
    const { meta, seed, key } = await legacyWallet(true)
    w.supported = false
    w.asserts = 0
    const prompt = countingPin(PIN)
    expect(await revealSeed(meta.id, { openKey: key, prompts: prompt })).toEqual({ status: 'ok', value: seed })
    expect(prompt.calls).toBe(1)
    expect(w.asserts).toBe(0)
    expect(h.state.stores.session.size).toBe(0)
  })
})
