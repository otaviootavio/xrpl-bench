import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Story 9 / AD-41: `renameWallet` on an in-memory `idb`. */
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

import { commitWalletEdit, mutateStoredWallet, seedStamp, type StoredWallet } from '../db'
import { renameWallet, listWallets } from '../keystore'
import { readFileSync } from 'node:fs'

const rec = (id: string, label: string, extra: Partial<StoredWallet> = {}): StoredWallet =>
  ({
    id,
    label,
    address: `r${id}`,
    createdAt: 1,
    lockId: `L${id}`,
    rev: 3,
    encryptedSeed: { ivB64: 'iv', ciphertextB64: `ct-${id}` },
    views: [
      { walletId: id, network: 'testnet' },
      { walletId: `${id}2`, network: 'devnet' },
    ],
    ...extra,
  }) as StoredWallet
const put = (r: StoredWallet) => h.state.stores.wallets.set(r.id, structuredClone(r))
const row = (id: string) => h.state.stores.wallets.get(id) as StoredWallet

beforeEach(() => {
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
  put(rec('a', 'Alpha'))
  put(rec('b', 'Beta'))
})

describe('renameWallet', () => {
  it('writes the label only, leaves rev and everything else, returns the projection of that Seed', async () => {
    const before = row('a')
    const result = await renameWallet('a', '  Savings   account ')
    expect(result.ok).toBe(true)
    expect(row('a')).toEqual({ ...before, label: 'Savings account' })
    expect(row('a').rev).toBe(3)
    expect(row('b').label).toBe('Beta')
    if (result.ok) {
      expect(result.metas.map((m) => [m.id, m.seedId, m.label, m.network])).toEqual([
        ['a', 'a', 'Savings account', 'testnet'],
        ['a2', 'a', 'Savings account', 'devnet'],
      ])
      expect(result.metas).toEqual((await listWallets()).filter((m) => m.seedId === 'a'))
    }
  })

  it('touches no lock, no vault record and makes no ledger call', async () => {
    const vault = JSON.stringify([...h.state.stores.vault.entries()])
    const spy = vi.fn()
    vi.stubGlobal('WebSocket', spy)
    await renameWallet('a', 'Savings')
    vi.unstubAllGlobals()
    expect(spy).not.toHaveBeenCalled()
    expect(JSON.stringify([...h.state.stores.vault.entries()])).toBe(vault)
  })

  it('refuses empty, too long and a duplicate (case-insensitive) and writes nothing', async () => {
    const snap = JSON.stringify([...h.state.stores.wallets.entries()])
    expect(await renameWallet('a', '   ')).toEqual({ ok: false, reason: 'empty' })
    expect(await renameWallet('a', 'x'.repeat(41))).toEqual({ ok: false, reason: 'too-long' })
    expect(await renameWallet('a', 'bETA')).toEqual({ ok: false, reason: 'duplicate' })
    expect(JSON.stringify([...h.state.stores.wallets.entries()])).toBe(snap)
  })

  it('a duplicate that appeared in storage after the dialog validated is refused', async () => {
    put(rec('c', 'Gamma'))
    expect(await renameWallet('a', 'Gamma')).toEqual({ ok: false, reason: 'duplicate' })
  })

  it('a name another Seed holds is refused, whatever else already shares it', async () => {
    put(rec('c', 'Beta'))
    expect(await renameWallet('a', 'Beta')).toEqual({ ok: false, reason: 'duplicate' })
    expect((await renameWallet('b', 'Beta 2')).ok).toBe(true)
  })

  it('a failed write reports write-failed and changes nothing', async () => {
    const snap = JSON.stringify([...h.state.stores.wallets.entries()])
    h.state.failNextPutOn = 'wallets'
    expect(await renameWallet('a', 'Savings')).toEqual({ ok: false, reason: 'write-failed' })
    expect(JSON.stringify([...h.state.stores.wallets.entries()])).toBe(snap)
  })

  it('an unknown Seed is write-failed', async () => {
    expect(await renameWallet('nope', 'Savings')).toEqual({ ok: false, reason: 'write-failed' })
  })

  it('a rename and commitWalletEdit interleaved: the new name survives, neither aborts', async () => {
    const stale = row('a')
    const stamp = seedStamp(stale)
    const lockStampAbsent = 'absent'
    const edit = () =>
      commitWalletEdit({
        seedId: 'a',
        expectSeedStamp: stamp,
        expectLockId: 'La',
        expectLockStamp: lockStampAbsent,
        next: (current) => ({ ...current, openCheck: 'pin' }),
      })
    // rename lands between the edit's read and its write
    expect((await renameWallet('a', 'Renamed')).ok).toBe(true)
    await expect(edit()).resolves.toBeDefined()
    expect(row('a').label).toBe('Renamed')
    expect(row('a').rev).toBe(4)
    // and the other way round: a rename after an edit
    await edit().catch(() => {}) // stale stamp now; the point is the rename after it
    expect((await renameWallet('a', 'Renamed again')).ok).toBe(true)
    expect(row('a').label).toBe('Renamed again')
    expect(row('a').rev).toBe(4)
  })

  it('mutateStoredWallet is the only write path and the rule is shared', () => {
    const src = readFileSync('src/lib/crypto/keystore.ts', 'utf8')
    const body = src.slice(src.indexOf('export async function renameWallet'), src.indexOf('/** Removes one Wallet'))
    expect(body).toMatch(/validateWalletName\(/)
    expect(body).toMatch(/mutateStoredWallet\(/)
    expect(body).not.toMatch(/rev:/)
    void mutateStoredWallet
  })
})
