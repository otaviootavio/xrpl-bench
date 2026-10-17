/** @vitest-environment jsdom */
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))

import { useAppStore, useWalletOpenKey } from '../app-store'

const KEY_X = { id: 'x' } as unknown as CryptoKey
const KEY_Y = { id: 'y' } as unknown as CryptoKey
const base = { createdAt: 1, algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard', network: 'testnet', address: 'r', seedId: 's' }

beforeEach(() => {
  useAppStore.setState({
    wallets: [
      { ...base, id: 'a', lockId: 'X', label: 'A' },
      { ...base, id: 'b', lockId: 'Y', label: 'B' },
    ],
    activeWalletId: 'a',
    openLocks: { X: { key: KEY_X, autoLockMinutes: 5 }, Y: { key: KEY_Y, autoLockMinutes: 5 } },
  } as never)
})

describe('useWalletOpenKey', () => {
  it('returns the key of THAT Wallet\'s own lock, not the active Wallet\'s or the first open one', () => {
    expect(renderHook(() => useWalletOpenKey('b')).result.current).toBe(KEY_Y)
    expect(renderHook(() => useWalletOpenKey('a')).result.current).toBe(KEY_X)
  })

  it('is null for a Wallet whose lock is closed, and for no Wallet', () => {
    useAppStore.setState({ openLocks: { X: { key: KEY_X, autoLockMinutes: 5 } } } as never)
    expect(renderHook(() => useWalletOpenKey('b')).result.current).toBeNull()
    expect(renderHook(() => useWalletOpenKey(null)).result.current).toBeNull()
  })
})
