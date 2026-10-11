/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Story 12.1: "use on another network" in the Settings Wallet list. A Seed with
 * a Mainnet view offers Testnet only; adding the view does not change which
 * Wallet is active (reads still use the app-wide network until story 12.2);
 * and the remove dialog says what removing a shared Seed's view does.
 */
const h = vi.hoisted(() => ({
  listWallets: vi.fn(async (_n?: string): Promise<unknown[]> => []),
  addNetworkView: vi.fn(async (_id: string, _n: string) => ({})),
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {}, endSession: async () => {} }))
vi.mock('@/lib/crypto/keystore', () => ({
  addressFromSeed: () => '',
  generateAndStoreWallet: async () => {},
  importAndStoreWallet: async () => {},
  listWallets: (n?: string) => h.listWallets(n),
  removeWallet: async () => {},
  revealSeed: async () => '',
  addNetworkView: (id: string, n: string) => h.addNetworkView(id, n),
}))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: async () => {} }))
vi.mock('@/lib/xrpl/query-reads', () => ({ fetchAccountStateOnce: async () => null }))
vi.mock('@/hooks/useAppUpdate', () => ({
  useAppUpdate: () => ({
    updateReady: false,
    applying: false,
    applyUpdate: () => {},
    checking: false,
    checkError: null,
    checkForUpdate: () => {},
    pendingRelease: null,
    blockedReason: null,
    declined: false,
    declineCurrent: () => {},
  }),
}))
vi.mock('@/lib/build-info', () => ({
  BUILD: { version: '0.0.0', commitSha: 'unknown-dev', builtAt: '' },
  shortSha: 'unknown',
  sourceUrl: 'https://example.invalid',
  formatBuiltAt: () => '',
}))

import { SettingsTab } from '../SettingsTab'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/app-store'

const base = { label: 'Savings', address: 'rSharedAddress', createdAt: 1, algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' }
const MAINNET = { ...base, id: 'w1', seedId: 's1', network: 'mainnet' }
const TESTNET = { ...base, id: 'w2', seedId: 's1', network: 'testnet' }
const OTHER = { ...base, id: 'w3', seedId: 's2', label: 'Spending', address: 'rOther', network: 'mainnet' }

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <SettingsTab />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

function setWallets(wallets: unknown[]) {
  useAppStore.setState({ wallets, activeWalletId: 'w1', network: 'mainnet' } as never)
}

beforeEach(() => {
  h.listWallets.mockReset().mockResolvedValue([])
  h.addNetworkView.mockReset().mockResolvedValue({})
})
afterEach(cleanup)

describe('Settings — use on another network', () => {
  it('offers only the networks a Seed has no view on, each named by wallet and network', () => {
    setWallets([MAINNET, OTHER])
    renderSettings()
    expect(screen.getByRole('button', { name: 'Use Savings on Testnet' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Use Spending on Testnet' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Use \w+ on Mainnet/ })).toBeNull()
  })

  it('offers nothing for a Seed that already has both views', () => {
    setWallets([MAINNET, TESTNET])
    renderSettings()
    expect(screen.queryByRole('button', { name: /^Use .* on / })).toBeNull()
  })

  it('adds the view without changing the active Wallet', async () => {
    setWallets([MAINNET])
    h.listWallets.mockResolvedValue([MAINNET, TESTNET])
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Use Savings on Testnet' }))
    await waitFor(() => expect(h.addNetworkView).toHaveBeenCalledWith('w1', 'testnet'))
    await waitFor(() => expect(useAppStore.getState().wallets).toHaveLength(2))
    expect(useAppStore.getState().activeWalletId).toBe('w1')
  })

  it('says only the view goes when the Seed has another view, and the seed goes when it has none', () => {
    setWallets([MAINNET, TESTNET, OTHER])
    renderSettings()
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    expect(screen.getByText(/removes this wallet from this network only/i)).toBeTruthy()
    cleanup()

    setWallets([MAINNET, TESTNET, OTHER])
    renderSettings()
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[2])
    expect(screen.getByText(/will no longer hold the encrypted seed/i)).toBeTruthy()
    expect(screen.queryByText(/network only/i)).toBeNull()
  })
})
