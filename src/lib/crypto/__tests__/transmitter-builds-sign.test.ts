import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OS-FR-18: the Offline Wallet signs an Unsigned Transaction with real cryptography; `idb` runs in memory, as in `offline-round-sign.test.ts`. */
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

import { AccountSetAsfFlags, decode, TrustSetFlags, verifySignature, Wallet } from 'xrpl'
import { mutateStoredWallet, type StoredWallet } from '../db'
import { noteSigned, signedListOf, type Prompts } from '../keystore'
import { makePinLock, storeSeedWallet, type FixtureLock } from './fixtures'
import { decodeSigned, encodeUnsigned } from '@/lib/qr-codec'
import { judgeUnsigned, recordOfJudged, signJudged, type JudgedUnsigned } from '@/lib/unsigned-judge'
import { buildHashOf } from '@/lib/offline-round'
import { latestSameBuild } from '@/lib/signed-list'
import { FeeAboveCapError } from '@/lib/xrpl/writes'

const prompts: Prompts = { pin: async () => null }
const ISSUER = Wallet.generate().address
const DEST = Wallet.generate().address
const LEDGER = 22_400_000

async function offlineWallet(lock: FixtureLock) {
  const { meta } = await storeSeedWallet('Savings', lock, 'testnet')
  await mutateStoredWallet(meta.seedId, (r: StoredWallet) => ({ ...r, views: r.views.map((v) => ({ ...v, kind: 'offline' as const })) }))
  return { ...meta, kind: 'offline' as const }
}

function judged(tx: Record<string, unknown>, address: string): JudgedUnsigned {
  const j = judgeUnsigned(encodeUnsigned({ network: 'testnet', tx, ledgerIndex: LEDGER }).text, { network: 'testnet', address })
  if (!j.ok) throw new Error(j.reason)
  return j
}

function blobOf(text: string): Record<string, unknown> {
  const envelope = decodeSigned(text)
  if (!envelope.ok) throw new Error('bad envelope')
  expect(envelope.value.network).toBe('testnet')
  expect(verifySignature(envelope.value.tx_blob)).toBe(true)
  return decode(envelope.value.tx_blob) as unknown as Record<string, unknown>
}

beforeEach(() => {
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
})

describe('Offline Wallet signs an Unsigned Transaction (OS-FR-18)', () => {
  it('a token Payment: the decoded blob is exactly the judged transaction, with no NetworkID', async () => {
    const lock = await makePinLock('2468')
    const meta = await offlineWallet(lock)
    const tx = {
      TransactionType: 'Payment',
      Account: meta.address,
      Destination: ISSUER,
      Amount: { currency: 'USD', issuer: ISSUER, value: '5' },
      DestinationTag: 9,
      Fee: '12',
      Sequence: 777,
      LastLedgerSequence: LEDGER + 150,
    }
    const signed = await signJudged(meta, judged(tx, meta.address), { openKey: lock.key, prompts }, () => 1_700_000_000_000)
    const blob = blobOf(signed.text)
    expect(blob).toMatchObject({ ...tx })
    expect(blob.NetworkID).toBeUndefined()
    expect(blob.Flags ?? 0).toBe(0)
    const allowed = [...Object.keys(tx), 'Flags', 'SigningPubKey', 'TxnSignature']
    expect(Object.keys(blob).filter((k) => !allowed.includes(k))).toEqual([])
    expect(signed).toMatchObject({ sequence: 777, fee: '12', lastLedgerSequence: LEDGER + 150, signedAt: 1_700_000_000_000 })
  })

  it('a TrustSet keeps tfSetNoRipple; a warned Memos and SendMax are in the signed blob', async () => {
    const lock = await makePinLock('2468')
    const meta = await offlineWallet(lock)
    const trust = await signJudged(
      meta,
      judged({ TransactionType: 'TrustSet', Account: meta.address, LimitAmount: { currency: 'USD', issuer: ISSUER, value: '500' }, Flags: TrustSetFlags.tfSetNoRipple, Fee: '12', Sequence: 5, LastLedgerSequence: LEDGER + 150 }, meta.address),
      { openKey: lock.key, prompts },
    )
    expect(blobOf(trust.text)).toMatchObject({ TransactionType: 'TrustSet', Flags: TrustSetFlags.tfSetNoRipple, LimitAmount: { currency: 'USD', issuer: ISSUER, value: '500' } })

    const memo = await signJudged(
      meta,
      judged({ TransactionType: 'Payment', Account: meta.address, Destination: DEST, Amount: '1000000', SendMax: '2000000', Memos: [{ Memo: { MemoData: '6869' } }], Fee: '12', Sequence: 6, LastLedgerSequence: LEDGER + 400 }, meta.address),
      { openKey: lock.key, prompts },
    )
    const b = blobOf(memo.text)
    expect(b.SendMax).toBe('2000000')
    expect(b.Memos).toEqual([{ Memo: { MemoData: '6869' } }])
    expect(b.LastLedgerSequence).toBe(LEDGER + 400)
  })

  it('master key off: AccountSet SetFlag asfDisableMaster and nothing else', async () => {
    const lock = await makePinLock('2468')
    const meta = await offlineWallet(lock)
    const s = await signJudged(meta, judged({ TransactionType: 'AccountSet', Account: meta.address, SetFlag: AccountSetAsfFlags.asfDisableMaster, Fee: '12', Sequence: 8, LastLedgerSequence: LEDGER + 150 }, meta.address), {
      openKey: lock.key,
      prompts,
    })
    const b = blobOf(s.text)
    expect(b.SetFlag).toBe(AccountSetAsfFlags.asfDisableMaster)
    expect(b.ClearFlag).toBeUndefined()
  })

  it('refuses a Fee over the cap before the signer opens, even if a judgement were bypassed', async () => {
    const lock = await makePinLock('2468')
    const meta = await offlineWallet(lock)
    const j = judged({ TransactionType: 'Payment', Account: meta.address, Destination: DEST, Amount: '1', Fee: '12', Sequence: 1, LastLedgerSequence: LEDGER + 150 }, meta.address)
    const opened = vi.fn()
    const p = { pin: async () => (opened(), null) }
    await expect(signJudged(meta, { ...j, tx: { ...j.tx, Fee: '10001' } }, { openKey: lock.key, prompts: p })).rejects.toBeInstanceOf(FeeAboveCapError)
    expect(opened).not.toHaveBeenCalled()
  })

  it('the record joins the signed list, and an Offline-builds Build of the same payment finds it (Same Build across routes)', async () => {
    const lock = await makePinLock('2468')
    const meta = await offlineWallet(lock)
    const j = judged({ TransactionType: 'Payment', Account: meta.address, Destination: DEST, Amount: '3000000', Fee: '12', Sequence: 41, LastLedgerSequence: LEDGER + 150 }, meta.address)
    const signed = await signJudged(meta, j, { openKey: lock.key, prompts })
    await noteSigned(meta.id, recordOfJudged(j, signed))
    const list = await signedListOf(meta.id)
    const later = buildHashOf({ type: 'payment', account: meta.address, destination: DEST, amountDrops: '3000000' })
    expect(latestSameBuild(list, later)).toMatchObject({ sequence: 41, hash: signed.hash, ledgerIndex: LEDGER, lastLedgerSequence: LEDGER + 150 })
  })
})
