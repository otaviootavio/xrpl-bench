/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// Closing a lock ends its persisted session; the vault is not under test here.
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {} }))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))

import { useClearCacheOnLock } from '../useClearCacheOnLock'
import { useAppStore } from '@/store/app-store'
import { queryKeys } from '@/lib/xrpl/query-keys'

const ALICE = 'rBoGUS9uiK9m3Kk6qnGRvWWCwAeN8hF3wR'
const BOB = 'rBobBobBobBobBobBobBobBobBobBobBob'
const KEY = queryKeys.accountState('testnet', ALICE)
const BOB_KEY = queryKeys.accountState('testnet', BOB)

const W = (id: string, lockId: string, address: string) =>
  ({ id, seedId: id, lockId, label: id, address, createdAt: 1, network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' }) as never
const OPEN = { key: {} as CryptoKey, autoLockMinutes: 5 }

/**
 * G-14 / AD-16 / AD-26 at the hook: a lock closing removes the account data of
 * ITS Wallets from the TanStack Query cache, where it lives, and leaves Cache
 * Storage — the precached shell — alone, so the app still opens offline and the
 * update flow keeps its precache. Another lock's data stays readable.
 */

beforeEach(() => {
  useAppStore.setState({ wallets: [W('a', 'X', ALICE), W('b', 'Y', BOB)], openLocks: { X: OPEN, Y: OPEN } } as never)
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete (window.navigator as { serviceWorker?: unknown }).serviceWorker
})

function mount(qc: QueryClient) {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  renderHook(() => useClearCacheOnLock(), { wrapper })
}

describe('useClearCacheOnLock', () => {
  it('removes only the closed lock\'s query data and never touches Cache Storage or the service-worker registration', async () => {
    const cacheStorage = { keys: vi.fn(async () => ['workbox-precache']), delete: vi.fn(async () => true), open: vi.fn() }
    vi.stubGlobal('caches', cacheStorage)
    const registration = { unregister: vi.fn(async () => true) }
    const sw = { getRegistrations: vi.fn(async () => [registration]) }
    Object.defineProperty(window.navigator, 'serviceWorker', { value: sw, configurable: true })

    const qc = new QueryClient()
    qc.setQueryData(KEY, { balanceDrops: '25000000' })
    qc.setQueryData(BOB_KEY, { balanceDrops: '1' })
    mount(qc)
    expect(qc.getQueryData(KEY)).toBeDefined()

    await act(async () => {
      useAppStore.getState().closeLock('X')
    })

    expect(qc.getQueryData(KEY)).toBeUndefined()
    // Lock Y is still open: its Wallet stays readable.
    expect(qc.getQueryData(BOB_KEY)).toBeDefined()
    expect(cacheStorage.delete).not.toHaveBeenCalled()
    expect(cacheStorage.keys).not.toHaveBeenCalled()
    // The registration stays too: only a full reset unregisters it.
    expect(sw.getRegistrations).not.toHaveBeenCalled()
    expect(registration.unregister).not.toHaveBeenCalled()
  })

  it('keeps an Account\'s data while another open lock holds a record for the same Account', async () => {
    useAppStore.setState({ wallets: [W('a', 'X', ALICE), W('a2', 'Y', ALICE)] } as never)
    const qc = new QueryClient()
    qc.setQueryData(KEY, { balanceDrops: '25000000' })
    mount(qc)

    await act(async () => {
      useAppStore.getState().closeLock('X')
    })
    expect(qc.getQueryData(KEY)).toBeDefined()

    await act(async () => {
      useAppStore.getState().closeLock('Y')
    })
    expect(qc.getQueryData(KEY)).toBeUndefined()
  })

  it('closeAllLocks removes every lock\'s data', async () => {
    const qc = new QueryClient()
    qc.setQueryData(KEY, { balanceDrops: '1' })
    qc.setQueryData(BOB_KEY, { balanceDrops: '2' })
    mount(qc)
    await act(async () => {
      useAppStore.getState().closeAllLocks()
    })
    expect(qc.getQueryData(KEY)).toBeUndefined()
    expect(qc.getQueryData(BOB_KEY)).toBeUndefined()
  })

  it('when the LAST open lock closes, ledger-wide and counterparty-keyed entries go too', async () => {
    const qc = new QueryClient()
    const dest = queryKeys.destinationInfo('testnet', 'rSomeoneElse', 'XRP')
    qc.setQueryData(dest, { exists: true })
    qc.setQueryData(KEY, { v: 1 })
    mount(qc)
    await act(async () => {
      useAppStore.getState().closeLock('X')
    })
    expect(qc.getQueryData(dest)).toBeDefined() // Y still open
    await act(async () => {
      useAppStore.getState().closeLock('Y')
    })
    expect(qc.getQueryData(dest)).toBeUndefined()
  })
})
