import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'

/**
 * OS-FR-20 (story 10): a key that Signs for another Account. Real cryptography;
 * `idb` and WebAuthn are
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
    assertPasskeyAndDeriveBits: async (_id: string, salt: BufferSource) => {
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

import { decode, deriveAddress, verifySignature, Wallet } from 'xrpl'
import { mutateStoredWallet, type StoredWallet } from '../db'
import {
  assertSignedFor,
  createStoredWallet,
  importDuplicateReason,
  importStoredWallet,
  listKeyWallets,
  setSignsFor,
  SignedForWrongAccountError,
  SignsForRefusedError,
  type ImportStoredWalletInput,
  type Prompts,
} from '../keystore'
import { makePinLock, storeSeedWallet } from './fixtures'
import { buildHashOf, judgeDataToSign, requestText, signRound, signedRecordOf, type PaymentBuild } from '@/lib/offline-round'
import { decodeRequest, decodeSigned, encodeDataToSign, encodeUnsigned } from '@/lib/qr-codec'
import { judgeUnsigned, recordOfJudged, signJudged } from '@/lib/unsigned-judge'
import { latestSameBuild } from '@/lib/signed-list'
import { previewSignedTransaction } from '@/lib/xrpl/writes'
import { INVALID_ADDRESS } from '@/lib/same-address'

const PIN = '123456'
const prompts: Prompts = { pin: async () => null }
const DEST = Wallet.generate().address
const LEDGER = 22_400_000
/** The Account a Regular Key signs for, and another. */
const X = Wallet.generate().address
const Y = Wallet.generate().address
const P35 = 'Another wallet on this device has this address on Testnet.'

const base = (seed: string, extra: Partial<ImportStoredWalletInput> = {}): ImportStoredWalletInput => ({
  label: `Imported ${Math.random()}`,
  network: 'testnet',
  openCheck: 'pin',
  autoLockMinutes: 5,
  signing: 'standard',
  seed,
  passkey: 'yes',
  ...extra,
})

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
})

/** A stored Offline Wallet for `seed` that Signs for `account` (the quiz's write). */
async function offlineSigner(account: string | undefined, seed = Wallet.generate().seed!) {
  const lock = await makePinLock('2468')
  const { meta } = await storeSeedWallet(`Savings ${Math.random()}`, lock, 'testnet', seed)
  await mutateStoredWallet(meta.seedId, (r: StoredWallet) => ({ ...r, views: r.views.map((v) => ({ ...v, kind: 'offline' as const, ...(account ? { signsFor: account } : {}) })) }))
  const found = (await listKeyWallets()).find((m) => m.id === meta.id)!
  return { meta: found, lock }
}

describe('the Signs-for Account on the record (OS-FR-20)', () => {
  it('create and import store it on the view; address is the Account, keyAddress the key', async () => {
    const seed = Wallet.generate().seed!
    const key = Wallet.fromSeed(seed).address
    const imported = ok(await importStoredWallet(base(seed, { signsFor: X, kind: 'offline' }), { pin: PIN })).meta
    expect([imported.address, imported.keyAddress, imported.kind]).toEqual([X, key, 'offline'])
    expect(h.state.stores.wallets.get(imported.id).views[0]).toMatchObject({ signsFor: X, kind: 'offline' })
    const created = ok(await createStoredWallet({ label: 'New', network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', autoLockMinutes: 5, signing: 'standard', passkey: 'yes', signsFor: Y }, { pin: PIN })).meta
    expect(created.address).toBe(Y)
    expect(created.keyAddress).not.toBe(Y)
    expect(h.state.stores.wallets.get(created.id).address).toBe(created.keyAddress)
  })

  it('the key address itself, or an empty value, is stored as no Signs for', async () => {
    const seed = Wallet.generate().seed!
    const meta = ok(await importStoredWallet(base(seed, { signsFor: Wallet.fromSeed(seed).address }), { pin: PIN })).meta
    expect(meta.address).toBe(meta.keyAddress)
    expect(h.state.stores.wallets.get(meta.id).views[0]).not.toHaveProperty('signsFor')
  })

  it('a value that is not an address is refused in the shipped words, and nothing is written', async () => {
    const result = await importStoredWallet(base(Wallet.generate().seed!, { signsFor: 'rNOTANADDRESS' }), { pin: PIN })
    expect(result).toEqual({ status: 'refused', reason: INVALID_ADDRESS })
    expect(h.state.stores.wallets.size).toBe(0)
  })

  it('a stored Signs-for value that is not an address hides the record (fail closed, never read as the key)', async () => {
    const { meta } = await offlineSigner(undefined)
    await mutateStoredWallet(meta.seedId, (r) => ({ ...r, views: r.views.map((v) => ({ ...v, signsFor: 'garbage' })) }))
    expect((await listKeyWallets()).find((m) => m.id === meta.id)).toBeUndefined()
  })
})

describe("FR-93 compares (Network, Signs-for Account, key) (OS-FR-20, product-prd-changes)", () => {
  it('the same key for the same Account on the same Network is refused: P-35 for a Signs-for collision, today\'s words otherwise', async () => {
    const seed = Wallet.generate().seed!
    ok(await importStoredWallet(base(seed, { signsFor: X }), { pin: PIN }))
    expect(await importDuplicateReason(seed, 'testnet', X)).toBe(P35)
    expect(await importStoredWallet(base(seed, { signsFor: X }), { pin: PIN })).toEqual({ status: 'refused', reason: P35 })
    // The same key for its own Account, or another, is another Wallet.
    expect(await importDuplicateReason(seed, 'testnet')).toBeNull()
    ok(await importStoredWallet(base(seed), { pin: PIN }))
    expect(await importDuplicateReason(seed, 'testnet')).toBe('This key is already on this device on Testnet.')
    expect(await importDuplicateReason(seed, 'testnet', Y)).toBeNull()
    // Another Network is another Wallet (FR-93).
    expect(await importDuplicateReason(seed, 'devnet', X)).toBeNull()
  })

  it('two different keys may sign for one Account (the master and its Regular Key: Flow 7 on one device)', async () => {
    const master = await offlineSigner(undefined)
    const regular = await offlineSigner(undefined)
    const meta = await setSignsFor(regular.meta.id, master.meta.address)
    expect(meta.address).toBe(master.meta.address)
  })
})

describe('setSignsFor: the Signs for plate and P-54 (OS-FR-20)', () => {
  it('sets, changes and removes it, touching nothing else on the view', async () => {
    const { meta } = await offlineSigner(undefined)
    const before = structuredClone(h.state.stores.wallets.get(meta.seedId))
    expect((await setSignsFor(meta.id, X)).address).toBe(X)
    expect((await setSignsFor(meta.id, Y)).address).toBe(Y)
    const removed = await setSignsFor(meta.id, null)
    expect(removed.address).toBe(meta.keyAddress)
    expect(h.state.stores.wallets.get(meta.seedId)).toEqual(before)
    // The key's own address is a removal too.
    await setSignsFor(meta.id, X)
    expect((await setSignsFor(meta.id, meta.keyAddress)).address).toBe(meta.keyAddress)
    expect(h.state.stores.wallets.get(meta.seedId).views[0]).not.toHaveProperty('signsFor')
  })

  it('refuses a duplicate with P-35, a shared record, a bad address and a Transmitter; nothing is written', async () => {
    const seed = Wallet.generate().seed!
    const a = await offlineSigner(X, seed)
    const lock = await makePinLock('2468')
    // The same Seed as a second record on the same Network, signing for itself.
    const { meta: b } = await storeSeedWallet('B', lock, 'testnet', seed)
    const stored = () => JSON.stringify([...h.state.stores.wallets.values()])
    const snapshot = stored()
    await expect(setSignsFor(b.id, X)).rejects.toMatchObject({ refusal: 'duplicate', message: P35 })
    await expect(setSignsFor(b.id, 'rBAD')).rejects.toMatchObject({ refusal: 'invalid' })
    // A record with two views (today's controlled views, FR-75) is left alone until story 12.
    await mutateStoredWallet(a.meta.seedId, (r) => ({ ...r, views: [...r.views, { walletId: 'controlled', network: 'testnet', accountAddress: Y }] }))
    await expect(setSignsFor(a.meta.id, null)).rejects.toBeInstanceOf(SignsForRefusedError)
    await expect(setSignsFor(a.meta.id, null)).rejects.toMatchObject({ refusal: 'shared-record' })
    await mutateStoredWallet(a.meta.seedId, (r) => ({ ...r, views: r.views.filter((v) => v.walletId !== 'controlled') }))
    expect(stored()).toBe(snapshot)
  })

  it("today's controlled views keep working: the second view still reads its accountAddress", async () => {
    const { meta } = await offlineSigner(undefined)
    await mutateStoredWallet(meta.seedId, (r) => ({ ...r, views: [{ ...r.views[0], kind: undefined }, { walletId: 'controlled', network: 'testnet', accountAddress: Y }] }))
    const controlled = (await listKeyWallets()).find((m) => m.id === 'controlled')!
    expect([controlled.address, controlled.keyAddress]).toEqual([Y, meta.keyAddress])
  })
})

describe('a Signs-for Wallet on the Offline-builds route, on real signed blobs (OS-FR-20, OS-FR-16)', () => {
  const build = (account: string): PaymentBuild => ({ type: 'payment', account, destination: DEST, amountDrops: '2000000' })

  it('the request carries the Signs-for Account; the signed blob is for it and signed by this key; the Transmit step accepts it', async () => {
    const { meta, lock } = await offlineSigner(X)
    expect(meta.address).toBe(X)
    // The Data-to-Sign Request (route-checks "What travels by QR").
    const request = decodeRequest(requestText('testnet', build(meta.address), 'a'.repeat(32)))
    expect(request.ok && [request.value.account, request.value.tx.Account]).toEqual([X, X])

    const signed = await signRound(meta, build(meta.address), { sequence: 7, fee: '12', ledger_index: LEDGER }, { openKey: lock.key, prompts })
    const envelope = decodeSigned(signed.text)
    if (!envelope.ok) throw new Error('bad envelope')
    const blob = envelope.value.tx_blob
    const tx = decode(blob) as Record<string, unknown>
    expect(verifySignature(blob)).toBe(true)
    expect(tx.Account).toBe(X)
    expect(deriveAddress(tx.SigningPubKey as string)).toBe(meta.keyAddress)
    // The Transmit step expects the Account, never the signing key's own address (OS-FR-20).
    expect(previewSignedTransaction('testnet', { txBlob: blob, network: 'testnet' }, X).account).toBe(X)
    expect(() => previewSignedTransaction('testnet', { txBlob: blob, network: 'testnet' }, meta.keyAddress)).toThrow()
    // The signed list records the Account; a Same Build lookup for another Account finds nothing.
    const record = signedRecordOf(build(X), signed, LEDGER)
    expect(record.account).toBe(X)
    expect(latestSameBuild([record], buildHashOf(build(X)), { account: X, keyAddress: meta.keyAddress })).toBe(record)
    expect(latestSameBuild([record], buildHashOf(build(Y)), { account: Y, keyAddress: meta.keyAddress })).toBeNull()
  })

  it('Data to Sign for a Build of another Account is refused in P-17 naming both Accounts', () => {
    const kept = { requestId: 'a'.repeat(32), buildHash: buildHashOf(build(Y)) }
    const data = encodeDataToSign({ network: 'testnet', requestId: kept.requestId, buildHash: kept.buildHash, sequence: 1, fee: '12', ledgerIndex: LEDGER }).text
    expect(judgeDataToSign(data, { network: 'testnet', address: X }, kept, build(Y))).toEqual({ ok: false, reason: `This transaction is for ${Y}. This wallet signs for ${X}.` })
  })

  it('the handle refuses a transaction for another Account before the Signing Check', async () => {
    const { meta, lock } = await offlineSigner(X)
    await expect(signRound(meta, build(meta.keyAddress), { sequence: 7, fee: '12', ledger_index: LEDGER }, { openKey: lock.key, prompts })).rejects.toThrow()
  })
})

describe('a Signs-for Wallet on the Transmitter-builds route (OS-FR-20, OS-FR-18)', () => {
  const unsigned = (account: string) => encodeUnsigned({ network: 'testnet', tx: { TransactionType: 'Payment', Account: account, Destination: DEST, Amount: '1000000', Fee: '12', Sequence: 3, LastLedgerSequence: LEDGER + 150 }, ledgerIndex: LEDGER }).text

  it('an Unsigned Transaction for the Signs-for Account is signed by this key for that Account', async () => {
    const { meta, lock } = await offlineSigner(X)
    const judged = judgeUnsigned(unsigned(X), meta)
    if (!judged.ok) throw new Error(judged.reason)
    const signed = await signJudged(meta, judged, { openKey: lock.key, prompts })
    const envelope = decodeSigned(signed.text)
    if (!envelope.ok) throw new Error('bad envelope')
    const tx = decode(envelope.value.tx_blob) as Record<string, unknown>
    expect([tx.Account, deriveAddress(tx.SigningPubKey as string)]).toEqual([X, meta.keyAddress])
    expect(recordOfJudged(judged, signed).account).toBe(X)
  })

  it("one for the key's own address is refused (P-17): this Wallet signs for X", async () => {
    const { meta } = await offlineSigner(X)
    expect(judgeUnsigned(unsigned(meta.keyAddress), meta)).toMatchObject({ ok: false, reason: `This transaction is for ${meta.keyAddress}. This wallet signs for ${X}.` })
  })
})

describe('assertSignedFor: the signing key is this Wallet\'s key (OS-FR-20)', () => {
  it('passes for the right Account and key, and throws for either wrong', async () => {
    const key = Wallet.generate()
    const forX = Wallet.fromSeed(key.seed!, { masterAddress: X })
    const { tx_blob } = forX.sign({ TransactionType: 'AccountSet', Account: X, Fee: '12', Sequence: 1, LastLedgerSequence: 10 })
    expect(() => assertSignedFor(tx_blob, X, key.address)).not.toThrow()
    expect(() => assertSignedFor(tx_blob, Y, key.address)).toThrow(SignedForWrongAccountError)
    expect(() => assertSignedFor(tx_blob, X, Wallet.generate().address)).toThrow(SignedForWrongAccountError)
    expect(() => assertSignedFor('zz', X, key.address)).toThrow(SignedForWrongAccountError)
  })
})
