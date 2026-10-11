/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'

/**
 * Story 12.1 / AD-27: the legacy-vault migration runs from the Gate, after the
 * persisted app store has been read and before the Wallet list. The real store
 * is used; only its sink (`idb-keyval`) and the keystore are faked. Each case
 * loads a fresh module graph, because the migration runs once per app start.
 */
const h = vi.hoisted(() => ({
  idb: new Map<string, string>(),
  getImpl: null as null | ((k: string) => Promise<string | undefined>),
  calls: [] as string[],
  migrate: vi.fn(async (_i: { network: string; autoLockMinutes: number }) => true),
  list: vi.fn(async (_n?: string): Promise<unknown[]> => []),
}))

vi.mock('idb-keyval', () => ({
  get: (k: string) => (h.getImpl ? h.getImpl(k) : Promise.resolve(h.idb.get(k))),
  set: async (k: string, v: string) => void h.idb.set(k, v),
  del: async (k: string) => void h.idb.delete(k),
}))
vi.mock('@/lib/crypto/keystore', () => ({
  migrateLegacyVault: (i: { network: string; autoLockMinutes: number }) => {
    h.calls.push('migrate')
    return h.migrate(i)
  },
  listWallets: (n?: string) => {
    h.calls.push('list')
    return h.list(n)
  },
}))
vi.mock('@/lib/crypto/auth', () => ({ restoreSession: async () => null, endSession: async () => {} }))
vi.mock('@/pages/Onboarding', () => ({ Onboarding: () => null }))
vi.mock('@/pages/Unlock', () => ({ Unlock: () => null }))
vi.mock('@/pages/Main', () => ({ Main: () => null }))

async function mountApp() {
  vi.resetModules()
  const { default: App } = await import('@/App')
  render(<App />)
}

beforeEach(() => {
  h.idb.clear()
  h.getImpl = null
  h.calls.length = 0
  h.migrate.mockReset().mockResolvedValue(true)
  h.list.mockReset().mockResolvedValue([])
})
afterEach(cleanup)

describe('Gate — legacy vault migration at app start', () => {
  it('runs after hydration, with the hydrated network and auto-lock, and before listWallets', async () => {
    h.idb.set(
      'xrpl-wallet-app-state',
      JSON.stringify({ state: { network: 'mainnet', autoLockMinutes: 15, wallets: [], addressBook: [] }, version: 0 }),
    )
    await mountApp()
    await waitFor(() => expect(h.list).toHaveBeenCalled())
    expect(h.migrate).toHaveBeenCalledTimes(1)
    expect(h.migrate).toHaveBeenCalledWith({ network: 'mainnet', autoLockMinutes: 15 })
    expect(h.calls).toEqual(['migrate', 'list'])
    expect(h.list).toHaveBeenCalledWith('mainnet')
  })

  it('swallows a rejected migration and still lists Wallets', async () => {
    h.migrate.mockRejectedValue(new Error('tx aborted'))
    await mountApp()
    await waitFor(() => expect(h.list).toHaveBeenCalled())
    expect(h.calls).toEqual(['migrate', 'list'])
  })

  it('does not hang when the persisted store cannot be read', async () => {
    // zustand fires onFinishHydration only on success; a failed read must
    // still let migration and the Wallet list run, on the store's defaults.
    h.getImpl = async () => {
      throw new Error('storage unavailable')
    }
    await mountApp()
    await waitFor(() => expect(h.list).toHaveBeenCalled())
    expect(h.migrate).toHaveBeenCalledWith({ network: 'testnet', autoLockMinutes: 5 })
  })
})
