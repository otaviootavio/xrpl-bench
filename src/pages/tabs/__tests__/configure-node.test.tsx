/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Story 17 (R12): the Node save flow of the Settings Node section (`network-display.test.tsx`),
 * driven through the Configure screen's Node plate: the custom-Node field, Test and save, and
 * Use built-in Nodes. The section's behaviour is unchanged; this pins that the plate mounts it.
 */
const h = vi.hoisted(() => ({
  verifyNode: vi.fn(),
  retireNode: vi.fn(),
  setWalletNode: vi.fn(),
  listWallets: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
  getLockInfo: async (id: string) => ({ id, openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }),
}))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: async () => {}, verifyNode: h.verifyNode, retireNode: h.retireNode }))
vi.mock('@/lib/notify', () => ({ toast: h.toast }))
vi.mock('@/lib/crypto/keystore', () => ({
  addressFromSeed: () => '',
  listWallets: (...a: unknown[]) => h.listWallets(...a),
  setWalletNode: (...a: unknown[]) => h.setWalletNode(...a),
  revealSeed: async () => ({ status: 'cancelled' }),
  addNetworkView: async () => ({}),
  unavailablePrompts: { pin: async () => null },
  describeCheckFailure: () => 'x',
}))
vi.mock('@/hooks/useAccountState', () => ({ useAccountState: () => ({ isError: false, data: undefined }) }))
vi.mock('@/components/wallet/RevealSeedControl', () => ({ RevealSeedControl: () => <button>Reveal seed</button> }))

import { ConfigureScreen } from '@/components/wallet/ConfigureScreen'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/app-store'

const base = { seedId: 's', lockId: 'l', label: 'Savings', address: 'rA', keyAddress: 'rA', createdAt: 1, algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' }
const TESTNET = { ...base, id: 't', network: 'testnet' }
const MAINNET = { ...base, id: 'm', network: 'mainnet' }

let qc: QueryClient
function mount(wallet: Record<string, unknown>) {
  useAppStore.setState({ wallets: [wallet], activeWalletId: wallet.id, openLocks: { l: { key: {} as CryptoKey, autoLockMinutes: 5 } } } as never)
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <ConfigureScreen wallet={wallet as never} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return within(screen.getByRole('region', { name: 'Node' }))
}

beforeEach(() => {
  for (const f of [h.verifyNode, h.retireNode, h.setWalletNode, h.listWallets, h.toast.success, h.toast.error]) f.mockReset()
  h.listWallets.mockResolvedValue([])
})
afterEach(cleanup)

describe('Configure: the Node plate', () => {
  it('names the built-in Nodes when no custom Node is set', () => {
    const node = mount(TESTNET)
    expect(node.getByText(/Built-in — wss:\/\/s\.altnet\.rippletest\.net:51233/)).toBeTruthy()
  })

  it('a rejected Node shows its reason and stores nothing', async () => {
    h.verifyNode.mockRejectedValue(new Error('This Node serves Testnet (network id 1), but this Wallet is on Mainnet (network id 0).'))
    const node = mount(MAINNET)
    fireEvent.change(node.getByLabelText(/Custom Node/), { target: { value: 'wss://x.example.com' } })
    fireEvent.click(node.getByRole('button', { name: 'Test and save' }))
    await waitFor(() => expect(node.getByRole('alert').textContent).toContain('network id 1'))
    expect(node.getByRole('alert').textContent).toMatch(/^Not saved\./)
    expect(h.verifyNode).toHaveBeenCalledWith('mainnet', 'wss://x.example.com')
    expect(h.setWalletNode).not.toHaveBeenCalled()
  })

  it('an accepted Node is trimmed and stored on this Wallet only, then the list refreshes and it says so', async () => {
    h.verifyNode.mockResolvedValue(undefined)
    h.setWalletNode.mockResolvedValue({})
    const node = mount(TESTNET)
    fireEvent.change(node.getByLabelText(/Custom Node/), { target: { value: ' wss://x.example.com ' } })
    fireEvent.click(node.getByRole('button', { name: 'Test and save' }))
    await waitFor(() => expect(h.setWalletNode).toHaveBeenCalledWith('t', 'wss://x.example.com'))
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith('Node saved for this wallet.'))
    expect(h.listWallets).toHaveBeenCalled()
  })

  it('a save retires the old socket and invalidates the account and network reads', async () => {
    h.verifyNode.mockResolvedValue(undefined)
    h.setWalletNode.mockResolvedValue({})
    const node = mount({ ...TESTNET, node: 'wss://old.example.com' })
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    fireEvent.change(node.getByLabelText(/Custom Node/), { target: { value: 'wss://new.example.com' } })
    fireEvent.click(node.getByRole('button', { name: 'Test and save' }))
    await waitFor(() => expect(h.retireNode).toHaveBeenCalledWith('testnet', 'wss://old.example.com'))
    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0])
    expect(keys).toEqual(expect.arrayContaining(['accountState', 'serverReserves', 'fee', 'destinationInfo']))
  })

  it('a failed save keeps the old Node: nothing stored, nothing retired', async () => {
    h.verifyNode.mockRejectedValue(new Error('nope'))
    const node = mount({ ...TESTNET, node: 'wss://old.example.com' })
    fireEvent.change(node.getByLabelText(/Custom Node/), { target: { value: 'wss://new.example.com' } })
    fireEvent.click(node.getByRole('button', { name: 'Test and save' }))
    await waitFor(() => expect(node.getByRole('alert')).toBeTruthy())
    expect(h.setWalletNode).not.toHaveBeenCalled()
    expect(h.retireNode).not.toHaveBeenCalled()
    expect(node.getByText(/Custom — wss:\/\/old\.example\.com/)).toBeTruthy()
  })

  it('a refresh that fails after the Node was stored does not say "Not saved"', async () => {
    h.verifyNode.mockResolvedValue(undefined)
    h.setWalletNode.mockResolvedValue({})
    h.listWallets.mockRejectedValue(new Error('idb down'))
    const node = mount(TESTNET)
    fireEvent.change(node.getByLabelText(/Custom Node/), { target: { value: 'wss://new.example.com' } })
    fireEvent.click(node.getByRole('button', { name: 'Test and save' }))
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(expect.stringMatching(/^Node saved, but the screen could not refresh/)))
    expect(h.setWalletNode).toHaveBeenCalledOnce()
    expect(node.queryByRole('alert')).toBeNull()
  })

  it('"Use built-in Nodes" is offered only with a custom Node, clears it, retires the socket and refreshes', async () => {
    h.setWalletNode.mockResolvedValue({})
    cleanup()
    expect(mount(TESTNET).queryByRole('button', { name: 'Use built-in Nodes' })).toBeNull()
    cleanup()
    const node = mount({ ...TESTNET, node: 'wss://old.example.com' })
    fireEvent.click(node.getByRole('button', { name: 'Use built-in Nodes' }))
    await waitFor(() => expect(h.setWalletNode).toHaveBeenCalledWith('t', undefined))
    await waitFor(() => expect(h.retireNode).toHaveBeenCalledWith('testnet', 'wss://old.example.com'))
    expect(h.verifyNode).not.toHaveBeenCalled()
  })
})
