/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A Synced Transmitter's Account (story 4; OS-FR-4, OS-FR-22). Real: the hooks, the
 * key factory, TanStack Query, the words. Faked: the ledger reads, so each read can
 * succeed, return nothing, or fail. A failed read is P-29 or "unavailable", never
 * "None." and never a retained figure.
 */
const h = vi.hoisted(() => ({
  account: vi.fn(),
  lines: vi.fn(),
  reserves: vi.fn(),
  delegates: vi.fn(),
}))
vi.mock('@/lib/xrpl/reads', () => ({
  fetchAccountState: (...a: unknown[]) => h.account(...a),
  fetchAccountLines: (...a: unknown[]) => h.lines(...a),
  fetchServerReserves: (...a: unknown[]) => h.reserves(...a),
  fetchAccountDelegates: (...a: unknown[]) => h.delegates(...a),
}))

import { TransmitterAccount } from '../TransmitterAccount'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { TransmitterMeta } from '@/lib/crypto/keystore'
import { queryKeys } from '@/lib/xrpl/query-keys'
import { DELEGATE_WARNING, NONE, VALUE_UNKNOWN } from '@/lib/transmitter-words'

const ADDR = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const DELEGATE = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const wallet: TransmitterMeta = { id: 't', seedId: 't', lockId: 'L', label: 'Send', createdAt: 1, network: 'testnet', openCheck: 'pin', kind: 'transmitter', address: ADDR }
const state = (over: Record<string, unknown> = {}) => ({
  exists: true,
  address: ADDR,
  balanceDrops: '25000000',
  ownerCount: 0,
  sequence: 5,
  requireDestTag: false,
  disableMasterKey: false,
  ...over,
})

function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <TransmitterAccount wallet={wallet} address={ADDR} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return client
}

const delegatesSection = () => screen.getByRole('region', { name: DELEGATE_WARNING })

beforeEach(() => {
  h.account.mockResolvedValue(state())
  h.lines.mockResolvedValue([])
  h.reserves.mockResolvedValue({ baseReserveDrops: '1000000', ownerReserveDrops: '200000' })
  h.delegates.mockResolvedValue([])
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Account on a Synced Transmitter (OS-FR-4)', () => {
  it('shows the balance, the key state and "None." for no trust lines and no delegates, reading the Synced address', async () => {
    mount()
    expect(await screen.findByText('25')).toBeTruthy()
    expect(screen.getByText('Master key on')).toBeTruthy()
    // No Regular Key: "None."; no trust lines: "None."; no delegates: "None.".
    await waitFor(() => expect(screen.getAllByText(NONE)).toHaveLength(3))
    expect(within(delegatesSection()).getByText(NONE)).toBeTruthy()
    for (const read of [h.account, h.lines, h.delegates]) expect(read).toHaveBeenCalledWith('testnet', ADDR, undefined)
    expect(screen.queryByRole('button', { name: /sign|fund|send/i })).toBeNull()
  })

  it('shows a set Regular Key and the master key off', async () => {
    h.account.mockResolvedValue(state({ regularKey: DELEGATE, disableMasterKey: true }))
    mount()
    expect(await screen.findByText('Master key off')).toBeTruthy()
    expect(document.body.textContent).toContain(DELEGATE.slice(0, 6))
  })

  it('lists each delegate with what the ledger lets it do (OS-FR-22)', async () => {
    h.delegates.mockResolvedValue([{ authorize: DELEGATE, permissions: ['Payment', 'TrustlineAuthorize'] }])
    mount()
    expect(await within(delegatesSection()).findByText('Payment, TrustlineAuthorize')).toBeTruthy()
    expect(within(delegatesSection()).queryByText(NONE)).toBeNull()
  })

  it('a failed balance read is unavailable, and every key-state row is P-29, never "None."', async () => {
    h.account.mockRejectedValue(new Error('down'))
    mount()
    expect(await screen.findByText('Balance unavailable')).toBeTruthy()
    expect(screen.getAllByText(VALUE_UNKNOWN)).toHaveLength(2)
    expect(screen.queryByText('Master key on')).toBeNull()
  })

  it('a failed delegates read is P-29, never "None." — also when an earlier answer is retained', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(queryKeys.delegates('testnet', ADDR), [{ authorize: DELEGATE, permissions: ['Payment'] }])
    h.delegates.mockRejectedValue(new Error('unknown type'))
    mount(client)
    await waitFor(() => expect(within(delegatesSection()).getByText(VALUE_UNKNOWN)).toBeTruthy())
    expect(within(delegatesSection()).queryByText('Payment')).toBeNull()
    expect(within(delegatesSection()).queryByText(NONE)).toBeNull()
  })

  it('a failed trust-line read says so, never "None."', async () => {
    h.lines.mockRejectedValue(new Error('down'))
    mount()
    expect(await screen.findByText('Token balances unavailable')).toBeTruthy()
    await waitFor(() => expect(screen.getAllByText(NONE)).toHaveLength(2))
  })

  it('an account not on the ledger is said as not activated, with no key state', async () => {
    h.account.mockResolvedValue(state({ exists: false, balanceDrops: '0' }))
    mount()
    expect(await screen.findByText('Account not activated yet')).toBeTruthy()
    expect(screen.queryByText('Master key on')).toBeNull()
  })
})
