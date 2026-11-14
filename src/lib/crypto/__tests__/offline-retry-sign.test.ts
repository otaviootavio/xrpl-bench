import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OS-FR-16 retry: the signed list on the record and the Sequence each retry case signs with, with real cryptography; `idb` runs in memory, as in `offline-round-sign.test.ts`. */
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


import { decode, Wallet } from 'xrpl'
import { listStoredWallets, mutateStoredWallet, type StoredWallet } from '../db'
import { NotAnOfflineWalletError, noteSigned, SignedListCorruptError, signedListOf, subscribeSignedList, type Prompts } from '../keystore'
import { makePinLock, storeSeedWallet, type FixtureLock } from './fixtures'
import { buildHashOf, OFFLINE_LEDGER_WINDOW, signedRecordOf, signRound, type PaymentBuild } from '@/lib/offline-round'
import { decodeSigned } from '@/lib/qr-codec'
import { latestSameBuild, retryCaseOf, type SignedRecord } from '@/lib/signed-list'

const prompts: Prompts = { pin: async () => null }
const DESTINATION = Wallet.generate().address

async function offlineWallet(lock: FixtureLock) {
  const { meta } = await storeSeedWallet('Savings', lock, 'testnet')
  await mutateStoredWallet(meta.seedId, (r: StoredWallet) => ({ ...r, views: r.views.map((v) => ({ ...v, kind: 'offline' as const })) }))
  return { ...meta, kind: 'offline' as const }
}
const buildFor = (account: string): PaymentBuild => ({ type: 'payment', account, destination: DESTINATION, amountDrops: '2000000', destinationTag: 7 })
const blobOf = (text: string) => {
  const d = decodeSigned(text)
  if (!d.ok) throw new Error('not a signed code')
  return decode(d.value.tx_blob)
}

beforeEach(() => {
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
})

describe('the signed list on the Offline Wallet\'s record (OS-FR-16)', () => {
  it('appends one record per signing, holds public facts only, and survives as stored (no secret, no blob)', async () => {
    const lock = await makePinLock('2468')
    const meta = await offlineWallet(lock)
    expect(await signedListOf(meta.id)).toEqual([])
    const heard: string[] = []
    const off = subscribeSignedList((id) => heard.push(id))
    const build = buildFor(meta.address)
    const signed = await signRound(meta, build, { sequence: 11, fee: '12', ledger_index: 500 }, { openKey: lock.key, prompts }, () => 1000)
    await noteSigned(meta.id, signedRecordOf(build, signed, 500))
    off()
    const list = await signedListOf(meta.id)
    expect(list).toEqual([{ buildHash: buildHashOf(build), sequence: 11, hash: signed.hash, lastLedgerSequence: 500 + OFFLINE_LEDGER_WINDOW, ledgerIndex: 500, signedAt: 1000 }])
    expect(heard).toEqual([meta.id])
    // On the stored view: exactly these keys, nothing that could sign or be sent.
    const view = (await listStoredWallets())[0].views[0]
    expect(Object.keys(view.signed![0]).sort()).toEqual(['buildHash', 'hash', 'lastLedgerSequence', 'ledgerIndex', 'sequence', 'signedAt'])
    expect(JSON.stringify(view.signed)).not.toContain(blobOf(signed.text).TxnSignature as string)
  })

  it('is refused on an Online view, and a malformed record is never written', async () => {
    const lock = await makePinLock('2468')
    const { meta: online } = await storeSeedWallet('Daily', lock)
    const record: SignedRecord = { buildHash: 'a'.repeat(64), sequence: 1, hash: 'A'.repeat(64), lastLedgerSequence: 10, ledgerIndex: 1, signedAt: 1 }
    await expect(noteSigned(online.id, record)).rejects.toBeInstanceOf(NotAnOfflineWalletError)
    await expect(signedListOf(online.id)).rejects.toBeInstanceOf(NotAnOfflineWalletError)
    const meta = await offlineWallet(lock)
    await expect(noteSigned(meta.id, { ...record, hash: 'not a hash' })).rejects.toThrow()
    expect(await signedListOf(meta.id)).toEqual([])
  })

  it('a failed write throws: the caller then shows nothing (the blob is dropped)', async () => {
    const lock = await makePinLock('2468')
    const meta = await offlineWallet(lock)
    h.state.failNextPutOn = 'wallets'
    const record: SignedRecord = { buildHash: 'a'.repeat(64), sequence: 1, hash: 'A'.repeat(64), lastLedgerSequence: 10, ledgerIndex: 1, signedAt: 1 }
    await expect(noteSigned(meta.id, record)).rejects.toThrow()
    expect(await signedListOf(meta.id)).toEqual([])
  })

  it('a malformed stored list is never read as empty and never rewritten (story 7 review)', async () => {
    const lock = await makePinLock('2468')
    const meta = await offlineWallet(lock)
    const good: SignedRecord = { buildHash: 'b'.repeat(64), sequence: 2, hash: 'B'.repeat(64), lastLedgerSequence: 20, ledgerIndex: 2, signedAt: 2 }
    const next: SignedRecord = { ...good, sequence: 3, hash: 'C'.repeat(64) }
    for (const damaged of [[good, { sequence: 'x' }], { not: 'a list' }]) {
      await mutateStoredWallet(meta.seedId, (r: StoredWallet) => ({ ...r, views: r.views.map((v) => ({ ...v, signed: damaged as never })) }))
      await expect(signedListOf(meta.id)).rejects.toBeInstanceOf(SignedListCorruptError)
      await expect(noteSigned(meta.id, next)).rejects.toBeInstanceOf(SignedListCorruptError)
      // The write aborted: the stored list is exactly as it was, nothing dropped.
      expect((await listStoredWallets())[0].views[0].signed).toEqual(damaged)
    }
  })
})

describe('each retry case signs with the Sequence the table decides; read off the signed blob', () => {
  async function firstSigning() {
    const lock = await makePinLock('2468')
    const meta = await offlineWallet(lock)
    const build = buildFor(meta.address)
    const first = await signRound(meta, build, { sequence: 40, fee: '12', ledger_index: 1000 }, { openKey: lock.key, prompts })
    await noteSigned(meta.id, signedRecordOf(build, first, 1000))
    const earlier = latestSameBuild(await signedListOf(meta.id), buildHashOf(buildFor(meta.address)))!
    const signAgain = async (data: { sequence: number; fee: string; ledger_index: number }, sequence: number) =>
      blobOf((await signRound(meta, build, { ...data, sequence }, { openKey: lock.key, prompts })).text)
    return { first, earlier, signAgain }
  }

  it('the same Build typed again (a new object) has the same Build hash, so the record is found', async () => {
    const { earlier, first } = await firstSigning()
    expect(earlier.hash).toBe(first.hash)
    expect(earlier.lastLedgerSequence).toBe(1150)
  })

  it('case (c), same Sequence and the earlier window open: the earlier Sequence, its own new window; the two share one Sequence', async () => {
    const { first, earlier, signAgain } = await firstSigning()
    const data = { sequence: 40, fee: '12', ledger_index: 1100 }
    const retry = retryCaseOf(earlier, data)
    expect(retry).toEqual({ case: 'same-sequence', sequence: 40 })
    const tx = await signAgain(data, retry.case === 'same-sequence' ? retry.sequence : -1)
    expect(tx.Sequence).toBe(40)
    expect(tx.Sequence).toBe(blobOf(first.text).Sequence)
    expect(tx.LastLedgerSequence).toBe(1100 + OFFLINE_LEDGER_WINDOW)
  })

  it('case (b), the earlier window reached: the received Sequence', async () => {
    const { earlier, signAgain } = await firstSigning()
    const data = { sequence: 40, fee: '12', ledger_index: 1150 }
    const retry = retryCaseOf(earlier, data)
    expect(retry).toEqual({ case: 'passed', sequence: 40 })
    expect((await signAgain(data, 40)).LastLedgerSequence).toBe(1300)
  })

  it('case (a), a higher Sequence: nothing is decided for the user; "This is a new payment" signs with the received Sequence', async () => {
    const { earlier, signAgain } = await firstSigning()
    const data = { sequence: 41, fee: '12', ledger_index: 1100 }
    expect(retryCaseOf(earlier, data)).toEqual({ case: 'higher' })
    expect((await signAgain(data, data.sequence)).Sequence).toBe(41)
  })

  it('a lower Sequence (not in the table) always signs with the earlier Sequence, whatever index came with it', async () => {
    const { earlier, signAgain } = await firstSigning()
    for (const ledger_index of [1100, 1200, 5_000_000]) {
      const retry = retryCaseOf(earlier, { sequence: 39, ledger_index })
      expect(retry).toEqual({ case: 'same-sequence', sequence: 40 })
      expect((await signAgain({ sequence: 39, fee: '12', ledger_index }, retry.case === 'same-sequence' ? retry.sequence : -1)).Sequence).toBe(40)
    }
  })
})
