import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'
import { Wallet } from 'xrpl'

/**
 * Story 9 / AD-18, AD-29: a Controlling Wallet sets a Regular Key, and only a
 * validated change confirmed by a fresh read gives the target a view. `idb` and WebAuthn are
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


// WebAuthn stand-in: the PRF output is a function of the salt, so a different
// salt (a different purpose) gives a different key, as on a real authenticator.
const w = vi.hoisted(() => ({
  mode: 'ok' as 'ok' | 'cancel' | 'no-prf' | 'other-key',
  asserts: 0,
}))
vi.mock('../webauthn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../webauthn')>()
  return {
    ...actual,
    isWebAuthnSupported: () => true,
    registerPasskey: async () => {
      throw new Error('not used')
    },
    assertPasskeyAndDeriveBits: async (_id: string, salt: BufferSource = actual.PRF_SALT) => {
      w.asserts += 1
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


const ledger = vi.hoisted(() => ({
  state: { exists: true, address: '', balanceDrops: '100000000', ownerCount: 0, sequence: 1, requireDestTag: false, disableMasterKey: false, regularKey: undefined as string | undefined },
  /** Reads fail while true. */
  failReads: false,
  /** Reads start failing once a submit has validated. */
  failReadsAfterSubmit: false,
  /** What the next submit does. */
  outcome: { status: 'validated', hash: 'H', resultCode: 'tesSUCCESS' } as any,
  /** What a validated SetRegularKey does to the ledger. */
  applyOnValidated: true,
  submits: [] as { address: string; regularKey: string }[],
  reads: 0,
}))
vi.mock('@/lib/xrpl/reads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/xrpl/reads')>()
  return {
    ...actual,
    fetchAccountState: async (_n: string, address: string) => {
      ledger.reads += 1
      if (ledger.failReads) throw new Error('ledger unreachable')
      return { ...ledger.state, address }
    },
  }
})
vi.mock('@/lib/xrpl/writes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/xrpl/writes')>()
  return {
    ...actual,
    submitSetRegularKey: async (_n: string, signing: any, params: { regularKey: string }) => {
      // The real choke point runs the Signing Check after autofill; here it runs first.
      const signer = await signing.open()
      signer.dispose()
      if (ledger.failReadsAfterSubmit) ledger.failReads = true
      ledger.submits.push({ address: signing.address, regularKey: params.regularKey })
      if (ledger.outcome.status === 'validated' && ledger.applyOnValidated) ledger.state.regularKey = params.regularKey
      return ledger.outcome
    },
  }
})

import { QueryClient } from '@tanstack/react-query'
import { decode } from 'xrpl'
import { setUpVaultAuth } from '../auth'
import {
  generateAndStoreWallet,
  importAndStoreWallet,
  listWallets,
  openSigner,
  sealSeedUnderSigningCheck,
  signingHandleFor,
  unavailablePrompts,
  type Prompts,
  type WalletMeta,
} from '../keystore'
import { confirmControl, controlStatus, eligibleTargets, setRegularKey, setRegularKeyBlockedReason } from '../../control'

const PIN = '123456'
const pinPrompt = (pin: string | null): Prompts => ({ pin: async () => pin })
const failedAttempts = () => h.state.stores.vault.get('vault')?.failedAttempts ?? 0

let key: CryptoKey
let controller: WalletMeta
let target: WalletMeta
let targetSeed: string
let queryClient: QueryClient

beforeEach(async () => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
  w.mode = 'ok'
  key = await setUpVaultAuth('tester', PIN)
  controller = (await generateAndStoreWallet('Controller', key, 'testnet')).meta
  const t = await generateAndStoreWallet('Target', key, 'testnet')
  target = t.meta
  targetSeed = t.seed
  ledger.state = { ...ledger.state, exists: true, disableMasterKey: false, regularKey: undefined }
  ledger.failReads = false
  ledger.failReadsAfterSubmit = false
  ledger.outcome = { status: 'validated', hash: 'H', resultCode: 'tesSUCCESS' }
  ledger.applyOnValidated = true
  ledger.submits = []
  ledger.reads = 0
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

const ctx = (extra: Partial<Parameters<typeof setRegularKey>[2]> = {}) => ({ queryClient, openKey: key, prompts: unavailablePrompts, ...extra })
const viewsOfTarget = () => h.state.stores.wallets.get(target.seedId).views as any[]

describe('controlStatus (AD-29)', () => {
  const base = { exists: true, address: 'rA', balanceDrops: '0', ownerCount: 0, sequence: 1, requireDestTag: false, disableMasterKey: false }
  it('is read from the account: controlled, not-controlled, or unknown', () => {
    expect(controlStatus({ ...base, regularKey: 'rK' }, 'rK')).toBe('controlled')
    expect(controlStatus({ ...base, regularKey: 'rOther' }, 'rK')).toBe('not-controlled')
    expect(controlStatus(base, 'rK')).toBe('not-controlled')
    expect(controlStatus(null, 'rK')).toBe('unknown')
    expect(controlStatus(undefined, 'rK')).toBe('unknown')
    expect(controlStatus({ ...base, exists: false }, 'rK')).toBe('unknown')
  })
  it('blocks the action on an errored, loading, missing or master-off read, in words', () => {
    expect(setRegularKeyBlockedReason(undefined, true)).toMatch(/could not be read/)
    expect(setRegularKeyBlockedReason(undefined, false)).toMatch(/Reading/)
    expect(setRegularKeyBlockedReason({ ...base, exists: false }, false)).toMatch(/not on the ledger/)
    expect(setRegularKeyBlockedReason({ ...base, disableMasterKey: true }, false)).toMatch(/master key turned off/)
    expect(setRegularKeyBlockedReason(base, false)).toBeNull()
  })
  it('stores no control flag on any record', async () => {
    await setRegularKey(controller.id, target.id, ctx())
    expect(JSON.stringify([...h.state.stores.wallets.values()])).not.toMatch(/controlled|regularKey|masterKey/i)
  })
})

describe('setRegularKey', () => {
  it('sets the first Regular Key, and only after the matching re-read gives the target a view of the Account', async () => {
    const result = await setRegularKey(controller.id, target.id, ctx())
    expect(result.status).toBe('controlled')
    expect(ledger.submits).toEqual([{ address: controller.address, regularKey: target.keyAddress }])
    const views = viewsOfTarget()
    expect(views).toHaveLength(2)
    expect(views[1]).toMatchObject({ network: 'testnet', accountAddress: controller.address })
    const metas = await listWallets()
    const claimed = metas.find((m) => m.id === views[1].walletId)!
    expect(claimed.address).toBe(controller.address)
    expect(claimed.keyAddress).toBe(target.keyAddress)
    expect(h.state.stores.wallets.get(controller.seedId).views).toHaveLength(1)
  })

  it('replaces another Regular Key only after a confirm that names it; cancel sends nothing', async () => {
    ledger.state.regularKey = 'rOldKeyOldKeyOldKeyOldKeyOldKey1'
    const asked: string[] = []
    const refused = await setRegularKey(controller.id, target.id, ctx({ confirmReplace: async (k) => (asked.push(k), false) }))
    expect(asked).toEqual(['rOldKeyOldKeyOldKeyOldKeyOldKey1'])
    expect(refused.status).toBe('cancelled')
    expect(ledger.submits).toEqual([])
    expect(viewsOfTarget()).toHaveLength(1)

    const done = await setRegularKey(controller.id, target.id, ctx({ confirmReplace: async () => true }))
    expect(done.status).toBe('controlled')
    expect(ledger.submits).toHaveLength(1)
  })

  it('refuses a replacement it has no way to confirm', async () => {
    ledger.state.regularKey = 'rOldKeyOldKeyOldKeyOldKeyOldKey1'
    expect((await setRegularKey(controller.id, target.id, ctx())).status).toBe('refused')
    expect(ledger.submits).toEqual([])
  })

  it('sends nothing when the target key is already the Regular Key, and claims', async () => {
    ledger.state.regularKey = target.keyAddress
    const result = await setRegularKey(controller.id, target.id, ctx())
    expect(result).toMatchObject({ status: 'controlled', sent: false })
    expect(ledger.submits).toEqual([])
    expect(viewsOfTarget()).toHaveLength(2)
  })

  it('refuses on an errored read, an unfunded Account and a disabled master key, signing nothing', async () => {
    ledger.failReads = true
    expect((await setRegularKey(controller.id, target.id, ctx())).status).toBe('refused')
    ledger.failReads = false
    ledger.state.exists = false
    expect((await setRegularKey(controller.id, target.id, ctx())).status).toBe('refused')
    ledger.state.exists = true
    ledger.state.disableMasterKey = true
    const r = await setRegularKey(controller.id, target.id, ctx())
    expect(r.status).toBe('refused')
    expect(r.status === 'refused' && r.reason).toMatch(/master key turned off/)
    expect(ledger.submits).toEqual([])
    expect(viewsOfTarget()).toHaveLength(1)
  })

  it.each([
    ['tec', { status: 'claimed', hash: 'H', resultCode: 'tecNO_PERMISSION' }],
    ['tef', { status: 'failed', hash: 'H', resultCode: 'tefPAST_SEQ' }],
    ['expired', { status: 'expired', hash: 'H' }],
  ])('adds no view when the result is %s', async (_n, outcome) => {
    ledger.outcome = outcome
    const r = await setRegularKey(controller.id, target.id, ctx())
    expect(r.status).toBe('not-validated')
    expect(viewsOfTarget()).toHaveLength(1)
  })

  it('adds no view when the re-read fails, and check-again runs the read and claim only', async () => {
    ledger.failReadsAfterSubmit = true
    const result = await setRegularKey(controller.id, target.id, ctx())
    expect(result.status).toBe('unconfirmed')
    expect(viewsOfTarget()).toHaveLength(1)
    expect(ledger.submits).toHaveLength(1)

    expect((await confirmControl(controller.id, target.id, { queryClient })).status).toBe('unconfirmed')
    expect(viewsOfTarget()).toHaveLength(1)

    ledger.failReads = false
    expect((await confirmControl(controller.id, target.id, { queryClient })).status).toBe('controlled')
    expect(viewsOfTarget()).toHaveLength(2)
    expect(ledger.submits).toHaveLength(1)
  })

  it('adds no view when the re-read does not show the key', async () => {
    ledger.applyOnValidated = false
    expect((await setRegularKey(controller.id, target.id, ctx())).status).toBe('unconfirmed')
    expect(viewsOfTarget()).toHaveLength(1)
  })

  it('counts a wrong Signing Check PIN, never a cancel, and adds no view for either', async () => {
    await sealSeedUnderSigningCheck(controller.id, 'pin', { openKey: key, prompts: pinPrompt(PIN) })
    const wrong = await setRegularKey(controller.id, target.id, ctx({ prompts: pinPrompt('000000') }))
    expect(wrong.status).toBe('check-failed')
    expect(failedAttempts()).toBe(1)
    const cancelled = await setRegularKey(controller.id, target.id, ctx({ prompts: pinPrompt(null) }))
    expect(cancelled.status).toBe('cancelled')
    expect(failedAttempts()).toBe(1)
    expect(viewsOfTarget()).toHaveLength(1)
    expect((await setRegularKey(controller.id, target.id, ctx({ prompts: pinPrompt(PIN) }))).status).toBe('controlled')
  })

  it('offers only another Seed on the same network, and refuses a controlled Wallet as controller', async () => {
    const other = (await generateAndStoreWallet('Main', key, 'mainnet')).meta
    const all = await listWallets()
    expect(eligibleTargets(controller, all).map((m) => m.id)).toEqual([target.id])
    expect(eligibleTargets(controller, all).map((m) => m.id)).not.toContain(other.id)
    expect((await setRegularKey(controller.id, other.id, ctx())).status).toBe('refused')
    expect((await setRegularKey(controller.id, controller.id, ctx())).status).toBe('refused')
    await setRegularKey(controller.id, target.id, ctx())
    const claimed = (await listWallets()).find((m) => m.seedId === target.seedId && m.address === controller.address)!
    expect((await setRegularKey(claimed.id, controller.id, ctx())).status).toBe('refused')
    expect(eligibleTargets(controller, await listWallets()).map((m) => m.id)).toEqual([])
  })

  it('refuses a duplicate (network, account, key) and writes nothing', async () => {
    await setRegularKey(controller.id, target.id, ctx())
    const before = structuredClone(h.state.stores.wallets.get(target.seedId))
    const again = await setRegularKey(controller.id, target.id, ctx())
    expect(again.status).toBe('refused')
    expect(h.state.stores.wallets.get(target.seedId)).toEqual(before)
  })

  it('a claim that fails to write after validation stays retryable, never "refused"', async () => {
    h.state.failNextPutOn = 'wallets'
    const result = await setRegularKey(controller.id, target.id, ctx())
    expect(result.status).toBe('unconfirmed')
    expect(viewsOfTarget()).toHaveLength(1)
    expect(ledger.submits).toHaveLength(1)
    expect((await confirmControl(controller.id, target.id, { queryClient })).status).toBe('controlled')
    expect(viewsOfTarget()).toHaveLength(2)
    expect(ledger.submits).toHaveLength(1)
  })

  it('lists a Seed once, even when it also has a controlled view', async () => {
    await setRegularKey(controller.id, target.id, ctx())
    const second = (await generateAndStoreWallet('Second', key, 'testnet')).meta
    const rows = eligibleTargets(second, await listWallets()).filter((m) => m.seedId === target.seedId)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(target.id)
  })

  it('refuses importing the same Seed on the same network twice', async () => {
    await expect(importAndStoreWallet('Copy', targetSeed, key, 'testnet')).rejects.toThrow(/already/)
  })
})

describe('a controlled Wallet signs (AD-18)', () => {
  it('signs as the Account with the target key, and reads the Account', async () => {
    await setRegularKey(controller.id, target.id, ctx())
    const claimed = (await listWallets()).find((m) => m.seedId === target.seedId && m.address === controller.address)!
    const handle = await signingHandleFor(claimed.id, ctx())
    expect(handle.address).toBe(controller.address)
    const result = await openSigner(claimed.id, ctx())
    if (result.status !== 'ok') throw new Error('expected ok')
    const tx = { TransactionType: 'Payment', Account: controller.address, Destination: target.keyAddress, Amount: '1', Fee: '12', Sequence: 1 } as any
    const decoded = decode(result.value.sign(tx).tx_blob) as any
    expect(decoded.Account).toBe(controller.address)
    expect(Wallet.fromSeed(targetSeed).publicKey).toBe(decoded.SigningPubKey)
    // The target's own view still signs as itself.
    const own = await openSigner(target.id, ctx())
    if (own.status !== 'ok') throw new Error('expected ok')
    expect((decode(own.value.sign({ ...tx, Account: target.keyAddress }).tx_blob) as any).Account).toBe(target.keyAddress)
  })

  it('still detects a wrong credential by the key address', async () => {
    await setRegularKey(controller.id, target.id, ctx())
    const claimed = (await listWallets()).find((m) => m.seedId === target.seedId && m.address === controller.address)!
    await sealSeedUnderSigningCheck(claimed.id, 'pin', { openKey: key, prompts: pinPrompt(PIN) })
    const wrong = await openSigner(claimed.id, ctx({ prompts: pinPrompt('000000') }))
    expect(wrong.status).toBe('wrong-credential')
  })
})
