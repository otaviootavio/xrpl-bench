/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The Configure counterpart of `settings-network-views.test.tsx` (test design R12): the
 * Other networks plate, driven through the Configure screen. The remove-dialog scenario
 * of that file is not a Configure concern (Remove lives on the chooser).
 */
const h = vi.hoisted(() => ({
  listWallets: vi.fn(async (_n?: string): Promise<unknown[]> => []),
  addNetworkView: vi.fn(async (_id: string, _n: string): Promise<unknown> => ({})),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {}, getLockInfo: async () => ({ id: 'legacy', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }) }))
vi.mock('@/lib/notify', () => ({ toast: h.toast }))
vi.mock('@/lib/crypto/keystore', () => ({
  addressFromSeed: () => '',
  listWallets: (n?: string) => h.listWallets(n),
  revealSeed: async () => '',
  unavailablePrompts: { pin: async () => null },
  describeCheckFailure: () => 'x',
  setWalletNode: async () => {},
  addNetworkView: (id: string, n: string) => h.addNetworkView(id, n),
}))
vi.mock('@/hooks/useAccountState', () => ({ useAccountState: () => ({ isError: false, data: undefined }) }))

import { ConfigureScreen } from '@/components/wallet/ConfigureScreen'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/app-store'

const base = { lockId: 'legacy', label: 'Savings', address: 'rSharedAddress', keyAddress: 'rSharedAddress', createdAt: 1, algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' }
const MAINNET = { ...base, id: 'w1', seedId: 's1', network: 'mainnet' }
const TESTNET = { ...base, id: 'w2', seedId: 's1', network: 'testnet' }
const DEVNET = { ...base, id: 'w4', seedId: 's1', network: 'devnet' }
const OTHER = { ...base, id: 'w3', seedId: 's2', label: 'Spending', address: 'rOther', keyAddress: 'rOther', network: 'mainnet' }

function mount(wallet: Record<string, unknown>) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <ConfigureScreen wallet={wallet as never} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

function setWallets(wallets: unknown[], active = 'w1') {
  useAppStore.setState({ wallets, activeWalletId: active, network: 'mainnet', openLocks: { legacy: { key: {} as CryptoKey, autoLockMinutes: 5 } } } as never)
}

beforeEach(() => {
  h.listWallets.mockReset().mockResolvedValue([])
  h.addNetworkView.mockReset().mockResolvedValue({})
  h.toast.success.mockReset()
  h.toast.error.mockReset()
})
afterEach(cleanup)

describe('Configure: Other networks', () => {
  it('offers one key per network the Seed has no view on, and counts only this Seed\'s views', () => {
    setWallets([MAINNET, OTHER])
    mount(MAINNET)
    expect(screen.getByRole('button', { name: 'Use on Testnet' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Use on Devnet' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Use on Mainnet' })).toBeNull()
  })

  it('a Testnet-only Seed offers Mainnet and Devnet', () => {
    setWallets([TESTNET], 'w2')
    mount(TESTNET)
    expect(screen.getAllByRole('button', { name: /^Use on / }).map((b) => b.textContent)).toEqual(['Use on Mainnet', 'Use on Devnet'])
  })

  it('says so in one line, with no keys, when the Seed is on every network', () => {
    setWallets([MAINNET, TESTNET, DEVNET])
    mount(MAINNET)
    expect(screen.getByText('This key is already set up on every network.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Use on / })).toBeNull()
  })

  it('adds a Testnet view in one step, refreshes the wallets, keeps the selection and says so', async () => {
    setWallets([MAINNET])
    h.listWallets.mockResolvedValue([MAINNET, TESTNET])
    mount(MAINNET)
    fireEvent.click(screen.getByRole('button', { name: 'Use on Testnet' }))
    await waitFor(() => expect(h.addNetworkView).toHaveBeenCalledWith('w1', 'testnet'))
    await waitFor(() => expect(useAppStore.getState().wallets).toHaveLength(2))
    expect(useAppStore.getState().activeWalletId).toBe('w1')
    expect(h.toast.success).toHaveBeenCalledWith('Wallet added on Testnet.')
    expect(screen.queryByText(/on Mainnet\?/)).toBeNull()
  })

  it('a second press while the add is in flight adds nothing more', async () => {
    setWallets([MAINNET])
    let settle!: (v: unknown) => void
    h.addNetworkView.mockReturnValue(new Promise((r) => (settle = r)))
    h.listWallets.mockResolvedValue([MAINNET, TESTNET])
    mount(MAINNET)
    const key = screen.getByRole('button', { name: 'Use on Testnet' })
    fireEvent.click(key)
    fireEvent.click(key)
    expect(h.addNetworkView).toHaveBeenCalledTimes(1)
    await act(async () => settle({}))
  })

  it('shows the error message when adding fails', async () => {
    setWallets([TESTNET], 'w2')
    h.addNetworkView.mockRejectedValue(new Error('Policy refuses this.'))
    mount(TESTNET)
    fireEvent.click(screen.getByRole('button', { name: 'Use on Devnet' }))
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith('Policy refuses this.'))
    expect(h.toast.success).not.toHaveBeenCalled()
  })

  it('asks before adding the Mainnet view, with the shipped words; nothing is added until confirmed', async () => {
    setWallets([TESTNET], 'w2')
    h.listWallets.mockResolvedValue([TESTNET, MAINNET])
    mount(TESTNET)
    fireEvent.click(screen.getByRole('button', { name: 'Use on Mainnet' }))
    expect(await screen.findByText('Use Savings on Mainnet?')).toBeTruthy()
    expect(
      screen.getByText('Mainnet moves real funds. This adds the same key as a wallet on Mainnet; nothing is sent. Anything sent to this address there is real XRP.'),
    ).toBeTruthy()
    expect(h.addNetworkView).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Use on Mainnet' }))
    await waitFor(() => expect(h.addNetworkView).toHaveBeenCalledWith('w2', 'mainnet'))
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith('Wallet added on Mainnet.'))
    expect(useAppStore.getState().activeWalletId).toBe('w2')
  })

  it('shows a policy refusal from the Mainnet add', async () => {
    setWallets([TESTNET], 'w2')
    h.addNetworkView.mockRejectedValue(new Error('Mainnet needs an Open Check.'))
    mount(TESTNET)
    fireEvent.click(screen.getByRole('button', { name: 'Use on Mainnet' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use on Mainnet' }))
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith('Mainnet needs an Open Check.'))
  })

  it('Cancel adds nothing and returns focus to the opener', async () => {
    setWallets([TESTNET], 'w2')
    mount(TESTNET)
    const opener = screen.getByRole('button', { name: 'Use on Mainnet' })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('Use Savings on Mainnet?')).toBeNull())
    expect(h.addNetworkView).not.toHaveBeenCalled()
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it('after Confirm the opener is gone: focus lands on the plate', async () => {
    setWallets([TESTNET], 'w2')
    h.listWallets.mockResolvedValue([TESTNET, MAINNET])
    mount(TESTNET)
    const opener = screen.getByRole('button', { name: 'Use on Mainnet' })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.click(await screen.findByRole('button', { name: 'Use on Mainnet' }))
    await waitFor(() => expect(screen.queryByText('Use Savings on Mainnet?')).toBeNull())
    await waitFor(() => expect(document.activeElement?.getAttribute('data-configure-plate')).toBe('other-networks'))
  })
})
