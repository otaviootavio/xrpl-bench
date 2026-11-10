/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Synced address plate (offline signing story 4; OS-FR-4, P-8, P-46). Real: the
 * plate, the store, the key factory and a real QueryClient. Faked: the keystore
 * write and the lock read. A Sync change or removal drops the old address's cached
 * reads; the same address as an Offline Wallet here is warned.
 */
const h = vi.hoisted(() => ({ sync: vi.fn(), listWallets: vi.fn() }))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({
  getLockInfo: async (id: string) => ({ id, openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }),
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
}))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: () => {}, retireNode: vi.fn(), verifyNode: vi.fn(), getXrplClient: vi.fn() }))
vi.mock('@/lib/crypto/keystore', () => ({
  setTransmitterSync: (...a: unknown[]) => h.sync(...a),
  listWallets: (...a: unknown[]) => h.listWallets(...a),
  renameWallet: vi.fn(),
  setLockAutoLock: vi.fn(),
  setShowBeforeSending: vi.fn(),
}))

import { WalletTab } from '../WalletTab'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/app-store'
import { queryKeys } from '@/lib/xrpl/query-keys'
import type { TransmitterMeta } from '@/lib/crypto/keystore'

const A = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const B = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const tx = (address: string | null): TransmitterMeta => ({ id: 't', seedId: 't', lockId: 'LT', label: 'Send', createdAt: 1, network: 'testnet', openCheck: 'pin', kind: 'transmitter', address })
const offline = { id: 'o', seedId: 'o', lockId: 'LO', label: 'Savings', address: B, keyAddress: B, createdAt: 1, network: 'mainnet', algorithm: 'ed25519', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard', kind: 'offline' }

function seed(client: QueryClient, address: string) {
  client.setQueryData(queryKeys.accountState('testnet', address), { exists: true })
  client.setQueryData(queryKeys.delegates('testnet', address), [])
  client.setQueryData(queryKeys.accountTx('testnet', address), { pages: [], pageParams: [] })
}
const cached = (client: QueryClient, address: string) =>
  [queryKeys.accountState('testnet', address), queryKeys.delegates('testnet', address), queryKeys.accountTx('testnet', address)].map((k) => client.getQueryData(k) !== undefined)

function mount(client: QueryClient) {
  const Live = () => {
    const w = useAppStore((s) => s.wallets.find((x) => x.id === 't'))
    return w ? <WalletTab wallet={w} /> : null
  }
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <Live />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  h.sync.mockReset()
  h.listWallets.mockReset()
})
afterEach(cleanup)

describe('the Synced address plate (OS-FR-4)', () => {
  it('a change A to B, then a removal, each drop the old address\'s cached reads, from the write\'s own result', async () => {
    const client = new QueryClient()
    useAppStore.setState({ wallets: [tx(A)], openLocks: { LT: {} } } as never)
    seed(client, A)
    // A re-list that fails after the write must not matter: the store takes the returned meta.
    h.listWallets.mockRejectedValue(new Error('vault'))
    h.sync.mockImplementation(async (_id: string, next: string | null) => tx(next))
    mount(client)
    fireEvent.change(screen.getByRole('textbox', { name: 'Address' }), { target: { value: B } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sync to an address' }))
    })
    expect(h.sync).toHaveBeenCalledWith('t', B)
    await waitFor(() => expect(useAppStore.getState().wallets[0].address).toBe(B))
    expect(cached(client, A)).toEqual([false, false, false])
    seed(client, B)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove the address' }))
    })
    expect(h.sync).toHaveBeenLastCalledWith('t', null)
    await waitFor(() => expect(useAppStore.getState().wallets[0].address).toBeNull())
    expect(cached(client, B)).toEqual([false, false, false])
  })

  it('a failed write changes nothing and keeps the cached reads', async () => {
    const client = new QueryClient()
    useAppStore.setState({ wallets: [tx(A)], openLocks: { LT: {} } } as never)
    seed(client, A)
    h.sync.mockRejectedValue(new Error('raw developer text'))
    mount(client)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove the address' }))
    })
    expect(useAppStore.getState().wallets[0].address).toBe(A)
    expect(cached(client, A)).toEqual([true, true, true])
    expect(document.body.textContent).not.toContain('raw developer text')
  })

  it('warns with P-8, linked to the field, when an Offline Wallet here has the address; Sync is still offered', async () => {
    useAppStore.setState({ wallets: [tx(null), offline], openLocks: { LT: {} } } as never)
    mount(new QueryClient())
    const field = screen.getByRole('textbox', { name: 'Address' })
    fireEvent.change(field, { target: { value: B } })
    const warning = screen.getByText('WARNING: An offline wallet on this device has this address.')
    const id = field.getAttribute('aria-describedby')
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)?.contains(warning)).toBe(true)
    expect(screen.getByRole('button', { name: 'Sync to an address' }).getAttribute('aria-disabled')).toBeNull()
    expect(field.getAttribute('autocapitalize')).toBe('off')
  })
})
