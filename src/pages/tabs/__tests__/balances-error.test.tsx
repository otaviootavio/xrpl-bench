/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const useAccountState = vi.fn()
const useTrustLines = vi.fn()

vi.mock('@/hooks/useAccountState', () => ({ useAccountState: () => useAccountState() }))
vi.mock('@/hooks/useTrustLines', () => ({ useTrustLines: () => useTrustLines() }))
vi.mock('@/hooks/useServerReserves', () => ({ useServerReserves: () => ({ data: undefined }) }))
vi.mock('@/hooks/useSpendableBalance', () => ({
  useSpendableBalance: () => ({ isLoading: false, spendableDrops: null, reservedDrops: null }),
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('@/components/wallet/AddressDisplay', () => ({ AddressDisplay: () => <div /> }))
vi.mock('@/store/app-store', () => ({
  useAppStore: (selector: (s: { network: string }) => unknown) => selector({ network: 'testnet' }),
  useActiveWallet: () => ({ id: 'w1', address: 'rBoGUS9uiK9m3Kk6qnGRvWWCwAeN8hF3wR', label: 'Test' }),
}))

import { BalancesTab } from '../BalancesTab'

function query(overrides: Record<string, unknown> = {}) {
  return { data: undefined, isLoading: false, isError: false, refetch: vi.fn(), ...overrides }
}

const ok = () => query({ data: [] })
const accountOk = () => query({ data: { exists: true, balanceDrops: '25000000', ownerCount: 0 } })

beforeEach(() => {
  useAccountState.mockReturnValue(accountOk())
  useTrustLines.mockReturnValue(ok())
})
afterEach(cleanup)

/**
 * The two reads this screen makes can each fail on their own, and each used to
 * fail invisibly: `account_info` left the whole panel blank, `account_lines`
 * left "No token balances yet" standing — a claim about what this account
 * holds, made from a read that never came back.
 */
describe('BalancesTab — a failed read is reported where the reading would be', () => {
  it('reports a failed balance read instead of rendering nothing', () => {
    useAccountState.mockReturnValue(query({ isError: true }))
    render(<BalancesTab />)

    expect(screen.getByText('Balance unavailable')).toBeTruthy()
  })

  it('retries the balance read from the control, and does not disable it', () => {
    const refetch = vi.fn().mockResolvedValue({})
    useAccountState.mockReturnValue(query({ isError: true, refetch }))
    render(<BalancesTab />)

    const retry = screen.getAllByRole('button', { name: 'Try again' })[0]
    expect(retry.hasAttribute('disabled')).toBe(false)
    expect(retry.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(retry)
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('does not show a retained balance under a green Live lamp when the refetch failed', () => {
    // TanStack keeps the previous data across a failed refetch, so `data` and
    // `isError` arrive together on the 15-second poll. A stale figure labelled
    // "Live" is the exact falsehood this epic exists to stop.
    useAccountState.mockReturnValue(query({ isError: true, data: { exists: true, balanceDrops: '25000000', ownerCount: 0 } }))
    render(<BalancesTab />)

    expect(screen.getByText('Balance unavailable')).toBeTruthy()
    expect(screen.queryByText('Live')).toBeNull()
    expect(screen.queryByText('25')).toBeNull()
  })

  it('does not offer the faucet on an activation state it just said it cannot read', () => {
    useAccountState.mockReturnValue(query({ isError: true, data: { exists: false, balanceDrops: '0', ownerCount: 0 } }))
    render(<BalancesTab />)

    expect(screen.queryByText('Account not activated yet')).toBeNull()
    expect(screen.queryByRole('button', { name: /Fund with Testnet XRP/ })).toBeNull()
  })

  it('never says "No token balances yet" when the trust-line read failed', () => {
    useTrustLines.mockReturnValue(query({ isError: true }))
    render(<BalancesTab />)

    expect(screen.getByText('Token balances unavailable')).toBeTruthy()
    expect(screen.queryByText('No token balances yet')).toBeNull()
  })

  it('withholds retained token balances when the trust-line refetch failed', () => {
    useTrustLines.mockReturnValue(
      query({
        isError: true,
        data: [{ account: 'rIssuer', currency: 'USD', balance: '42', limit: '1', freeze: false, freezePeer: false }],
      }),
    )
    render(<BalancesTab />)

    expect(screen.getByText('Token balances unavailable')).toBeTruthy()
    expect(screen.queryByText('USD')).toBeNull()
    expect(screen.queryByText('No token balances yet')).toBeNull()
  })

  it('still says "No token balances yet" when the read genuinely succeeds with none', () => {
    render(<BalancesTab />)

    expect(screen.getByText('No token balances yet')).toBeTruthy()
    expect(screen.queryByText('Token balances unavailable')).toBeNull()
  })
})
