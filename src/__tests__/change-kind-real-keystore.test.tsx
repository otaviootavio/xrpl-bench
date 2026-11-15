/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Offline signing story 5, review round two: the write → result path of
 * "Change to an offline wallet" against the REAL keystore. Only `idb` (in
 * memory), the pool, the live hooks and the lock sessions are replaced.
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
const pool = vi.hoisted(() => ({ get: vi.fn(), retire: vi.fn(), hooks: vi.fn() }))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/xrpl/client', () => ({
  getXrplClient: pool.get,
  holdXrplClient: pool.get,
  disconnectAllClients: vi.fn(),
  retireNode: vi.fn(),
  retireNetworkClient: pool.retire,
  verifyNode: vi.fn(),
}))
vi.mock('@/pages/Onboarding', () => ({ Onboarding: () => <div>onboarding</div> }))
vi.mock('@/pages/Unlock', () => ({ Unlock: ({ wallet }: { wallet: { label: string } }) => <div>{`locked:${wallet.label}`}</div> }))
vi.mock('@/hooks/useIncomingPaymentNotifications', () => ({ useIncomingPaymentNotifications: (...a: unknown[]) => pool.hooks('notify', ...a) }))
vi.mock('@/hooks/useAccountLiveUpdates', () => ({ useAccountLiveUpdates: (...a: unknown[]) => pool.hooks('live', ...a) }))
vi.mock('@/hooks/useAppUpdate', () => ({ useAppUpdate: () => ({ updateReady: false, declined: false }) }))
vi.mock('@/lib/build-info', () => ({ BUILD: { version: '0.0.0', commitSha: 'x', builtAt: '' }, shortSha: 'x', sourceUrl: 'https://example.invalid', formatBuiltAt: () => '' }))
vi.mock('@/lib/crypto/transmitter-unlock', () => ({ proveTransmitterUnlock: async () => true }))
vi.mock('@/lib/crypto/lock', () => ({
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
  restoreOpenLocks: async () => [{ lockId: 'LX', key: {}, autoLockMinutes: 5 }],
  extendLockSession: async () => {},
  getLockInfo: async (id: string) => ({ id, openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }),
  hasAppPin: async () => true,
}))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))

import App from '../App'
import { useAppStore } from '@/store/app-store'
import { CHANGE_TO_OFFLINE, NOW_OFFLINE, WALLET_KIND, WAS_ONLINE } from '@/lib/kind-change-words'
import { fill } from '@/lib/transmit-words'

const ADDRESS = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'

beforeEach(() => {
  h.state.stores = { wallets: new Map(), vault: new Map(), session: new Map() }
  h.state.stores.wallets.set('w1', {
    id: 'w1',
    label: 'Daily',
    address: ADDRESS,
    createdAt: 1,
    lockId: 'LX',
    seedMethod: 'stored',
    algorithm: 'ed25519',
    openCheck: 'pin',
    signingCheck: 'standard',
    encryptedSeed: { ivB64: 'iv', ciphertextB64: 'ct' },
    views: [{ walletId: 'w1', network: 'testnet', node: 'wss://node.example', showBeforeSending: true }],
  })
  useAppStore.setState({ openLocks: {}, wallets: [], activeWalletId: null })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Change to an offline wallet, real keystore (OS-FR-5, OS-FR-7)', () => {
  it('writes the Offline view with the mark, publishes the written meta and lands on its result', async () => {
    window.history.replaceState(null, '', '/wallets/w1/to-offline')
    render(<App />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: CHANGE_TO_OFFLINE })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: CHANGE_TO_OFFLINE }))
    await waitFor(() => expect(screen.getByText(fill(NOW_OFFLINE, 'Testnet'))).toBeTruthy())
    expect(h.state.stores.wallets.get('w1').views).toEqual([{ walletId: 'w1', network: 'testnet', kind: 'offline', wasOnline: true }])
    expect(useAppStore.getState().wallets.find((w) => w.id === 'w1')).toMatchObject({ kind: 'offline', wasOnline: true })
    expect(window.location.pathname).toBe('/wallets/w1')
    const plate = [...document.querySelectorAll<HTMLElement>('[data-slot="config-plate"]')].find((p) => p.querySelector('h2')?.textContent === WALLET_KIND)!
    expect(within(plate).getByText(WAS_ONLINE)).toBeTruthy()
    expect(pool.retire).toHaveBeenCalledWith('testnet', 'wss://node.example')
  })
})
