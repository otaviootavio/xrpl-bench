import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OS-FR-1, CAP-1: a Wallet's kind on the record. `idb` runs in memory, as in `rename-wallet.test.ts`. */
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
import { listWallets, renameWallet, setWalletNode } from '../keystore'

const rec = (id: string, view: Record<string, unknown> = {}): StoredWallet =>
  ({
    id,
    label: `Wallet ${id}`,
    address: `r${id}`,
    createdAt: 1,
    lockId: `L${id}`,
    seedMethod: 'stored',
    algorithm: 'ed25519',
    openCheck: 'pin',
    signingCheck: 'standard',
    encryptedSeed: { ivB64: 'iv', ciphertextB64: `ct-${id}` },
    views: [{ walletId: id, network: 'testnet', ...view }],
  }) as StoredWallet
const put = (r: StoredWallet) => h.state.stores.wallets.set(r.id, structuredClone(r))
const row = (id: string) => h.state.stores.wallets.get(id) as StoredWallet
const kinds = async () => Object.fromEntries((await listWallets()).map((m) => [m.id, m.kind]))

beforeEach(() => {
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
})

describe('the kind of a Wallet (OS-FR-1)', () => {
  it('reads a record with no kind as an Online Wallet, and writes nothing', async () => {
    put(rec('old'))
    const before = JSON.stringify([...h.state.stores.wallets.entries()])
    const [meta] = await listWallets()
    expect(meta.kind).toBe('online')
    // No migration: the stored record is exactly what it was, with no kind added.
    expect(JSON.stringify([...h.state.stores.wallets.entries()])).toBe(before)
    expect('kind' in row('old').views[0]).toBe(false)
  })

  it('reads an Offline view as itself; a Seed view that says Transmitter is not listed (story 4: a Transmitter holds no Seed)', async () => {
    put(rec('off', { kind: 'offline' }))
    put(rec('tx', { kind: 'transmitter' }))
    expect(await kinds()).toEqual({ off: 'offline' })
  })

  it('does not list a view with an unknown kind, and never reads it as Online (fail closed)', async () => {
    put(rec('a'))
    put(rec('hot', { kind: 'hot' }))
    // `online` is never written: absent is Online. A stored literal is not a known value.
    put(rec('lit', { kind: 'online' }))
    put(rec('num', { kind: 1 }))
    put(rec('nul', { kind: null }))
    expect(await kinds()).toEqual({ a: 'online' })
  })

  it('drops only the unknown view of a Seed, not its other views', async () => {
    put({ ...rec('s'), views: [{ walletId: 's', network: 'testnet' }, { walletId: 's2', network: 'devnet', kind: 'later' } as never] })
    expect((await listWallets()).map((m) => m.id)).toEqual(['s'])
  })

  it('keeps the kind through a rename and a Node change', async () => {
    put(rec('off', { kind: 'offline' }))
    const renamed = await renameWallet('off', 'Savings')
    expect(renamed.ok && renamed.metas.map((m) => m.kind)).toEqual(['offline'])
    expect(row('off').views[0].kind).toBe('offline')
    const meta = await setWalletNode('off', 'wss://node.example')
    expect(meta.kind).toBe('offline')
    expect(row('off').views[0]).toMatchObject({ kind: 'offline', node: 'wss://node.example' })
    expect(await kinds()).toEqual({ off: 'offline' })
  })
})
