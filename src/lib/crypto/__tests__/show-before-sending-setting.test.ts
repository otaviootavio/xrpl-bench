import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OS-FR-10, CAP-6: "Show the signed transaction before sending" on the record. `idb` runs in memory, as in `wallet-kind.test.ts`. */
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
import { listWallets, renameWallet, setShowBeforeSending, SettingNotForOfflineError, setWalletNode, signingHandleFor, type Prompts } from '../keystore'

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
const settings = async () => Object.fromEntries((await listWallets()).map((m) => [m.id, m.showBeforeSending === true]))
const noPin: Prompts = { pin: async () => null }
const SIGNED = { txBlob: 'AB', hash: 'H', network: 'testnet' as const, lastLedgerSequence: 100 }

const transmitter = (id: string, extra: Record<string, unknown> = {}) => ({
  recordKind: 'transmitter',
  id,
  label: `Transmitter ${id}`,
  createdAt: 2,
  lockId: `L${id}`,
  openCheck: 'none',
  network: 'testnet',
  verifier: { ivB64: 'iv', ciphertextB64: 'ct' },
  ...extra,
})

beforeEach(() => {
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
})

describe('"Show the signed transaction before sending" on the record (OS-FR-10)', () => {
  it('is off for an existing record, and reading it writes nothing', async () => {
    put(rec('old'))
    const before = JSON.stringify([...h.state.stores.wallets.entries()])
    expect(await settings()).toEqual({ old: false })
    expect(JSON.stringify([...h.state.stores.wallets.entries()])).toBe(before)
  })

  it('is on only for a stored `true`, and never for an Offline Wallet', async () => {
    put(rec('on', { showBeforeSending: true }))
    put(rec('str', { showBeforeSending: 'yes' }))
    // A Transmitter has a record of its own (story 4); the setting reads the same way there.
    h.state.stores.wallets.set('tx', transmitter('tx', { showBeforeSending: true }))
    put(rec('off', { kind: 'offline', showBeforeSending: true }))
    expect(await settings()).toEqual({ on: true, str: false, tx: true, off: false })
  })

  it('turns on and off on a Transmitter record, storing `true` or nothing (story 4)', async () => {
    h.state.stores.wallets.set('tx', transmitter('tx'))
    expect((await setShowBeforeSending('tx', true)).showBeforeSending).toBe(true)
    expect(h.state.stores.wallets.get('tx').showBeforeSending).toBe(true)
    expect((await setShowBeforeSending('tx', false)).showBeforeSending).toBeUndefined()
    expect('showBeforeSending' in h.state.stores.wallets.get('tx')).toBe(false)
  })

  it('turns on and off for one Wallet only, storing `true` or nothing', async () => {
    put(rec('s'))
    put(rec('t'))
    expect((await setShowBeforeSending('s', true)).showBeforeSending).toBe(true)
    expect(row('s').views).toEqual([{ walletId: 's', network: 'testnet', showBeforeSending: true }])
    expect(row('t').views).toEqual([{ walletId: 't', network: 'testnet' }])
    expect((await setShowBeforeSending('s', false)).showBeforeSending).toBeUndefined()
    expect(row('s').views[0]).toEqual({ walletId: 's', network: 'testnet' })
  })

  it('leaves the other view of the same record untouched, on and off', async () => {
    put({ ...rec('s'), views: [{ walletId: 's', network: 'testnet' }, { walletId: 's2', network: 'testnet', accountAddress: 'rOther' }] })
    await setShowBeforeSending('s2', true)
    expect(row('s').views).toEqual([{ walletId: 's', network: 'testnet' }, { walletId: 's2', network: 'testnet', accountAddress: 'rOther', showBeforeSending: true }])
    await setShowBeforeSending('s', true)
    await setShowBeforeSending('s2', false)
    expect(row('s').views).toEqual([{ walletId: 's', network: 'testnet', showBeforeSending: true }, { walletId: 's2', network: 'testnet', accountAddress: 'rOther' }])
  })

  it('refuses to turn it on for an Offline Wallet, writing nothing; turning it off is allowed', async () => {
    put(rec('off', { kind: 'offline' }))
    const before = JSON.stringify(row('off'))
    await expect(setShowBeforeSending('off', true)).rejects.toBeInstanceOf(SettingNotForOfflineError)
    expect(JSON.stringify(row('off'))).toBe(before)
    await expect(setShowBeforeSending('off', false)).resolves.toMatchObject({ kind: 'offline' })
  })

  it('survives a rename and a Node change', async () => {
    put(rec('a', { showBeforeSending: true }))
    await renameWallet('a', 'Daily')
    await setWalletNode('a', 'wss://node.example')
    expect(row('a').views[0]).toMatchObject({ showBeforeSending: true, node: 'wss://node.example' })
    expect(await settings()).toEqual({ a: true })
  })
})

describe('the signing handle carries the review only when the setting is on (OS-FR-10)', () => {
  it('off: the handle has no review, so a write goes to the Transmit step as before', async () => {
    put(rec('a'))
    const handle = await signingHandleFor('a', { openKey: null, prompts: { ...noPin, reviewSignedTransaction: async () => true } })
    expect(handle.reviewBeforeSending).toBeUndefined()
  })

  it('on: the review asks the prompts, and answers what they answer', async () => {
    put(rec('a', { showBeforeSending: true }))
    const asked: unknown[] = []
    const handle = await signingHandleFor('a', {
      openKey: null,
      prompts: { ...noPin, reviewSignedTransaction: async (s) => (asked.push(s), false) },
    })
    expect(await handle.reviewBeforeSending?.(SIGNED)).toBe(false)
    expect(asked).toEqual([SIGNED])
  })

  it('on with no reviewer: every send is declined (fail closed)', async () => {
    put(rec('a', { showBeforeSending: true }))
    const handle = await signingHandleFor('a', { openKey: null, prompts: noPin })
    expect(handle.reviewBeforeSending).toBeDefined()
    expect(await handle.reviewBeforeSending?.(SIGNED)).toBe(false)
  })
})
