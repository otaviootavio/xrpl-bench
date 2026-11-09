import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OS-FR-3, OS-FR-4: the Transmitter record in the keystore. `idb` runs in memory, as in `wallet-kind.test.ts`. */
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

import type { StoredWallet } from '../db'
import { createTransmitterWallet, listWallets, removeWallet, renameWallet, setLockAutoLock, setShowBeforeSending, setTransmitterSync, setWalletNode } from '../keystore'
import { proveTransmitterUnlock } from '../transmitter-unlock'

const ADDR = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const seedRec = (id: string, label = `Wallet ${id}`): StoredWallet =>
  ({
    id,
    label,
    address: `r${id}`,
    createdAt: 1,
    lockId: `L${id}`,
    seedMethod: 'stored',
    algorithm: 'ed25519',
    openCheck: 'none',
    signingCheck: 'standard',
    encryptedSeed: { ivB64: 'iv', ciphertextB64: `ct-${id}` },
    views: [{ walletId: id, network: 'testnet' }],
  }) as StoredWallet
const wallets = () => h.state.stores.wallets
const vault = () => h.state.stores.vault
const noPrompts = { prompts: { pin: async () => null } }

async function addTestnet(extra: Record<string, unknown> = {}) {
  const r = await createTransmitterWallet({ label: 'Send', network: 'testnet', openCheck: 'none', autoLockMinutes: 5, ...extra })
  if (r.status !== 'ok') throw new Error(`not created: ${JSON.stringify(r)}`)
  return r.value
}

beforeEach(() => {
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
})

describe('adding a Transmitter Wallet (OS-FR-3)', () => {
  it('writes a keyless record on a lock of its own, unsynced, with known ciphertext the Open Key decrypts', async () => {
    const { meta, openKey } = await addTestnet()
    const row = wallets().get(meta.id)
    expect(row).toMatchObject({ recordKind: 'transmitter', label: 'Send', network: 'testnet', openCheck: 'none', lockId: meta.lockId })
    for (const field of ['encryptedSeed', 'sealedSeed', 'signing', 'derived', 'address', 'seedMethod', 'signingCheck', 'syncedAddress']) expect(field in row).toBe(false)
    expect(vault().has(`lock:${meta.lockId}`)).toBe(true)
    expect(meta).toMatchObject({ kind: 'transmitter', address: null, seedId: meta.id })
    expect(await proveTransmitterUnlock(meta.lockId, openKey)).toBe(true)
    expect((await listWallets()).map((w) => w.kind)).toEqual(['transmitter'])
  })

  it('a key that is not its lock\'s fails the proof: never trusted because a key exists', async () => {
    const { meta } = await addTestnet()
    const other = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    expect(await proveTransmitterUnlock(meta.lockId, other)).toBe(false)
  })

  it('with an address it is Synced from the start (OS-FR-4)', async () => {
    const { meta } = await addTestnet({ syncedAddress: ADDR })
    expect(meta.address).toBe(ADDR)
    expect(wallets().get(meta.id).syncedAddress).toBe(ADDR)
  })

  it('Mainnet needs an Open Check and the auto-lock floor (FR-65); a refusal writes nothing', async () => {
    const none = await createTransmitterWallet({ label: 'M', network: 'mainnet', openCheck: 'none', autoLockMinutes: 5 })
    expect(none).toMatchObject({ status: 'refused', reason: expect.stringContaining('Open Check') })
    const fast = await createTransmitterWallet({ label: 'M', network: 'mainnet', openCheck: 'pin', autoLockMinutes: 0.5 }, { pin: '123456' })
    expect(fast.status).toBe('refused')
    expect(wallets().size).toBe(0)
    expect(vault().size).toBe(0)
  })

  it('refuses an address that does not check, writing nothing', async () => {
    const r = await createTransmitterWallet({ label: 'S', network: 'testnet', openCheck: 'none', autoLockMinutes: 5, syncedAddress: 'rNOTanADDRESS' })
    expect(r).toEqual({ status: 'refused', reason: "That doesn't look like a valid XRPL address." })
    expect(wallets().size).toBe(0)
  })

  it('takes no name another Wallet has, Seed or Transmitter (AD-42)', async () => {
    wallets().set('s', seedRec('s', 'Send'))
    const { meta } = await addTestnet()
    expect(meta.label).not.toBe('Send')
    const renamed = await renameWallet(meta.id, 'Send')
    expect(renamed.ok).toBe(false)
    const seedRename = await renameWallet('s', meta.label)
    expect(seedRename.ok).toBe(false)
    const ok = await renameWallet(meta.id, 'Daily')
    expect(ok.ok && ok.metas[0]).toMatchObject({ kind: 'transmitter', label: 'Daily' })
  })
})

describe('Sync, Node and the setting on a Transmitter (OS-FR-4, OS-FR-10)', () => {
  it('Sync is set, changed and removed without re-creating the Wallet', async () => {
    const { meta } = await addTestnet()
    expect((await setTransmitterSync(meta.id, ADDR)).address).toBe(ADDR)
    expect((await setTransmitterSync(meta.id, 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')).address).toBe('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh')
    expect((await setTransmitterSync(meta.id, null)).address).toBeNull()
    expect('syncedAddress' in wallets().get(meta.id)).toBe(false)
    expect(wallets().get(meta.id).lockId).toBe(meta.lockId)
    await expect(setTransmitterSync(meta.id, 'nope')).rejects.toThrow("That doesn't look like a valid XRPL address.")
  })

  it('only a Transmitter can be synced', async () => {
    wallets().set('s', seedRec('s'))
    await expect(setTransmitterSync('s', ADDR)).rejects.toThrow()
  })

  it('Node and Before sending are stored on the Transmitter record', async () => {
    const { meta } = await addTestnet()
    expect((await setWalletNode(meta.id, 'wss://node.example')).node).toBe('wss://node.example')
    expect((await setShowBeforeSending(meta.id, true)).showBeforeSending).toBe(true)
    expect(wallets().get(meta.id)).toMatchObject({ node: 'wss://node.example', showBeforeSending: true })
  })
})

describe('removing and auto-lock with a Transmitter on the device', () => {
  it('removing the last Seed Wallet keeps the Transmitter, its lock and the App PIN', async () => {
    wallets().set('s', seedRec('s'))
    vault().set('lock:Ls', { key: 'lock:Ls', id: 'Ls', openCheck: 'none', autoLockMinutes: 5, hkdfInfo: 'x', pbkdf2: {}, createdAt: 1 })
    vault().set('vault', { key: 'vault', pinSaltB64: 'salt', failedAttempts: 0 })
    const { meta } = await addTestnet()
    const result = await removeWallet('s')
    expect(result).toEqual({ emptied: false, appPin: 'kept' })
    expect(vault().has(`lock:${meta.lockId}`)).toBe(true)
    expect(vault().has('lock:Ls')).toBe(false)
    expect(vault().get('vault').pinSaltB64).toBe('salt')
    expect((await listWallets()).map((w) => w.id)).toEqual([meta.id])
  })

  it('removing the Transmitter takes its lock; the last one empties the device', async () => {
    const { meta } = await addTestnet()
    const result = await removeWallet(meta.id)
    expect(result.emptied).toBe(true)
    expect(wallets().size).toBe(0)
    expect(vault().has(`lock:${meta.lockId}`)).toBe(false)
  })

  it('a Mainnet Transmitter lock keeps the floor: 30 seconds is refused, 5 minutes is set', async () => {
    const { meta } = await addTestnet()
    // Forced: the record and its lock moved to Mainnet (a `none` lock lets the re-proof run without a prompt).
    wallets().set(meta.id, { ...wallets().get(meta.id), network: 'mainnet' })
    const refused = await setLockAutoLock(meta.lockId, 0.5, noPrompts)
    expect(refused.ok).toBe(false)
    expect(vault().get(`lock:${meta.lockId}`).autoLockMinutes).toBe(5)
    expect(await setLockAutoLock(meta.lockId, 15, noPrompts)).toEqual({ ok: true })
    expect(vault().get(`lock:${meta.lockId}`).autoLockMinutes).toBe(15)
  })
})
