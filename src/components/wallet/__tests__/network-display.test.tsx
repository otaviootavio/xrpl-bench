/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ verifyNode: vi.fn(), retireNode: vi.fn(), setWalletNode: vi.fn(), listWallets: vi.fn() }))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {}, getLockInfo: async () => ({ id: 'legacy', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }) }))
vi.mock('@/lib/xrpl/client', () => ({ verifyNode: h.verifyNode, retireNode: h.retireNode }))
vi.mock('@/lib/crypto/keystore', () => ({ setWalletNode: h.setWalletNode, listWallets: h.listWallets }))
vi.mock('@/lib/notify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

import { AppHeader } from '@/components/AppHeader'
import { DevnetNotice } from '@/components/wallet/DevnetNotice'
import { WalletNodeSection } from '@/components/wallet/WalletNodeSection'
import { TooltipProvider } from '@/components/ui/tooltip'
import { accountExplorerUrl, txExplorerUrl } from '@/lib/xrpl/networks'
import { useAppStore } from '@/store/app-store'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const OPEN = { legacy: { key: {} as CryptoKey, autoLockMinutes: 5 } }
const base = { seedId: 's', lockId: 'legacy', label: 'W', address: 'rA', createdAt: 1, algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' }
const W = (id: string, network: string) => ({ ...base, id, network }) as never
const WM = (id: string, network: string) => ({ ...base, id, network })

describe('the header names the active Wallet\'s network in words', () => {
  it('Mainnet says "Real funds" beside the name; Testnet and Devnet do not', () => {
    useAppStore.setState({ wallets: [W('m', 'mainnet'), W('t', 'testnet'), W('d', 'devnet')], activeWalletId: 'm', openLocks: OPEN })
    render(<AppHeader />)
    expect(screen.getByText('Mainnet')).toBeTruthy()
    expect(screen.getByText('Real funds')).toBeTruthy()

    act(() => { useAppStore.setState({ activeWalletId: 't' }) })
    expect(screen.getByText('Testnet')).toBeTruthy()
    expect(screen.queryByText('Real funds')).toBeNull()

    act(() => { useAppStore.setState({ activeWalletId: 'd' }) })
    expect(screen.getByText('Devnet')).toBeTruthy()
    expect(screen.queryByText('Real funds')).toBeNull()
    // Devnet can be reset: said in words beside the name, and only there.
    expect(screen.getByText('Not stable')).toBeTruthy()

    act(() => { useAppStore.setState({ activeWalletId: 't' }) })
    expect(screen.queryByText('Not stable')).toBeNull()
  })

  it('renders no network at all when there is no active Wallet', () => {
    useAppStore.setState({ wallets: [W('m', 'mainnet')], activeWalletId: null, network: 'mainnet' })
    render(<AppHeader />)
    expect(screen.queryByText('Mainnet')).toBeNull()
    expect(screen.queryByText('Real funds')).toBeNull()
  })

  it('the picker labels each Wallet with its network, and there is no network switch', () => {
    useAppStore.setState({ wallets: [W('m', 'mainnet'), W('t', 'testnet')], activeWalletId: 'm', openLocks: OPEN })
    render(<AppHeader />)
    expect(screen.queryByRole('radiogroup', { name: 'Network' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Active wallet' }).textContent).toContain('Mainnet')
  })
})

describe('a locked Wallet is its name and nothing else (AD-26)', () => {
  it('the picker names every Wallet but gives a network only for an open one, and the plate is withheld', () => {
    useAppStore.setState({
      wallets: [{ ...WM('m', 'mainnet'), lockId: 'X', label: 'Open one' }, { ...WM('t', 'testnet'), lockId: 'Y', label: 'Locked one' }] as never,
      activeWalletId: 't',
      openLocks: { X: OPEN.legacy },
    })
    render(<AppHeader />)
    // The active Wallet is locked: no network plate, no lock button, and its picker entry is a name.
    expect(screen.queryByText('Testnet')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Lock wallet' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Active wallet' }).textContent).toBe('Locked one')
    fireEvent.click(screen.getByRole('combobox', { name: 'Active wallet' }))
    expect(screen.getByRole('option', { name: 'Open one · Mainnet' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Locked one' })).toBeTruthy()
  })

  it('the lock button closes only the active Wallet\'s lock', () => {
    useAppStore.setState({
      wallets: [{ ...WM('m', 'mainnet'), lockId: 'X' }, { ...WM('t', 'testnet'), lockId: 'Y' }] as never,
      activeWalletId: 'm',
      openLocks: { X: OPEN.legacy, Y: OPEN.legacy },
    })
    render(<AppHeader />)
    fireEvent.click(screen.getByRole('button', { name: 'Lock wallet' }))
    expect(Object.keys(useAppStore.getState().openLocks)).toEqual(['Y'])
  })
})

describe('Devnet', () => {
  it('shows the instability notice as visible text, only on Devnet', () => {
    const { container, rerender } = render(<DevnetNotice network="devnet" />)
    expect(container.textContent).toContain('not a stable ledger')
    expect(container.textContent).toContain('it can be reset, so a Wallet may need re-funding')
    rerender(<DevnetNotice network="testnet" />)
    expect(container.textContent).toBe('')
  })

  it('links to the Devnet explorer', () => {
    // check-explorer-links-allow
    expect(accountExplorerUrl('devnet', 'rA')).toBe('https://devnet.xrpl.org/accounts/rA')
    // check-explorer-links-allow
    expect(txExplorerUrl('devnet', 'AB')).toBe('https://devnet.xrpl.org/transactions/AB')
  })
})

describe('Settings Node section', () => {
  let qc: QueryClient
  function renderSection(wallet: object) {
    qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <WalletNodeSection wallet={wallet as never} />
        </TooltipProvider>
      </QueryClientProvider>,
    )
  }

  it('a rejected Node shows its reason and stores nothing', async () => {
    h.verifyNode.mockRejectedValue(new Error('This Node serves Testnet (network id 1), but this Wallet is on Mainnet (network id 0).'))
    renderSection(WM('m', 'mainnet'))
    fireEvent.change(screen.getByLabelText(/Custom Node/), { target: { value: 'wss://x.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Test and save' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('network id 1'))
    expect(h.verifyNode).toHaveBeenCalledWith('mainnet', 'wss://x.example.com')
    expect(h.setWalletNode).not.toHaveBeenCalled()
  })

  it('an accepted Node is stored on that Wallet only', async () => {
    h.verifyNode.mockResolvedValue(undefined)
    h.setWalletNode.mockResolvedValue({})
    h.listWallets.mockResolvedValue([])
    renderSection(W('t', 'testnet'))
    fireEvent.change(screen.getByLabelText(/Custom Node/), { target: { value: ' wss://x.example.com ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Test and save' }))
    await waitFor(() => expect(h.setWalletNode).toHaveBeenCalledWith('t', 'wss://x.example.com'))
  })

  it('an accepted save refreshes the list, retires the old socket and invalidates account and network reads', async () => {
    h.verifyNode.mockResolvedValue(undefined)
    h.setWalletNode.mockResolvedValue({})
    h.listWallets.mockResolvedValue([])
    renderSection({ ...WM('t', 'testnet'), node: 'wss://old.example.com' })
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    fireEvent.change(screen.getByLabelText(/Custom Node/), { target: { value: 'wss://new.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Test and save' }))
    await waitFor(() => expect(h.retireNode).toHaveBeenCalledWith('testnet', 'wss://old.example.com'))
    expect(h.listWallets).toHaveBeenCalled()
    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0])
    expect(keys).toEqual(expect.arrayContaining(['accountState', 'serverReserves', 'fee', 'destinationInfo']))
  })

  it('"Use built-in Nodes" clears the Node, retires the socket and refreshes', async () => {
    h.setWalletNode.mockResolvedValue({})
    h.listWallets.mockResolvedValue([])
    renderSection({ ...WM('t', 'testnet'), node: 'wss://old.example.com' })
    fireEvent.click(screen.getByRole('button', { name: 'Use built-in Nodes' }))
    await waitFor(() => expect(h.setWalletNode).toHaveBeenCalledWith('t', undefined))
    await waitFor(() => expect(h.retireNode).toHaveBeenCalledWith('testnet', 'wss://old.example.com'))
    expect(h.verifyNode).not.toHaveBeenCalled()
  })

  it('a refresh that fails after the Node was stored does not say "Not saved"', async () => {
    h.verifyNode.mockResolvedValue(undefined)
    h.setWalletNode.mockResolvedValue({})
    h.listWallets.mockRejectedValue(new Error('idb down'))
    renderSection(WM('t', 'testnet'))
    fireEvent.change(screen.getByLabelText(/Custom Node/), { target: { value: 'wss://new.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Test and save' }))
    await waitFor(() => expect(h.listWallets).toHaveBeenCalled())
    expect(h.setWalletNode).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a failed save keeps the old Node: nothing stored, nothing retired', async () => {
    h.verifyNode.mockRejectedValue(new Error('nope'))
    renderSection({ ...WM('t', 'testnet'), node: 'wss://old.example.com' })
    fireEvent.change(screen.getByLabelText(/Custom Node/), { target: { value: 'wss://new.example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Test and save' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(h.setWalletNode).not.toHaveBeenCalled()
    expect(h.retireNode).not.toHaveBeenCalled()
    expect(screen.getByText(/Custom — wss:\/\/old\.example\.com/)).toBeTruthy()
  })

  it('names the built-in Nodes when no custom Node is set', () => {
    renderSection(W('t', 'testnet'))
    expect(screen.getByText(/Built-in — wss:\/\/s\.altnet\.rippletest\.net:51233/)).toBeTruthy()
  })
})
