import { beforeEach, describe, expect, it, vi } from 'vitest'
import { webcrypto } from 'node:crypto'

/**
 * Story 10 / AD-29: the master key is turned off and on, and the shown state is the re-read. `idb` and WebAuthn are
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
  submits: [] as { address: string; enable: boolean }[],
  reads: 0,
  throwOnSubmit: null as null | (() => void),
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
    submitMasterKeyFlag: async (_n: string, signing: any, params: { enable: boolean }) => {
      if (ledger.throwOnSubmit) {
        ledger.throwOnSubmit()
      }
      // The real choke point runs the Signing Check after autofill; here it runs first.
      const signer = await signing.open()
      signer.dispose()
      if (ledger.failReadsAfterSubmit) ledger.failReads = true
      ledger.submits.push({ address: signing.address, enable: params.enable })
      if (ledger.outcome.status === 'validated' && ledger.applyOnValidated) ledger.state.disableMasterKey = !params.enable
      return ledger.outcome
    },
  }
})

import { QueryClient } from '@tanstack/react-query'
import { setUpVaultAuth } from '../auth'
import {
  addControlledView,
  generateAndStoreWallet,
  removeWallet,
  sealSeedUnderSigningCheck,
  unavailablePrompts,
  type Prompts,
  type WalletMeta,
} from '../keystore'
const pinPrompt = (pin: string | null): Prompts => ({ pin: async () => pin })
const failedAttempts = () => h.state.stores.vault.get('vault')?.failedAttempts ?? 0
import { NO_REGULAR_KEY_WALLET_REASON, masterKeyAction, masterKeyStatus, setMasterKey } from '../../master-key'

const PIN = '123456'
let key: CryptoKey
let master: WalletMeta
let regular: WalletMeta
let queryClient: QueryClient

beforeEach(async () => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.failNextPutOn = null
  w.mode = 'ok'
  key = await setUpVaultAuth('tester', PIN)
  master = (await generateAndStoreWallet('Master', key, 'testnet')).meta
  const t = await generateAndStoreWallet('Regular', key, 'testnet')
  regular = await addControlledView(t.meta.id, { network: 'testnet', accountAddress: master.address })
  ledger.state = { ...ledger.state, exists: true, disableMasterKey: false, regularKey: t.meta.keyAddress }
  ledger.failReads = false
  ledger.failReadsAfterSubmit = false
  ledger.outcome = { status: 'validated', hash: 'H', resultCode: 'tesSUCCESS' }
  ledger.applyOnValidated = true
  ledger.submits = []
  ledger.reads = 0
  ledger.throwOnSubmit = null
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

const ctx = (extra: Record<string, unknown> = {}) => ({ queryClient, openKey: key, prompts: unavailablePrompts, confirmed: true, ...extra })
const base = { exists: true, address: 'rA', balanceDrops: '0', ownerCount: 0, sequence: 1, requireDestTag: false, disableMasterKey: false }

describe('masterKeyStatus and masterKeyAction (AD-29)', () => {
  it('is read from the account: on, off, or unknown', () => {
    expect(masterKeyStatus(base)).toBe('on')
    expect(masterKeyStatus({ ...base, disableMasterKey: true })).toBe('off')
    expect(masterKeyStatus(null)).toBe('unknown')
    expect(masterKeyStatus(undefined)).toBe('unknown')
    expect(masterKeyStatus({ ...base, exists: false })).toBe('unknown')
  })

  it('offers turn-off to the master wallet only with a Regular Key set and the master key on', () => {
    const m = { address: 'rA', keyAddress: 'rA', network: 'testnet' } as const
    const rk = { address: 'rA', keyAddress: 'rK', network: 'testnet' } as const
    const here = [m, rk]
    expect(masterKeyAction(m, { ...base, regularKey: 'rK' }, false, here)).toEqual({ action: 'off', reason: null })
    expect(masterKeyAction(m, base, false, here).reason).toMatch(/no Regular Key/)
    expect(masterKeyAction(m, { ...base, regularKey: 'rK', disableMasterKey: true }, false, here).reason).toMatch(/already off/)
    expect(masterKeyAction(m, undefined, true, here).reason).toMatch(/could not be read/)
    expect(masterKeyAction(m, { ...base, exists: false }, false, here).reason).toMatch(/not on the ledger/)
    expect(masterKeyAction(m, undefined, false, here).reason).toMatch(/Reading/)
  })

  it('will not offer turn-off unless a wallet on this device signs as that Regular Key', () => {
    const m = { address: 'rA', keyAddress: 'rA', network: 'testnet' } as const
    const state = { ...base, regularKey: 'rK' }
    expect(masterKeyAction(m, state, false, [m]).reason).toBe(NO_REGULAR_KEY_WALLET_REASON)
    // A view of another Account, another network, or another key does not count.
    expect(masterKeyAction(m, state, false, [m, { address: 'rB', keyAddress: 'rK', network: 'testnet' }]).reason).toBe(NO_REGULAR_KEY_WALLET_REASON)
    expect(masterKeyAction(m, state, false, [m, { address: 'rA', keyAddress: 'rK', network: 'mainnet' }]).reason).toBe(NO_REGULAR_KEY_WALLET_REASON)
    expect(masterKeyAction(m, state, false, [m, { address: 'rA', keyAddress: 'rOther', network: 'testnet' }]).reason).toBe(NO_REGULAR_KEY_WALLET_REASON)
    expect(masterKeyAction(m, state, false, [m, { address: 'rA', keyAddress: 'rK', network: 'testnet' }]).reason).toBeNull()
  })

  it('offers turn-on only to the Regular Key wallet, and only with the master key off', () => {
    const r = { address: 'rA', keyAddress: 'rK', network: 'testnet' } as const
    expect(masterKeyAction(r, { ...base, regularKey: 'rK', disableMasterKey: true }, false, [r])).toEqual({ action: 'on', reason: null })
    expect(masterKeyAction(r, { ...base, regularKey: 'rK' }, false, [r]).reason).toMatch(/already on/)
    expect(masterKeyAction(r, { ...base, regularKey: 'rOther', disableMasterKey: true }, false, [r]).reason).toMatch(/not this account’s Regular Key/)
    expect(masterKeyAction(r, { ...base, disableMasterKey: true }, false, [r]).reason).toMatch(/not this account’s Regular Key/)
  })
})

describe('setMasterKey', () => {
  it('turns it off from the master wallet and reports what the re-read shows', async () => {
    const r = await setMasterKey(master.id, false, ctx())
    expect(r).toEqual({ status: 'validated', state: 'off' })
    expect(ledger.submits).toEqual([{ address: master.address, enable: false }])
  })

  it('refuses to turn it off when no wallet on this device signs as the Regular Key, and signs and sends nothing', async () => {
    await removeWallet(regular.id) // the controlled view is gone; the ledger still shows its key as the Regular Key
    const r = await setMasterKey(master.id, false, ctx())
    expect(r).toMatchObject({ status: 'refused', reason: expect.stringContaining('No wallet on this device signs as this account’s Regular Key') })
    expect(ledger.submits).toEqual([])
  })

  it('refuses it too when the Regular Key is one this device holds no wallet for', async () => {
    ledger.state.regularKey = 'rSomeoneElsesKey'
    const r = await setMasterKey(master.id, false, ctx())
    expect(r).toMatchObject({ status: 'refused', reason: expect.stringContaining('No wallet on this device signs as') })
    expect(ledger.submits).toEqual([])
  })

  it('turns it on from the Regular Key wallet, signing as the Account', async () => {
    ledger.state.disableMasterKey = true
    const r = await setMasterKey(regular.id, true, ctx())
    expect(r).toEqual({ status: 'validated', state: 'on' })
    expect(ledger.submits).toEqual([{ address: master.address, enable: true }])
  })

  it('reports the re-read, not the request, when a validated change did not apply', async () => {
    ledger.applyOnValidated = false
    expect(await setMasterKey(master.id, false, ctx())).toEqual({ status: 'validated', state: 'on' })
  })

  it('refuses without confirmed: true, signing nothing', async () => {
    expect((await setMasterKey(master.id, false, ctx({ confirmed: undefined }))).status).toBe('refused')
    expect((await setMasterKey(master.id, false, ctx({ confirmed: false }))).status).toBe('refused')
    expect(ledger.submits).toEqual([])
    expect(ledger.reads).toBe(0)
  })

  it('refuses the wrong role: turn-off from the Regular Key wallet, turn-on from the master wallet', async () => {
    expect((await setMasterKey(regular.id, false, ctx())).status).toBe('refused')
    ledger.state.disableMasterKey = true
    expect((await setMasterKey(master.id, true, ctx())).status).toBe('refused')
    expect(ledger.submits).toEqual([])
  })

  it('refuses with no Regular Key, an errored read, an unfunded account, or a state that no longer fits', async () => {
    ledger.state.regularKey = undefined
    expect((await setMasterKey(master.id, false, ctx())).status).toBe('refused')
    ledger.state.regularKey = regular.keyAddress
    ledger.failReads = true
    expect((await setMasterKey(master.id, false, ctx())).status).toBe('refused')
    ledger.failReads = false
    ledger.state.exists = false
    expect((await setMasterKey(master.id, false, ctx())).status).toBe('refused')
    ledger.state.exists = true
    ledger.state.disableMasterKey = true
    expect((await setMasterKey(master.id, false, ctx())).status).toBe('refused')
    ledger.state.regularKey = 'rSomeoneElseSomeoneElseSomeone1'
    expect((await setMasterKey(regular.id, true, ctx())).status).toBe('refused')
    expect(ledger.submits).toEqual([])
  })

  it.each([
    ['tec', { status: 'claimed', hash: 'H', resultCode: 'tecNO_PERMISSION' }],
    ['tef', { status: 'failed', hash: 'H', resultCode: 'tefPAST_SEQ' }],
    ['expired', { status: 'expired', hash: 'H' }],
  ])('reports %s plainly and re-reads the state', async (_n, outcome) => {
    ledger.outcome = outcome
    const r = await setMasterKey(master.id, false, ctx())
    expect(r.status).toBe('not-validated')
    expect(r.status === 'not-validated' && r.state).toBe('on')
  })

  it('reports submitted-but-unconfirmed when the re-read fails after validation', async () => {
    ledger.failReadsAfterSubmit = true
    const r = await setMasterKey(master.id, false, ctx())
    expect(r.status).toBe('unconfirmed')
    expect(r.status === 'unconfirmed' && r.reason).toMatch(/could not confirm/)
  })

  it('after an unexpected throw, refuses if the re-read is unchanged, and reports unconfirmed if it changed or failed', async () => {
    ledger.throwOnSubmit = () => {
      throw new Error('socket closed')
    }
    const same = await setMasterKey(master.id, false, ctx())
    expect(same).toEqual({ status: 'refused', reason: 'socket closed' })

    ledger.throwOnSubmit = () => {
      ledger.state.disableMasterKey = true
      throw new Error('socket closed')
    }
    expect((await setMasterKey(master.id, false, ctx())).status).toBe('unconfirmed')

    ledger.state.disableMasterKey = false
    ledger.throwOnSubmit = () => {
      ledger.failReads = true
      throw new Error('socket closed')
    }
    expect((await setMasterKey(master.id, false, ctx())).status).toBe('unconfirmed')
  })

  it('counts a wrong PIN and not a cancel, and sends nothing for either', async () => {
    await sealSeedUnderSigningCheck(master.id, 'pin', { openKey: key, prompts: pinPrompt(PIN) })
    const wrong = await setMasterKey(master.id, false, ctx({ prompts: pinPrompt('000000') }))
    expect(wrong.status).toBe('check-failed')
    const failed = failedAttempts()
    expect(failed).toBe(1)
    const cancelled = await setMasterKey(master.id, false, ctx({ prompts: pinPrompt(null) }))
    expect(cancelled.status).toBe('cancelled')
    expect(failedAttempts()).toBe(failed)
    expect(ledger.submits).toEqual([])
  })

  it('stores no master-key flag on any record', async () => {
    await setMasterKey(master.id, false, ctx())
    expect(JSON.stringify([...h.state.stores.wallets.values()])).not.toMatch(/masterKey|disableMaster/i)
  })
})
