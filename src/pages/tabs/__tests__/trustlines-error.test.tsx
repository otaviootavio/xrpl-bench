/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const useTrustLines = vi.fn()

vi.mock('@/hooks/useTrustLines', () => ({ useTrustLines: () => useTrustLines() }))
vi.mock('@/hooks/useServerReserves', () => ({
  useServerReserves: () => ({ data: { baseReserveDrops: '1000000', ownerReserveDrops: '200000' } }),
}))
vi.mock('@/hooks/useSpendableBalance', () => ({
  useSpendableBalance: () => ({ isLoading: false, spendableDrops: '25000000', reservedDrops: '1000000' }),
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
// The row renders an AddressLink, which reads the store and mounts a Tooltip;
// neither is what this test is about.
vi.mock('@/components/wallet/TrustLineRow', () => ({
  TrustLineRow: ({ line }: { line: { currency: string } }) => <div>row:{line.currency}</div>,
}))
vi.mock('@/store/app-store', () => ({
  useAppStore: (selector: (s: { network: string; vaultKey: null }) => unknown) =>
    selector({ network: 'testnet', vaultKey: null }),
  useActiveWallet: () => ({ id: 'w1', address: 'rBoGUS9uiK9m3Kk6qnGRvWWCwAeN8hF3wR', label: 'Test' }),
}))

import { TrustLinesTab } from '../TrustLinesTab'

function query(overrides: Record<string, unknown> = {}) {
  return { data: undefined, isLoading: false, isError: false, refetch: vi.fn(), ...overrides }
}

const line = { account: 'rIssuer', currency: 'USD', balance: '0', limit: '1', freeze: false, freezePeer: false }

beforeEach(() => useTrustLines.mockReturnValue(query({ data: [] })))
afterEach(cleanup)

/**
 * `data?.length === 0` is `undefined === 0` on a first failed read, so the
 * empty branch never fired and the list rendered as nothing at all. On a failed
 * refetch TanStack keeps the previous data, so the *opposite* happened: "No
 * trust lines yet" could stand beside the failure. Both are covered here.
 */
describe('TrustLinesTab — a failed read is reported, never a silent or false blank', () => {
  it('reports a failed read instead of rendering an empty list', () => {
    useTrustLines.mockReturnValue(query({ isError: true }))
    render(<TrustLinesTab />)

    expect(screen.getByText('Trust lines unavailable')).toBeTruthy()
    expect(screen.queryByText('No trust lines yet')).toBeNull()
  })

  it('does not claim there are no trust lines when a refetch failed over retained data', () => {
    useTrustLines.mockReturnValue(query({ isError: true, data: [] }))
    render(<TrustLinesTab />)

    expect(screen.getByText('Trust lines unavailable')).toBeTruthy()
    expect(screen.queryByText('No trust lines yet')).toBeNull()
  })

  it('retries the read from the control, and does not disable it', () => {
    const refetch = vi.fn().mockResolvedValue({})
    useTrustLines.mockReturnValue(query({ isError: true, refetch }))
    render(<TrustLinesTab />)

    const retry = screen.getByRole('button', { name: 'Try again' })
    expect(retry.hasAttribute('disabled')).toBe(false)
    expect(retry.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(retry)
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('still says "No trust lines yet" when the read genuinely succeeds with none', () => {
    render(<TrustLinesTab />)

    expect(screen.getByText('No trust lines yet')).toBeTruthy()
    expect(screen.queryByText('Trust lines unavailable')).toBeNull()
  })

  it('leaves lines that did load on screen when a refetch fails', () => {
    useTrustLines.mockReturnValue(query({ isError: true, data: [line] }))
    render(<TrustLinesTab />)

    expect(screen.getByText('Trust lines unavailable')).toBeTruthy()
    expect(screen.getByText('row:USD')).toBeTruthy()
  })
})
