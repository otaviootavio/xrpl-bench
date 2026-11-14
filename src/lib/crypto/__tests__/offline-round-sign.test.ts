import { beforeEach, describe, expect, it, vi } from 'vitest'

/** OS-FR-16: the Offline Wallet signs a round with real cryptography; `idb` runs in memory, as in `show-before-sending-setting.test.ts`. */
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

import { AccountSetAsfFlags, decode, deriveAddress, TrustSetFlags, verifySignature, Wallet } from 'xrpl'
import { mutateStoredWallet, type StoredWallet } from '../db'
import { ledgerSeenOf, noteLedgerSeen, NotAnOfflineWalletError, offlineSigningHandleFor, signingHandleFor, NotAnOnlineWalletError, type Prompts } from '../keystore'
import { makePinLock, storeSeedWallet, type FixtureLock } from './fixtures'
import { assembleTransaction, OFFLINE_LEDGER_WINDOW, signRound, type OfflineBuild, type PaymentBuild } from '@/lib/offline-round'
import { decodeSigned } from '@/lib/qr-codec'
import { FeeAboveCapError } from '@/lib/xrpl/writes'
import { MAX_FEE_DROPS } from '@/lib/xrpl/money'

const prompts: Prompts = { pin: async () => null }
const DESTINATION = Wallet.generate().address

async function offlineWallet(lock: FixtureLock, network: 'testnet' | 'mainnet' = 'testnet') {
  const { meta, seed } = await storeSeedWallet('Savings', lock, network)
  await mutateStoredWallet(meta.seedId, (r: StoredWallet) => ({ ...r, views: r.views.map((v) => ({ ...v, kind: 'offline' as const })) }))
  return { meta: { ...meta, kind: 'offline' as const }, seed }
}

const buildFor = (account: string, extra: Partial<PaymentBuild> = {}): PaymentBuild => ({
  type: 'payment',
  account,
  destination: DESTINATION,
  amountDrops: '2000000',
  destinationTag: 7,
  ...extra,
})

beforeEach(() => {
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
})

describe('Offline Wallet signs a round (OS-FR-16, OS-FR-11)', () => {
  it('signs the kept Build plus the Data to Sign only; the decoded blob carries every guard', async () => {
    const lock = await makePinLock('2468')
    const { meta } = await offlineWallet(lock)
    const data = { sequence: 4242, fee: '12', ledger_index: 9_000_000 }
    const signed = await signRound(meta, buildFor(meta.address), data, { openKey: lock.key, prompts }, () => 1_700_000_000_000)

    // The envelope names the Wallet's Network (OS-FR-11).
    const envelope = decodeSigned(signed.text)
    expect(envelope.ok && envelope.value.network).toBe('testnet')
    const blob = envelope.ok ? envelope.value.tx_blob : ''
    expect(verifySignature(blob)).toBe(true)
    const tx = decode(blob)
    expect(tx).toMatchObject({
      TransactionType: 'Payment',
      Account: meta.address,
      Destination: DESTINATION,
      Amount: '2000000',
      DestinationTag: 7,
      Sequence: 4242,
      Fee: '12',
      LastLedgerSequence: 9_000_000 + OFFLINE_LEDGER_WINDOW,
    })
    expect(OFFLINE_LEDGER_WINDOW).toBe(150)
    // Mainnet, Testnet and Devnet omit NetworkID; nothing else from the online device either.
    expect(tx.NetworkID).toBeUndefined()
    const allowed = ['Account', 'Amount', 'Destination', 'DestinationTag', 'Fee', 'Flags', 'LastLedgerSequence', 'Sequence', 'SigningPubKey', 'TransactionType', 'TxnSignature']
    expect(Object.keys(tx).filter((k) => !allowed.includes(k))).toEqual([])
    expect(signed.lastLedgerSequence).toBe(tx.LastLedgerSequence)
    expect(signed.signedAt).toBe(1_700_000_000_000)
  })

  it('refuses a Fee over the cap before any signature (the SDK never runs)', async () => {
    const lock = await makePinLock('2468')
    const { meta } = await offlineWallet(lock)
    const over = (BigInt(MAX_FEE_DROPS) + 1n).toString()
    await expect(signRound(meta, buildFor(meta.address), { sequence: 1, fee: over, ledger_index: 10 }, { openKey: lock.key, prompts })).rejects.toBeInstanceOf(FeeAboveCapError)
  })

  it('refuses a Build for another Account than the one the Wallet signs for', async () => {
    const lock = await makePinLock('2468')
    const { meta } = await offlineWallet(lock)
    await expect(signRound(meta, buildFor(DESTINATION), { sequence: 1, fee: '12', ledger_index: 10 }, { openKey: lock.key, prompts })).rejects.toThrow(/not for this wallet/)
  })

  it('signs only for an Offline view; an Online view never gets this handle, nor an Offline one the Online handle', async () => {
    const lock = await makePinLock('2468')
    const { meta: online } = await storeSeedWallet('Daily', lock)
    await expect(offlineSigningHandleFor(online.id, { openKey: lock.key, prompts })).rejects.toBeInstanceOf(NotAnOfflineWalletError)
    const { meta: offline } = await offlineWallet(lock)
    await expect(signingHandleFor(offline.id, { openKey: lock.key, prompts })).rejects.toBeInstanceOf(NotAnOnlineWalletError)
    expect((await offlineSigningHandleFor(offline.id, { openKey: lock.key, prompts })).address).toBe(offline.address)
  })

  it('the assembled transaction is the Build plus Sequence, Fee and its own window', () => {
    expect(assembleTransaction(buildFor('rA'), { sequence: 5, fee: '10', ledger_index: 100 })).toEqual({
      TransactionType: 'Payment',
      Account: 'rA',
      Destination: DESTINATION,
      Amount: '2000000',
      DestinationTag: 7,
      Sequence: 5,
      Fee: '10',
      LastLedgerSequence: 250,
    })
  })
})

describe('highest-seen ledger on the record (OS-FR-16, P-14)', () => {
  it('is only raised, never lowered, and survives on the view (no secret)', async () => {
    const lock = await makePinLock('2468')
    const { meta } = await offlineWallet(lock)
    expect(await ledgerSeenOf(meta.id)).toBeNull()
    await noteLedgerSeen(meta.id, 100, 1000)
    await noteLedgerSeen(meta.id, 90, 2000)
    expect(await ledgerSeenOf(meta.id)).toEqual({ index: 100, at: 1000 })
    await noteLedgerSeen(meta.id, 120, 3000)
    expect(await ledgerSeenOf(meta.id)).toEqual({ index: 120, at: 3000 })
  })

  it('is not written on an Online view', async () => {
    const lock = await makePinLock('2468')
    const { meta } = await storeSeedWallet('Daily', lock)
    await noteLedgerSeen(meta.id, 100, 1000)
    expect(await ledgerSeenOf(meta.id)).toBeNull()
  })
})

/** The decoded, verified blob of a signed round. */
function blobOf(text: string): Record<string, unknown> {
  const envelope = decodeSigned(text)
  if (!envelope.ok) throw new Error('bad envelope')
  expect(verifySignature(envelope.value.tx_blob)).toBe(true)
  return decode(envelope.value.tx_blob)
}
const BASE = ['Account', 'Fee', 'Flags', 'LastLedgerSequence', 'Sequence', 'SigningPubKey', 'TransactionType', 'TxnSignature']
const extraKeys = (tx: Record<string, unknown>, own: string[]) => Object.keys(tx).filter((k) => !BASE.includes(k) && !own.includes(k))

describe('Offline Wallet signs trust lines and key actions (OS-FR-16, OS-FR-21, story 8)', () => {
  const data = { sequence: 77, fee: '12', ledger_index: 9_000_000 }

  it('a TrustSet: the online fields and tfSetNoRipple, nothing else from the online device', async () => {
    const lock = await makePinLock('2468')
    const { meta } = await offlineWallet(lock)
    const build: OfflineBuild = { type: 'trust-line', account: meta.address, currency: 'USD', issuer: DESTINATION, limit: '100.5' }
    const tx = blobOf((await signRound(meta, build, data, { openKey: lock.key, prompts })).text)
    expect(tx).toMatchObject({
      TransactionType: 'TrustSet',
      Account: meta.address,
      LimitAmount: { currency: 'USD', issuer: DESTINATION, value: '100.5' },
      Flags: TrustSetFlags.tfSetNoRipple,
      Sequence: 77,
      Fee: '12',
      LastLedgerSequence: 9_000_000 + OFFLINE_LEDGER_WINDOW,
    })
    expect(extraKeys(tx, ['LimitAmount'])).toEqual([])
    expect(tx.NetworkID).toBeUndefined()
  })

  it('a SetRegularKey sets the address typed here; the key state never enters the blob; remove has no RegularKey', async () => {
    const lock = await makePinLock('2468')
    const { meta } = await offlineWallet(lock)
    const newKey = Wallet.generate().address
    const withState = { ...data, key_state: { regular_key: DESTINATION, master_key: 'on' as const, signer_list: null } }
    // The Data to Sign as received, key state and all: only Sequence, Fee and the index are used.
    expect(assembleTransaction({ type: 'regular-key', account: meta.address, regularKey: newKey }, withState)).toEqual({
      TransactionType: 'SetRegularKey', Account: meta.address, RegularKey: newKey, Sequence: 77, Fee: '12', LastLedgerSequence: 9_000_150,
    })
    const set = blobOf((await signRound(meta, { type: 'regular-key', account: meta.address, regularKey: newKey }, data, { openKey: lock.key, prompts })).text)
    expect(set).toMatchObject({ TransactionType: 'SetRegularKey', RegularKey: newKey, Sequence: 77 })
    expect(extraKeys(set, ['RegularKey'])).toEqual([])
    const removed = blobOf((await signRound(meta, { type: 'regular-key', account: meta.address, regularKey: null }, data, { openKey: lock.key, prompts })).text)
    expect(removed.TransactionType).toBe('SetRegularKey')
    expect(removed.RegularKey).toBeUndefined()
    expect(extraKeys(removed, [])).toEqual([])
  })

  it('master key off is SetFlag asfDisableMaster, on is ClearFlag, and nothing else', async () => {
    const lock = await makePinLock('2468')
    const { meta } = await offlineWallet(lock)
    const off = blobOf((await signRound(meta, { type: 'master-key', account: meta.address, enable: false }, data, { openKey: lock.key, prompts })).text)
    expect(off).toMatchObject({ TransactionType: 'AccountSet', SetFlag: AccountSetAsfFlags.asfDisableMaster })
    expect(AccountSetAsfFlags.asfDisableMaster).toBe(4)
    expect(extraKeys(off, ['SetFlag'])).toEqual([])
    const on = blobOf((await signRound(meta, { type: 'master-key', account: meta.address, enable: true }, data, { openKey: lock.key, prompts })).text)
    expect(on).toMatchObject({ TransactionType: 'AccountSet', ClearFlag: AccountSetAsfFlags.asfDisableMaster })
    expect(extraKeys(on, ['ClearFlag'])).toEqual([])
  })

  it('a view that signs for another Account (its Regular Key) signs the turn-on for that Account with its own key', async () => {
    const lock = await makePinLock('2468')
    const { meta, seed } = await offlineWallet(lock)
    const account = Wallet.generate().address
    // The Signs-for state story 10 records; forced here on the stored view.
    await mutateStoredWallet(meta.seedId, (r: StoredWallet) => ({ ...r, views: r.views.map((v) => ({ ...v, accountAddress: account })) }))
    expect((await offlineSigningHandleFor(meta.id, { openKey: lock.key, prompts })).address).toBe(account)
    const tx = blobOf((await signRound(meta, { type: 'master-key', account, enable: true }, data, { openKey: lock.key, prompts })).text)
    expect(tx).toMatchObject({ TransactionType: 'AccountSet', Account: account, ClearFlag: 4 })
    // Signed by the Regular Key's own key pair, not the Account's.
    expect(deriveAddress(String(tx.SigningPubKey))).toBe(Wallet.fromSeed(seed).address)
    expect(deriveAddress(String(tx.SigningPubKey))).not.toBe(account)
  })
})
