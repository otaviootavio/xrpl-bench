import { webcrypto } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Offline signing story 5 (OS-FR-5, OS-FR-6, OS-FR-7): changing a Wallet's kind in
 * the keystore. `idb` is replaced by an in-memory store; the cryptography is real.
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

import { makePinLock, sealRecordUnderPin, storeSeedWallet, type FixtureLock } from './fixtures'
import type { StoredWallet } from '../db'
import {
  changeToOfflineWallet,
  changeToOnlineWallet,
  editChecks,
  KindChangeRefusedError,
  listWallets,
  renameWallet,
  setShowBeforeSending,
  type Prompts,
} from '../keystore'
import { fill } from '@/lib/transmit-words'
import { SAME_ADDRESS_ON_NETWORK } from '@/lib/kind-change-words'

const PIN = '123456'
const pinPrompt = (pin: string | null): Prompts => ({ pin: async () => pin })
const recordOf = (id: string) => h.state.stores.wallets.get(id) as StoredWallet
const snapshot = () => JSON.stringify([...h.state.stores.wallets.entries()])
const metaOf = async (id: string) => (await listWallets()).find((w) => w.id === id)

/** Prompts that count how often the PIN is asked. */
function counting(pin: string | null = PIN) {
  const calls = { pin: 0 }
  const prompts: Prompts = { pin: async () => (calls.pin++, pin) }
  return { calls, prompts }
}

async function refusal(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (err) {
    if (err instanceof KindChangeRefusedError) return err.reason
    throw err
  }
  throw new Error('expected a refusal')
}

let lock: FixtureLock

beforeEach(async () => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
  lock = await makePinLock(PIN)
})
afterEach(() => vi.unstubAllGlobals())

/** An Online Wallet with a custom Node and the setting on. */
async function onlineWallet() {
  const { meta, seed } = await storeSeedWallet('Daily', lock)
  h.state.stores.wallets.set(meta.id, { ...recordOf(meta.id), views: [{ walletId: meta.id, network: 'testnet', node: 'wss://node.example', showBeforeSending: true }] })
  return { meta, seed }
}

describe('Change to an offline wallet (OS-FR-5, OS-FR-7)', () => {
  it('makes the one view Offline with the mark, drops its Node and its setting, and touches nothing else', async () => {
    const { meta } = await onlineWallet()
    const { views: _before, ...restBefore } = recordOf(meta.id)
    const after = await changeToOfflineWallet(meta.id)
    const { views, ...restAfter } = recordOf(meta.id)
    expect(views).toEqual([{ walletId: meta.id, network: 'testnet', kind: 'offline', wasOnline: true }])
    // Address, Seed ciphertext, lock, checks: unchanged.
    expect(restAfter).toEqual(restBefore)
    expect(after).toMatchObject({ id: meta.id, kind: 'offline', wasOnline: true, network: 'testnet', address: meta.address })
    expect(after.node).toBeUndefined()
    expect(after.showBeforeSending).toBeUndefined()
  })

  it('refuses a Passkey-Derived Seed (OS-FR-8), a Wallet already Offline, and a Transmitter; nothing is written', async () => {
    const { meta } = await storeSeedWallet('Derived', lock)
    const { encryptedSeed: _e, ...rest } = recordOf(meta.id)
    h.state.stores.wallets.set(meta.id, { ...rest, seedMethod: 'passkey-derived', derived: { credentialIdB64: 'c', rpId: 'localhost', ordinal: '0' } })
    const off = await storeSeedWallet('Off', lock)
    h.state.stores.wallets.set(off.meta.id, { ...recordOf(off.meta.id), views: [{ walletId: off.meta.id, network: 'testnet', kind: 'offline' }] })
    h.state.stores.wallets.set('tx', { recordKind: 'transmitter', id: 'tx', label: 'T', createdAt: 3, lockId: lock.lockId, openCheck: 'pin', network: 'testnet', verifier: { ivB64: 'iv', ciphertextB64: 'ct' } })
    const before = snapshot()
    expect(await refusal(changeToOfflineWallet(meta.id))).toBe('passkey-derived')
    expect(await refusal(changeToOfflineWallet(off.meta.id))).toBe('not-online')
    expect(await refusal(changeToOfflineWallet('tx'))).toBe('transmitter')
    expect(snapshot()).toBe(before)
  })

  it('refuses a record with a second view: one record holds one kind', async () => {
    const { meta } = await storeSeedWallet('Shared', lock)
    h.state.stores.wallets.set(meta.id, {
      ...recordOf(meta.id),
      views: [{ walletId: meta.id, network: 'testnet' }, { walletId: 'ctl', network: 'testnet', accountAddress: 'rOther' }],
    })
    const before = snapshot()
    expect(await refusal(changeToOfflineWallet(meta.id))).toBe('shared-record')
    expect(await refusal(changeToOfflineWallet('ctl'))).toBe('shared-record')
    expect(snapshot()).toBe(before)
  })
})

describe('Change to an online wallet (OS-FR-6)', () => {
  it('runs the Signing Check, then drops the kind, takes the Node chosen and keeps the Network and the mark', async () => {
    const { meta } = await onlineWallet()
    await changeToOfflineWallet(meta.id)
    const result = await changeToOnlineWallet(meta.id, { node: 'wss://other.example' }, { openKey: lock.key, prompts: pinPrompt(null) })
    expect(result.status).toBe('ok')
    expect(recordOf(meta.id).views).toEqual([{ walletId: meta.id, network: 'testnet', wasOnline: true, node: 'wss://other.example' }])
    const meta2 = await metaOf(meta.id)
    expect(meta2).toMatchObject({ kind: 'online', network: 'testnet', node: 'wss://other.example' })
    // The mark is kept on the record but shown only on an Offline Wallet.
    expect(meta2 && 'wasOnline' in meta2).toBe(false)
  })

  it('with the built-in Nodes, stores no Node', async () => {
    const { meta } = await onlineWallet()
    await changeToOfflineWallet(meta.id)
    await changeToOnlineWallet(meta.id, {}, { openKey: lock.key, prompts: pinPrompt(null) })
    expect(recordOf(meta.id).views).toEqual([{ walletId: meta.id, network: 'testnet', wasOnline: true }])
  })

  it('a PIN Signing Check that is cancelled or wrong writes nothing', async () => {
    const { meta, seed } = await storeSeedWallet('Sealed', lock)
    await sealRecordUnderPin(meta.id, seed, PIN)
    await changeToOfflineWallet(meta.id)
    const before = snapshot()
    expect(await changeToOnlineWallet(meta.id, {}, { openKey: lock.key, prompts: pinPrompt(null) })).toEqual({ status: 'cancelled' })
    expect(await changeToOnlineWallet(meta.id, {}, { openKey: lock.key, prompts: pinPrompt('000000') })).toMatchObject({ status: 'wrong-credential', kind: 'pin' })
    expect(snapshot()).toBe(before)
    const { calls, prompts } = counting()
    expect((await changeToOnlineWallet(meta.id, {}, { openKey: null, prompts })).status).toBe('ok')
    expect(calls.pin).toBe(1)
  })

  it('a Standard Wallet with a closed lock is not changed', async () => {
    const { meta } = await onlineWallet()
    await changeToOfflineWallet(meta.id)
    const before = snapshot()
    await expect(changeToOnlineWallet(meta.id, {}, { openKey: null, prompts: pinPrompt(null) })).rejects.toThrow('Wallet is locked.')
    expect(snapshot()).toBe(before)
  })

  it('refuses the same address on the same Network as another Wallet (P-35), before any prompt', async () => {
    const { meta, seed } = await storeSeedWallet('Sealed', lock)
    await sealRecordUnderPin(meta.id, seed, PIN)
    await changeToOfflineWallet(meta.id)
    // Forced: FR-93 refuses this at create and import, so only an older or edited record holds it.
    const twin = { ...recordOf(meta.id), id: 'twin', views: [{ walletId: 'twin', network: 'testnet' as const }] }
    h.state.stores.wallets.set('twin', twin)
    const before = snapshot()
    const { calls, prompts } = counting()
    expect(await changeToOnlineWallet(meta.id, {}, { openKey: lock.key, prompts })).toEqual({ status: 'refused', reason: fill(SAME_ADDRESS_ON_NETWORK, 'Testnet') })
    expect(calls.pin).toBe(0)
    expect(snapshot()).toBe(before)
  })

  it('the same address on another Network, or a Transmitter synced to it, is not a duplicate', async () => {
    const { meta } = await onlineWallet()
    await changeToOfflineWallet(meta.id)
    h.state.stores.wallets.set('main', { ...recordOf(meta.id), id: 'main', views: [{ walletId: 'main', network: 'mainnet' }] })
    h.state.stores.wallets.set('tx', { recordKind: 'transmitter', id: 'tx', label: 'T', createdAt: 3, lockId: lock.lockId, openCheck: 'pin', network: 'testnet', syncedAddress: meta.address, verifier: { ivB64: 'iv', ciphertextB64: 'ct' } })
    expect((await changeToOnlineWallet(meta.id, {}, { openKey: lock.key, prompts: pinPrompt(null) })).status).toBe('ok')
  })

  it('refuses an Online Wallet and a Transmitter (a Transmitter never changes kind)', async () => {
    const { meta } = await onlineWallet()
    h.state.stores.wallets.set('tx', { recordKind: 'transmitter', id: 'tx', label: 'T', createdAt: 3, lockId: lock.lockId, openCheck: 'pin', network: 'testnet', verifier: { ivB64: 'iv', ciphertextB64: 'ct' } })
    expect(await refusal(changeToOnlineWallet(meta.id, {}, { openKey: lock.key, prompts: pinPrompt(null) }))).toBe('not-offline')
    expect(await refusal(changeToOnlineWallet('tx', {}, { openKey: lock.key, prompts: pinPrompt(null) }))).toBe('transmitter')
  })
})

describe('the Was-online mark lasts (OS-FR-7)', () => {
  it('survives online and back offline, and the setting stripped at the change reads off when Online again', async () => {
    const { meta } = await onlineWallet()
    await changeToOfflineWallet(meta.id)
    await changeToOnlineWallet(meta.id, {}, { openKey: lock.key, prompts: pinPrompt(null) })
    expect((await metaOf(meta.id))?.showBeforeSending).toBeUndefined()
    await setShowBeforeSending(meta.id, true)
    const again = await changeToOfflineWallet(meta.id)
    expect(again.wasOnline).toBe(true)
    expect(recordOf(meta.id).views).toEqual([{ walletId: meta.id, network: 'testnet', kind: 'offline', wasOnline: true }])
  })

  it('is kept through a rename and an edit of the checks', async () => {
    const { meta } = await onlineWallet()
    await changeToOfflineWallet(meta.id)
    expect((await renameWallet(meta.id, 'Savings')).ok).toBe(true)
    const edited = await editChecks(meta.id, { signing: { kind: 'pin' } }, { prompts: pinPrompt(PIN), pin: PIN })
    expect(edited.status).toBe('ok')
    expect(recordOf(meta.id).views[0]).toMatchObject({ kind: 'offline', wasOnline: true })
    expect(await metaOf(meta.id)).toMatchObject({ label: 'Savings', wasOnline: true, signingCheck: 'pin' })
  })

  it('is never on a view that was not changed (create and import write none: import-stored-wallet.test.ts pins the exact view)', async () => {
    const { meta } = await storeSeedWallet('Fresh', lock)
    h.state.stores.wallets.set(meta.id, { ...recordOf(meta.id), views: [{ walletId: meta.id, network: 'testnet', kind: 'offline' }] })
    expect(await metaOf(meta.id)).not.toHaveProperty('wasOnline')
  })
})
