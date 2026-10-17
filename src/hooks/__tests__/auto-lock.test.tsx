/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

const h = vi.hoisted(() => ({ ended: [] as string[], extended: [] as string[], endedAll: 0 }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({
  endLockSession: async (id: string) => void h.ended.push(id),
  endAllLockSessions: async () => void h.endedAll++,
  extendLockSession: async (id: string) => void h.extended.push(id),
}))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))

import { useAutoLock } from '../useAutoLock'
import { expiredLockIds, lockRemainingMs, useAppStore } from '@/store/app-store'
import { queryKeys } from '@/lib/xrpl/query-keys'

const W = (id: string, lockId: string, address: string) =>
  ({ id, seedId: id, lockId, label: id, address, createdAt: 1, network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' }) as never
const KEY = {} as CryptoKey
const ids = () => Object.keys(useAppStore.getState().openLocks).sort()

let qc: QueryClient
function mount() {
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  return renderHook(() => useAutoLock(), { wrapper })
}

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  h.ended.length = 0
  h.extended.length = 0
  h.endedAll = 0
  qc = new QueryClient()
  useAppStore.setState({ wallets: [W('a', 'X', 'rA'), W('b', 'Y', 'rB')], activeWalletId: 'a', openLocks: {} } as never)
  qc.setQueryData(queryKeys.accountState('testnet', 'rA'), { v: 1 })
  qc.setQueryData(queryKeys.accountState('testnet', 'rB'), { v: 2 })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  useAppStore.getState().closeAllLocks()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

describe('useAutoLock — one timer per lock (AD-26)', () => {
  it('a lock auto-locks on its OWN minutes: X (1 min) closes, Y (5 min) stays open and readable', () => {
    useAppStore.getState().openLock('X', KEY, 1)
    useAppStore.getState().openLock('Y', KEY, 5)
    mount()

    act(() => void vi.advanceTimersByTime(61_000))

    expect(ids()).toEqual(['Y'])
    expect(h.ended).toEqual(['X'])
    expect(qc.getQueryData(queryKeys.accountState('testnet', 'rA'))).toBeUndefined()
    expect(qc.getQueryData(queryKeys.accountState('testnet', 'rB'))).toBeDefined()

    act(() => void vi.advanceTimersByTime(5 * 60_000))
    expect(ids()).toEqual([])
    expect(qc.getQueryData(queryKeys.accountState('testnet', 'rB'))).toBeUndefined()
  })

  it('activity restarts every open lock\'s timer and extends its persisted session', () => {
    useAppStore.getState().openLock('X', KEY, 1)
    mount()
    act(() => void vi.advanceTimersByTime(50_000))
    act(() => void window.dispatchEvent(new Event('mousedown')))
    act(() => void vi.advanceTimersByTime(50_000))
    expect(ids()).toEqual(['X']) // 100s after open, but 50s after the last activity
    expect(h.extended).toContain('X')
    act(() => void vi.advanceTimersByTime(11_000))
    expect(ids()).toEqual([])
  })

  it('opening a second lock does not give the first a fresh window', () => {
    useAppStore.getState().openLock('X', KEY, 1)
    mount()
    act(() => void vi.advanceTimersByTime(40_000))
    act(() => useAppStore.getState().openLock('Y', KEY, 5))
    act(() => void vi.advanceTimersByTime(21_000))
    expect(ids()).toEqual(['Y'])
  })

  it('a lock whose timer was throttled is found expired on the next activity, never extended', () => {
    useAppStore.getState().openLock('X', KEY, 1)
    mount()
    // The clock jumps past the expiry without the timer having fired.
    vi.setSystemTime(Date.now() + 120_000)
    act(() => void window.dispatchEvent(new Event('keydown')))
    expect(ids()).toEqual([])
    expect(h.extended).not.toContain('X')
  })

  it('backgrounding past the grace closes EVERY lock', () => {
    useAppStore.getState().openLock('X', KEY, 5)
    useAppStore.getState().openLock('Y', KEY, 5)
    mount()
    act(() => setVisibility('hidden'))
    act(() => void vi.advanceTimersByTime(31_000))
    act(() => setVisibility('visible'))
    expect(ids()).toEqual([])
    expect(h.endedAll).toBe(1)
    expect(qc.getQueryData(queryKeys.accountState('testnet', 'rA'))).toBeUndefined()
    expect(qc.getQueryData(queryKeys.accountState('testnet', 'rB'))).toBeUndefined()
  })

  it('returning within the grace keeps the locks, as activity', () => {
    useAppStore.getState().openLock('X', KEY, 5)
    mount()
    act(() => setVisibility('hidden'))
    act(() => void vi.advanceTimersByTime(10_000))
    act(() => setVisibility('visible'))
    expect(ids()).toEqual(['X'])
  })

  it('closes every lock at once on a coarse pointer, with no grace', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    useAppStore.getState().openLock('X', KEY, 5)
    useAppStore.getState().openLock('Y', KEY, 5)
    mount()
    act(() => setVisibility('hidden'))
    act(() => setVisibility('visible'))
    expect(ids()).toEqual([])
    vi.unstubAllGlobals()
  })

  it('activity in the active Wallet does not keep another open lock alive', () => {
    useAppStore.getState().openLock('X', KEY, 5)
    useAppStore.getState().openLock('Y', KEY, 1)
    mount()
    for (let i = 0; i < 4; i++) {
      act(() => void vi.advanceTimersByTime(20_000))
      act(() => void window.dispatchEvent(new Event('mousedown'))) // active Wallet is on X
    }
    expect(ids()).toEqual(['X']) // Y ran down on its own 1 minute
    expect(h.extended).not.toContain('Y')
  })

  it('a lock with no recorded expiry fails closed', () => {
    useAppStore.setState({ openLocks: { Z: { key: KEY, autoLockMinutes: 5 } } } as never) // bypasses openLock: no expiry
    expect(expiredLockIds()).toContain('Z')
    useAppStore.setState({ openLocks: {} } as never)
  })

  it('a restored lock keeps its persisted expiry, not a fresh window', () => {
    useAppStore.getState().openLock('X', KEY, 5, Date.now() + 30_000)
    expect(lockRemainingMs('X')).toBe(30_000)
    mount()
    act(() => void vi.advanceTimersByTime(31_000))
    expect(ids()).toEqual([])
  })

  it('changing a lock\'s minutes while mounted re-arms its timer', () => {
    useAppStore.getState().openLock('X', KEY, 5)
    mount()
    act(() => useAppStore.getState().setLockMinutes('X', 1))
    act(() => void vi.advanceTimersByTime(61_000))
    expect(ids()).toEqual([])
  })
})
