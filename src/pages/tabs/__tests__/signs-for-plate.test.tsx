/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Signs for plate (offline signing story 10; OS-FR-20, P-40, P-17, P-35). Real:
 * the plate, the store, the key factory and a real QueryClient. Faked: the keystore
 * write and the lock read. Online and Offline Wallets have it; a change of the
 * Account drops the old Account's cached reads on an Online Wallet.
 */
const h = vi.hoisted(() => ({ setSignsFor: vi.fn(), lockInfo: vi.fn(), clearRound: vi.fn() }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
  extendLockSession: async () => {},
  getLockInfo: (id: string) => h.lockInfo(id),
}))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/components/wallet/RevealSeedControl', () => ({ RevealSeedControl: () => <button>Reveal seed</button> }))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: () => {}, retireNode: vi.fn(), verifyNode: vi.fn(), getXrplClient: vi.fn(() => new Promise(() => {})), holdXrplClient: vi.fn(() => new Promise(() => {})) }))
vi.mock('@/lib/crypto/keystore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/crypto/keystore')>()
  return { ...actual, setSignsFor: (...a: unknown[]) => h.setSignsFor(...a) }
})

vi.mock('@/lib/offline-round', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/offline-round')>()
  return { ...actual, clearRound: (...a: unknown[]) => h.clearRound(...a) }
})

import { WalletTab } from '../WalletTab'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/app-store'
import { queryKeys } from '@/lib/xrpl/query-keys'
import { SignsForRefusedError, type KeyWalletMeta } from '@/lib/crypto/keystore'

const KEY = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const X = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const meta = (kind: 'online' | 'offline', address = KEY, extra: Partial<KeyWalletMeta> = {}): KeyWalletMeta =>
  ({ id: 'w', seedId: 'w', lockId: 'L', label: 'Savings', address, keyAddress: KEY, createdAt: 1, network: 'testnet', algorithm: 'ed25519', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard', kind, ...extra }) as KeyWalletMeta

function mount(client = new QueryClient()) {
  const Live = () => {
    const w = useAppStore((s) => s.wallets.find((x) => x.id === 'w'))
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
const plate = () => screen.getByRole('heading', { name: 'This key signs for another account' }).closest('section') as HTMLElement

beforeEach(() => {
  h.setSignsFor.mockReset()
  h.clearRound.mockReset()
  h.lockInfo.mockReset().mockResolvedValue({ id: 'L', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false })
})
afterEach(cleanup)

describe('the Signs for plate (OS-FR-20)', () => {
  it.each(['online', 'offline'] as const)('on an %s Wallet: the fixed-string title, Address with P-40 under it, Set it held until an address checks', async (kind) => {
    useAppStore.setState({ wallets: [meta(kind)], openLocks: { L: {} } } as never)
    mount()
    const p = plate()
    const field = within(p).getByRole('textbox', { name: 'Address' })
    expect(within(p).getByText('This key must be the Regular Key of that account.').id).toBe(field.getAttribute('aria-describedby'))
    const set = within(p).getByRole('button', { name: 'Set it' })
    expect(set.getAttribute('aria-disabled')).toBe('true')
    // It signs for itself: no state line and no remove key.
    expect(within(p).queryByText(/This wallet signs for/)).toBeNull()
    expect(within(p).queryByRole('button', { name: 'Remove the address' })).toBeNull()
    fireEvent.change(field, { target: { value: 'rNOT' } })
    expect(within(p).getByText("That doesn't look like a valid XRPL address.")).toBeTruthy()
    fireEvent.click(set)
    expect(h.setSignsFor).not.toHaveBeenCalled()
  })

  it('Set it writes the Account; the plate then states it in P-17\'s sentence and offers the removal (Offline)', async () => {
    useAppStore.setState({ wallets: [meta('offline')], openLocks: { L: {} } } as never)
    h.setSignsFor.mockImplementation(async (_id: string, next: string | null) => meta('offline', next ?? KEY))
    mount()
    fireEvent.change(within(plate()).getByRole('textbox', { name: 'Address' }), { target: { value: ` ${X} ` } })
    await act(async () => void fireEvent.click(within(plate()).getByRole('button', { name: 'Set it' })))
    expect(h.setSignsFor).toHaveBeenCalledWith('w', X)
    await waitFor(() => expect(within(plate()).getByText(`This wallet signs for ${X}.`)).toBeTruthy())
    // The kept round was for the old Account: erased (frozen matrix row).
    expect(h.clearRound).toHaveBeenCalledWith('w')
    await act(async () => void fireEvent.click(within(plate()).getByRole('button', { name: 'Remove the address' })))
    expect(h.setSignsFor).toHaveBeenLastCalledWith('w', null)
    await waitFor(() => expect(within(plate()).queryByText(/This wallet signs for/)).toBeNull())
  })

  it('an Online change drops the old Account\'s cached reads, from the write\'s own result', async () => {
    const client = new QueryClient()
    useAppStore.setState({ wallets: [meta('online', X)], openLocks: { L: {} } } as never)
    client.setQueryData(queryKeys.accountState('testnet', X), { exists: true })
    client.setQueryData(queryKeys.accountTx('testnet', X), { pages: [], pageParams: [] })
    h.setSignsFor.mockImplementation(async () => meta('online', KEY))
    mount(client)
    await act(async () => void fireEvent.click(within(plate()).getByRole('button', { name: 'Remove the address' })))
    await waitFor(() => expect(useAppStore.getState().wallets[0].address).toBe(KEY))
    expect(client.getQueryData(queryKeys.accountState('testnet', X))).toBeUndefined()
    expect(client.getQueryData(queryKeys.accountTx('testnet', X))).toBeUndefined()
  })

  it('FR-93: a duplicate is refused in P-35, and nothing changes', async () => {
    useAppStore.setState({ wallets: [meta('offline')], openLocks: { L: {} } } as never)
    h.setSignsFor.mockRejectedValue(new SignsForRefusedError('duplicate', 'Another wallet on this device has this address on Testnet.'))
    mount()
    fireEvent.change(within(plate()).getByRole('textbox', { name: 'Address' }), { target: { value: X } })
    await act(async () => void fireEvent.click(within(plate()).getByRole('button', { name: 'Set it' })))
    expect(within(plate()).getByRole('alert').textContent).toBe('Another wallet on this device has this address on Testnet.')
    expect(useAppStore.getState().wallets[0].address).toBe(KEY)
  })

  it("a Wallet sharing its Seed record (today's controlled views) shows its Account and no keys until story 12", () => {
    useAppStore.setState({ wallets: [meta('online', X), meta('online', KEY, { id: 'own' })], openLocks: { L: {} } } as never)
    mount()
    expect(within(plate()).getByText(`This wallet signs for ${X}.`)).toBeTruthy()
    expect(within(plate()).queryByRole('textbox')).toBeNull()
    expect(within(plate()).queryByRole('button')).toBeNull()
  })

  it('a Transmitter has no Signs for plate', () => {
    useAppStore.setState({ wallets: [{ id: 'w', seedId: 'w', lockId: 'L', label: 'Send', createdAt: 1, network: 'testnet', openCheck: 'pin', kind: 'transmitter', address: null }], openLocks: { L: {} } } as never)
    mount()
    expect(screen.queryByRole('heading', { name: 'This key signs for another account' })).toBeNull()
  })

  it('P-8 second form when an Offline Wallet would sign for an Account a Transmitter here is synced to (warned, Set it stays)', () => {
    const transmitter = { id: 't', seedId: 't', lockId: 'LT', label: 'Carrier', createdAt: 1, network: 'testnet', openCheck: 'pin', kind: 'transmitter', address: X }
    useAppStore.setState({ wallets: [meta('offline'), transmitter], openLocks: { L: {} } } as never)
    mount()
    expect(within(plate()).queryByText(/^WARNING: A Transmitter wallet/)).toBeNull()
    fireEvent.change(within(plate()).getByRole('textbox', { name: 'Address' }), { target: { value: X } })
    expect(within(plate()).getByText(/^WARNING: A Transmitter wallet on this device has this address\./)).toBeTruthy()
    expect(within(plate()).getByRole('button', { name: 'Set it' }).getAttribute('aria-disabled')).toBeNull()
  })
})
