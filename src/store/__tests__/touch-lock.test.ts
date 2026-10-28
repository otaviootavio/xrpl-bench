/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {}, extendLockSession: async () => {} }))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))

import { enterWallet, lockRemainingMs, touchLock, useAppStore } from '../app-store'

const W = (id: string, lockId: string) =>
  ({ id, seedId: id, lockId, label: id, address: `r${id}`, createdAt: 1, network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' }) as never
const KEY = {} as CryptoKey

beforeEach(() => {
  vi.useFakeTimers()
  useAppStore.setState({ wallets: [W('a', 'X'), W('b', 'Y')], activeWalletId: 'b', openLocks: {} } as never)
})
afterEach(() => {
  useAppStore.getState().closeAllLocks()
  vi.useRealTimers()
})

describe('touchLock (AD-35)', () => {
  it('restarts the entered wallet\'s lock only, and returns its id', () => {
    useAppStore.getState().openLock('X', KEY, 1)
    useAppStore.getState().openLock('Y', KEY, 1)
    vi.advanceTimersByTime(30_000)
    expect(touchLock('a')).toBe('X')
    expect(lockRemainingMs('X')).toBe(60_000)
    expect(lockRemainingMs('Y')).toBe(30_000) // the other open lock is untouched, though it is the active wallet's
  })

  it('null extends nothing and returns null', () => {
    useAppStore.getState().openLock('X', KEY, 1)
    useAppStore.getState().openLock('Y', KEY, 1)
    vi.advanceTimersByTime(30_000)
    expect(touchLock(null)).toBeNull()
    expect(lockRemainingMs('X')).toBe(30_000)
    expect(lockRemainingMs('Y')).toBe(30_000)
  })

  it('a closed lock or an unknown wallet id returns null and extends nothing', () => {
    useAppStore.getState().openLock('Y', KEY, 1)
    vi.advanceTimersByTime(30_000)
    expect(touchLock('a')).toBeNull() // a's lock X is closed
    expect(touchLock('nope')).toBeNull()
    expect(lockRemainingMs('Y')).toBe(30_000)
  })
})

describe('enterWallet (AD-34)', () => {
  it('selects the wallet and pushes exactly one history entry to /wallets/<id>', () => {
    window.history.replaceState(null, '', '/')
    const before = window.history.length
    enterWallet('a')
    expect(useAppStore.getState().activeWalletId).toBe('a')
    expect(window.location.pathname).toBe('/wallets/a')
    expect(window.history.length).toBe(before + 1)
    window.history.replaceState(null, '', '/')
  })

  it('does nothing for an id that is not a wallet', () => {
    window.history.replaceState(null, '', '/')
    const before = window.history.length
    enterWallet('nope')
    expect(useAppStore.getState().activeWalletId).toBe('b')
    expect(window.location.pathname).toBe('/')
    expect(window.history.length).toBe(before)
  })
})
