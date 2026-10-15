/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * CAP-4 / AD-26: a locked Wallet is a name and nothing else. `Main` mounts the
 * ledger hooks (and every tab) only for a Wallet whose lock is open, so with
 * every lock closed the pool is never asked for a client, and no module reads a
 * locked Wallet's address, balance or network. Real: Gate, Main, AppHeader, the
 * app store. Faked: the pool, the vault, each ledger hook and tab.
 */
const h = vi.hoisted(() => ({
  getXrplClient: vi.fn(),
  hookArgs: vi.fn(),
  tabRendered: vi.fn(),
  restored: [] as Array<{ lockId: string; key: unknown; autoLockMinutes: number }>,
}))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/xrpl/client', () => ({ getXrplClient: h.getXrplClient, holdXrplClient: vi.fn() }))
vi.mock('@/pages/Onboarding', () => ({ Onboarding: () => <div>onboarding</div> }))
vi.mock('@/pages/Unlock', () => ({ Unlock: ({ wallet }: { wallet: { label: string } }) => <div>{`locked:${wallet.label}`}</div> }))
vi.mock('@/hooks/useIncomingPaymentNotifications', () => ({ useIncomingPaymentNotifications: (...a: unknown[]) => h.hookArgs('notify', ...a) }))
vi.mock('@/hooks/useAccountLiveUpdates', () => ({ useAccountLiveUpdates: (...a: unknown[]) => h.hookArgs('live', ...a) }))
vi.mock('@/hooks/useAppUpdate', () => ({ useAppUpdate: () => ({ updateReady: false, declined: false }) }))
vi.mock('@/pages/tabs/BalancesTab', () => ({ BalancesTab: () => (h.tabRendered(), <div>tab</div>) }))
vi.mock('@/pages/tabs/SendTab', () => ({ SendTab: () => (h.tabRendered(), <div>tab</div>) }))
vi.mock('@/pages/tabs/ReceiveTab', () => ({ ReceiveTab: () => (h.tabRendered(), <div>tab</div>) }))
vi.mock('@/pages/tabs/HistoryTab', () => ({ HistoryTab: () => (h.tabRendered(), <div>tab</div>) }))
vi.mock('@/pages/tabs/TrustLinesTab', () => ({ TrustLinesTab: () => (h.tabRendered(), <div>tab</div>) }))
vi.mock('@/pages/tabs/SettingsTab', () => ({ SettingsTab: () => (h.tabRendered(), <div>tab</div>) }))
vi.mock('@/lib/crypto/lock', () => ({
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
  restoreOpenLocks: async () => h.restored,
  extendLockSession: async () => {},
}))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/keystore', () => ({
  migrateLegacyVault: async () => true,
  listWallets: async () => [
    { id: 'w1', seedId: 'w1', lockId: 'X', label: 'Alpha', address: 'rALPHA', createdAt: 1, network: 'mainnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' },
    { id: 'w2', seedId: 'w2', lockId: 'Y', label: 'Beta', address: 'rBETA', createdAt: 1, network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' },
  ],
}))

import App from '../App'
import { useAppStore } from '@/store/app-store'
import { useNoticeStore } from '@/store/notice-store'
import { toast } from '@/lib/notify'

beforeEach(() => {
  h.restored = []
  useAppStore.setState({ openLocks: {}, wallets: [], activeWalletId: null })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('a locked app issues no ledger request', () => {
  it('opens to the shell with every Wallet name, shows the active one locked, and never asks the pool for a client', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('locked:Alpha')).toBeTruthy())
    // Picker lists every name; a locked Wallet's entry is its name and no network.
    const picker = screen.getByRole('combobox', { name: 'Active wallet' })
    expect(picker.textContent).toBe('Alpha')
    expect(h.getXrplClient).not.toHaveBeenCalled()
    // No ledger hook was mounted, so none was handed an address; no tab rendered.
    expect(h.hookArgs).not.toHaveBeenCalled()
    expect(h.tabRendered).not.toHaveBeenCalled()
    // Nothing on screen carries the address or the network.
    expect(document.body.textContent).not.toContain('rALPHA')
    expect(document.body.textContent).not.toMatch(/mainnet|real funds/i)
  })

  it('mounts the ledger hooks only once that Wallet\'s own lock is open — and not for the other', async () => {
    render(<App />)
    await waitFor(() => expect(screen.getByText('locked:Alpha')).toBeTruthy())
    useAppStore.getState().openLock('Y', {} as CryptoKey, 5) // the OTHER Wallet's lock
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Active wallet' }).textContent).toBe('Alpha'))
    expect(screen.getByText('locked:Alpha')).toBeTruthy()
    expect(h.hookArgs).not.toHaveBeenCalled()

    useAppStore.getState().openLock('X', {} as CryptoKey, 5)
    await waitFor(() => expect(h.hookArgs).toHaveBeenCalledWith('live', 'mainnet', 'rALPHA', undefined))
    expect(screen.queryByText('locked:Alpha')).toBeNull()
  })

  it('closing a lock returns its Wallet to the locked view and unmounts its hooks', async () => {
    h.restored = [{ lockId: 'X', key: {}, autoLockMinutes: 5 }]
    render(<App />)
    await waitFor(() => expect(h.hookArgs).toHaveBeenCalled())
    useAppStore.getState().closeLock('X')
    await waitFor(() => expect(screen.getByText('locked:Alpha')).toBeTruthy())
  })

  it('restores only the locks whose session is still valid', async () => {
    h.restored = [{ lockId: 'Y', key: {}, autoLockMinutes: 5 }]
    render(<App />)
    await waitFor(() => expect(screen.getByText('locked:Alpha')).toBeTruthy())
    expect(Object.keys(useAppStore.getState().openLocks)).toEqual(['Y'])
  })

  it('keeps a persisted active Wallet that is not the first one', async () => {
    useAppStore.setState({ activeWalletId: 'w2' })
    render(<App />)
    await waitFor(() => expect(screen.getByText('locked:Beta')).toBeTruthy())
    expect(useAppStore.getState().activeWalletId).toBe('w2')
  })

  it('falls back to the first Wallet when the persisted active id no longer exists', async () => {
    useAppStore.setState({ activeWalletId: 'gone' })
    render(<App />)
    await waitFor(() => expect(screen.getByText('locked:Alpha')).toBeTruthy())
    expect(useAppStore.getState().activeWalletId).toBe('w1')
  })

  it('an error about the active Wallet goes when another Wallet becomes active', async () => {
    useNoticeStore.setState({ notices: [] })
    render(<App />)
    await waitFor(() => expect(screen.getByText('locked:Alpha')).toBeTruthy())
    toast.error('Incorrect PIN. 7 tries remaining.', { action: 'unlock' })
    expect(useNoticeStore.getState().notices).toHaveLength(1)

    useAppStore.getState().setActiveWalletId('w2')
    await waitFor(() => expect(screen.getByText('locked:Beta')).toBeTruthy())
    expect(useNoticeStore.getState().notices).toHaveLength(0)
  })
})
