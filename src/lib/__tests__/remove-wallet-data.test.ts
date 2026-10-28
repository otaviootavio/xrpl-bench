import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

/**
 * AD-46: `removeWalletData` is the one place a removal closes a lock or touches the
 * cache. The app store is real; the vault, the persistence sink and the sockets are not.
 */
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {} }))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: async () => {} }))

import { removeWalletData } from '../teardown'
import { useAppStore } from '@/store/app-store'
import { queryKeys } from '@/lib/xrpl/query-keys'

const W = (id: string, lockId: string, address: string, extra = {}) =>
  ({ id, seedId: id, lockId, label: id, address, createdAt: 1, network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard', ...extra }) as never
const OPEN = { key: {} as CryptoKey, autoLockMinutes: 5 }
const state = () => useAppStore.getState()
const seeded = (...addresses: string[]) => {
  const qc = new QueryClient()
  for (const a of addresses) qc.setQueryData(queryKeys.accountState('testnet', a), 1)
  qc.setQueryData(queryKeys.recommendedFee('testnet'), 2)
  return qc
}
const has = (qc: QueryClient, a: string) => qc.getQueryData(queryKeys.accountState('testnet', a)) !== undefined

beforeEach(() => {
  useAppStore.setState({ wallets: [], activeWalletId: null, openLocks: {} } as never)
})

describe('removeWalletData (AD-46)', () => {
  it('removes the removed Wallet\'s account data and closes its created lock; another lock stays open', () => {
    const [a, b] = [W('a', 'LA', 'rA'), W('b', 'LB', 'rB')]
    useAppStore.setState({ wallets: [a, b], openLocks: { LA: OPEN, LB: OPEN } } as never)
    const qc = seeded('rA', 'rB')
    removeWalletData(qc, a, [b])
    expect(has(qc, 'rA')).toBe(false)
    expect(has(qc, 'rB')).toBe(true)
    expect(Object.keys(state().openLocks)).toEqual(['LB'])
    expect(qc.getQueryData(queryKeys.recommendedFee('testnet'))).toBe(2)
  })

  it('never closes the legacy lock in the per-removal step', () => {
    const [a, b] = [W('a', 'legacy', 'rA'), W('b', 'legacy', 'rB')]
    useAppStore.setState({ wallets: [a, b], openLocks: { legacy: OPEN } } as never)
    const qc = seeded('rA', 'rB')
    removeWalletData(qc, a, [b])
    expect(Object.keys(state().openLocks)).toEqual(['legacy'])
    expect(has(qc, 'rA')).toBe(false)
    expect(has(qc, 'rB')).toBe(true)
  })

  it('keeps the lock when a sibling view of the same Seed is still on it', () => {
    const [a, a2] = [W('a', 'LA', 'rA'), W('a2', 'LA', 'rA2', { seedId: 'a' })]
    useAppStore.setState({ wallets: [a, a2], openLocks: { LA: OPEN } } as never)
    const qc = seeded('rA', 'rA2')
    removeWalletData(qc, a, [a2])
    expect(Object.keys(state().openLocks)).toEqual(['LA'])
    expect(has(qc, 'rA2')).toBe(true)
  })

  it('keeps an account another open lock\'s remaining Wallet still holds', () => {
    const [a, b] = [W('a', 'LA', 'rSAME'), W('b', 'LB', 'rSAME')]
    useAppStore.setState({ wallets: [a, b], openLocks: { LA: OPEN, LB: OPEN } } as never)
    const qc = seeded('rSAME')
    removeWalletData(qc, a, [b])
    expect(has(qc, 'rSAME')).toBe(true)
    expect(Object.keys(state().openLocks)).toEqual(['LB'])
    // ...but not one that a CLOSED lock's Wallet holds.
    const c = W('c', 'LC', 'rSAME')
    useAppStore.setState({ wallets: [b, c], openLocks: { LB: OPEN } } as never)
    removeWalletData(qc, b, [c])
    expect(has(qc, 'rSAME')).toBe(false)
  })

  it('runs tearDownAllLocks when none remain: every lock, the legacy one too, and the whole cache', () => {
    const a = W('a', 'legacy', 'rA')
    useAppStore.setState({ wallets: [a], openLocks: { legacy: OPEN, LX: OPEN } } as never)
    const qc = seeded('rA')
    removeWalletData(qc, a, [])
    expect(state().openLocks).toEqual({})
    expect(qc.getQueryCache().getAll()).toEqual([])
  })

  it('treats a Wallet the vault still lists as removed: its session and data are closed (fails closed)', () => {
    const [a, b] = [W('a', 'LA', 'rA'), W('b', 'LB', 'rB')]
    useAppStore.setState({ wallets: [a, b], openLocks: { LA: OPEN, LB: OPEN } } as never)
    const qc = seeded('rA', 'rB')
    removeWalletData(qc, a, [a, b])
    expect(Object.keys(state().openLocks)).toEqual(['LB'])
    expect(has(qc, 'rA')).toBe(false)
  })

  it('never writes vault meta: it imports nothing that does', async () => {
    const { readFileSync } = await import('node:fs')
    const text = readFileSync('src/lib/teardown.ts', 'utf8')
    expect(text).not.toMatch(/mutateVaultMeta|putVaultMeta|discardAppPin|failedAttempts/)
  })
})
