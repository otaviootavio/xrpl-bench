import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { ECDSA, Wallet } from 'xrpl'

/**
 * Story 12.1 / AD-18: a Wallet is a view over a Seed record. `idb` has no
 * implementation outside a browser, so its `openDB` is replaced by an in-memory
 * database whose transactions commit or roll back whole.
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

import {
  listKeyWallets as listWallets,
  removeWallet,
  setWalletNode,
  openSigner,
  signingHandleFor,
  unavailablePrompts,
} from '../keystore'
import { aesEncrypt } from '../aes'

async function masterKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

/** A Standard Seed record on a lock of its own, one view on mainnet, its algorithm
 * not yet resolved: what a first creation leaves until the first decryption. */
async function seedRecord(id: string, key: CryptoKey, wallet: Wallet) {
  const sealed = await aesEncrypt(key, wallet.seed!)
  return {
    id,
    label: `Wallet ${id}`,
    address: wallet.address,
    encryptedSeed: { ivB64: sealed.ivB64, ciphertextB64: sealed.ciphertextB64 },
    createdAt: 1,
    seedMethod: 'stored' as const,
    algorithm: 'unresolved' as const,
    lockId: `lock-${id}`,
    openCheck: 'pin' as const,
    signingCheck: 'standard' as const,
    views: [{ walletId: id, network: 'mainnet' as const }],
  }
}

let key: CryptoKey
const ctx = () => ({ openKey: key, prompts: unavailablePrompts })
/** The address of the Wallet a Standard open gives a Signer for. */
async function openedAddress(id: string) {
  const meta = (await listWallets()).find((m) => m.id === id)!
  const handle = await signingHandleFor(id, ctx(), meta.address)
  ;(await handle.open()).dispose()
  return handle.address
}
beforeEach(async () => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
  key = await masterKey()
})

async function seedWallets(...wallets: Wallet[]) {
  const records = []
  for (const [i, w] of wallets.entries()) {
    const r = await seedRecord(`w${i + 1}`, key, w)
    h.state.stores.wallets.set(r.id, r)
    records.push(r)
  }
  return records
}

/** A record with no `views`: invalid (FR-95), so it is not shown, and it stays as it is. */
async function seedViewlessWallet(wallet: Wallet) {
  const { views: _views, ...record } = await seedRecord('w1', key, wallet)
  h.state.stores.wallets.set('w1', record)
  return record
}

describe('a Seed record missing a required field is not shown (FR-95)', () => {
  it.each(['id', 'label', 'address', 'createdAt', 'lockId', 'seedMethod', 'algorithm', 'openCheck', 'signingCheck', 'views'] as const)(
    'lists nothing for a record with no %s, leaves it stored, and still lists the complete one',
    async (field) => {
      const [good] = await seedWallets(Wallet.generate())
      const { [field]: _omitted, ...broken } = await seedRecord('w2', key, Wallet.generate())
      h.state.stores.wallets.set('w2', broken)
      expect((await listWallets()).map((m) => m.id)).toEqual([good.id])
      expect(h.state.stores.wallets.get('w2')).toEqual(broken)
    },
  )

  it.each([undefined, 'either', 'other'])('lists nothing for a record whose Open Check is %s, and an empty views list shows nothing', async (openCheck) => {
    await seedWallets(Wallet.generate())
    h.state.stores.wallets.set('w2', { ...(await seedRecord('w2', key, Wallet.generate())), openCheck })
    h.state.stores.wallets.set('w3', { ...(await seedRecord('w3', key, Wallet.generate())), views: [] })
    expect((await listWallets()).map((m) => m.id)).toEqual(['w1'])
  })

  it.each([
    ['seedMethod', 'banana'],
    ['algorithm', 'banana'],
    ['signingCheck', 'banana'],
  ])('lists nothing for a record with an unknown %s', async (field, value) => {
    h.state.stores.wallets.set('w1', { ...(await seedRecord('w1', key, Wallet.generate())), [field]: value })
    expect(await listWallets()).toEqual([])
  })

  it.each([
    ['no walletId', { network: 'mainnet' }],
    ['a bad network', { walletId: 'w1', network: 'signet' }],
  ])('lists nothing for a record with a view with %s', async (_name, view) => {
    h.state.stores.wallets.set('w1', { ...(await seedRecord('w1', key, Wallet.generate())), views: [view] })
    expect(await listWallets()).toEqual([])
  })

  it('lists a record that is complete with algorithm unresolved and Open Check none', async () => {
    h.state.stores.wallets.set('w1', { ...(await seedRecord('w1', key, Wallet.generate())), openCheck: 'none' })
    expect((await listWallets()).map((m) => [m.id, m.openCheck, m.algorithm])).toEqual([['w1', 'none', 'unresolved']])
  })
})

describe('first decrypt resolves the algorithm', () => {
  it.each([
    ['ed25519', Wallet.generate()],
    ['secp256k1', Wallet.generate(ECDSA.secp256k1)],
  ])('stores %s once the derived address matches', async (algorithm, w) => {
    const [r] = await seedWallets(w)
    expect(h.state.stores.wallets.get('w1').algorithm).toBe('unresolved')
    expect(await openedAddress('w1')).toBe(w.address)
    const after = h.state.stores.wallets.get('w1')
    expect(after.algorithm).toBe(algorithm)
    expect(after.encryptedSeed).toEqual(r.encryptedSeed)
  })

  it('throws and stores nothing when the derived address differs from the stored one', async () => {
    const [r] = await seedWallets(Wallet.generate())
    h.state.stores.wallets.set('w1', { ...r, address: Wallet.generate().address })
    await expect(openSigner('w1', ctx())).rejects.toThrow(/does not match/)
    expect(h.state.stores.wallets.get('w1').algorithm).toBe('unresolved')
  })
})

describe('a dropped FR-75 controlled view (OS-FR-19, FR-95, story 12)', () => {
  const CONTROLLED = { walletId: 'c1', network: 'testnet', accountAddress: 'rControlledAccount1111111111111111' }

  it('is not listed, not opened, and the own view is listed and signs as before', async () => {
    const w = Wallet.generate()
    const [r] = await seedWallets(w)
    h.state.stores.wallets.set('w1', { ...r, views: [...r.views, CONTROLLED] })
    expect((await listWallets()).map((m) => m.id)).toEqual(['w1'])
    await expect(openSigner('c1', ctx())).rejects.toThrow(/not found/i)
    expect(await openedAddress('w1')).toBe(w.address)
  })

  it('removing the own view deletes the whole record: the dropped view keeps no Seed on the device', async () => {
    const [r] = await seedWallets(Wallet.generate())
    h.state.stores.wallets.set('w1', { ...r, views: [...r.views, CONTROLLED] })
    await removeWallet('c1')
    expect(h.state.stores.wallets.get('w1').views).toHaveLength(2)
    await removeWallet('w1')
    expect(h.state.stores.wallets.has('w1')).toBe(false)
  })

  it('a write that rewrites the views does not write it back', async () => {
    const [r] = await seedWallets(Wallet.generate())
    h.state.stores.wallets.set('w1', { ...r, views: [...r.views, CONTROLLED] })
    await setWalletNode('w1', 'wss://node.example.com')
    expect(h.state.stores.wallets.get('w1').views).toEqual([{ ...r.views[0], node: 'wss://node.example.com' }])
  })
})

describe('review follow-ups', () => {
  it('does not list a record with no views', async () => {
    const r = await seedViewlessWallet(Wallet.generate())
    expect(await listWallets()).toEqual([])
    expect(h.state.stores.wallets.get('w1')).toEqual(r)
  })

  it('still signs and reveals when persisting the resolved algorithm fails', async () => {
    const w = Wallet.generate()
    await seedWallets(w)
    h.state.failNextPutOn = 'wallets'
    expect(await openedAddress('w1')).toBe(w.address)
    expect(h.state.stores.wallets.get('w1').algorithm).toBe('unresolved')
  })
})

describe('a Node is a field of one Wallet view (story 2)', () => {
  it('a Wallet carries no node by default, so it uses the built-in Nodes', async () => {
    await seedWallets(Wallet.generate())
    expect((await listWallets())[0].node).toBeUndefined()
  })

  it('stores a node on that view only, touching no ciphertext, and clears it', async () => {
    const [r] = await seedWallets(Wallet.generate())
    const meta = await setWalletNode('w1', 'wss://node.example.com')
    expect(meta.node).toBe('wss://node.example.com')
    expect((await listWallets()).find((m) => m.id === 'w1')?.node).toBe('wss://node.example.com')
    expect(h.state.stores.wallets.get('w1').encryptedSeed).toEqual(r.encryptedSeed)

    expect((await setWalletNode('w1', undefined)).node).toBeUndefined()
    expect(h.state.stores.wallets.get('w1').views.find((v: { walletId: string }) => v.walletId === 'w1')).not.toHaveProperty('node')
  })

  it('refuses to set a node on a record with no views, persisting no view', async () => {
    await seedViewlessWallet(Wallet.generate())
    await expect(setWalletNode('w1', 'wss://node.example.com')).rejects.toThrow(/not found/)
    expect(h.state.stores.wallets.get('w1').views).toBeUndefined()
  })

  it('canonicalises a node, and throws on one that could carry a secret or is not wss', async () => {
    await seedWallets(Wallet.generate())
    expect((await setWalletNode('w1', 'WSS://Node.Example.com/')).node).toBe('wss://node.example.com')
    for (const bad of ['wss://u:p@x.example.com', 'wss://x.example.com/?k=v', 'wss://x.example.com/#f', 'ws://x.example.com']) {
      await expect(setWalletNode('w1', bad)).rejects.toThrow(/wss:\/\//)
    }
    expect((await listWallets())[0].node).toBe('wss://node.example.com')
  })
})
