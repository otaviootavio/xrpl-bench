/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const useAccountState = vi.fn()
const useTrustLines = vi.fn()
const useServerReserves = vi.fn()
const useSpendableBalance = vi.fn()

vi.mock('@/hooks/useAccountState', () => ({ useAccountState: () => useAccountState() }))
vi.mock('@/hooks/useTrustLines', () => ({ useTrustLines: () => useTrustLines() }))
vi.mock('@/hooks/useServerReserves', () => ({ useServerReserves: () => useServerReserves() }))
vi.mock('@/hooks/useSpendableBalance', () => ({ useSpendableBalance: () => useSpendableBalance() }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('@/components/wallet/AddressDisplay', () => ({ AddressDisplay: () => <div /> }))
vi.mock('@/store/app-store', () => ({
  useAppStore: (selector: (s: { network: string }) => unknown) => selector({ network: 'testnet' }),
  useActiveWallet: () => ({ id: 'w1', address: 'rBoGUS9uiK9m3Kk6qnGRvWWCwAeN8hF3wR', label: 'Test' }),
}))

import { BalancesTab } from '../BalancesTab'
import type { SpendableBalance } from '@/hooks/useSpendableBalance'

function query(overrides: Record<string, unknown> = {}) {
  return { data: undefined, isLoading: false, isError: false, refetch: vi.fn(), ...overrides }
}

const ok = () => query({ data: [] })
const accountOk = () => query({ data: { exists: true, balanceDrops: '25000000', ownerCount: 0 } })

/** The four outcomes `useSpendableBalance` now distinguishes, as fixtures. The
 * default is `loading`, which is what this suite's other cases used to get
 * from the old fixed constant — so none of them start seeing a second failure
 * or a second "Try again" button. */
function spendable(overrides: Partial<SpendableBalance> = {}): SpendableBalance {
  return {
    status: 'loading',
    isLoading: false,
    reserveFailed: false,
    accountFailed: false,
    retryReserves: vi.fn().mockResolvedValue({}),
    spendableDrops: null,
    reservedDrops: null,
    ...overrides,
  }
}

const spendableOk = () =>
  spendable({ status: 'ok', spendableDrops: '23400000', reservedDrops: '1600000' })

const reservesOk = () => query({ data: { baseReserveDrops: '1000000', ownerReserveDrops: '200000' } })

beforeEach(() => {
  useAccountState.mockReturnValue(accountOk())
  useTrustLines.mockReturnValue(ok())
  useServerReserves.mockReturnValue(reservesOk())
  useSpendableBalance.mockReturnValue(spendable())
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

/**
 * Story 5.2. The reserve read fails on its own, and used to fail in two
 * different silent ways: with nothing retained the hook reported neither
 * loading nor error, so `marks` came out empty and Spendable and Reserved left
 * the screen entirely — a balance with no obligation shown against it, which
 * reads as a *smaller* obligation. With an earlier answer retained the hook
 * computed from it and showed a Spendable figure derived from a read that was
 * in error at that moment.
 */
describe('BalancesTab — a failed reserve read is reported, not silently subtracted', () => {
  it('states the two derived readings as unavailable instead of dropping them', () => {
    useSpendableBalance.mockReturnValue(spendable({ status: 'unavailable', reserveFailed: true }))
    render(<BalancesTab />)

    expect(screen.getByText('Spendable')).toBeTruthy()
    expect(screen.getByText('Reserved')).toBeTruthy()
    expect(screen.getAllByText('Unavailable').length).toBe(2)
    expect(screen.getByText('Reserve unavailable')).toBeTruthy()
  })

  it('keeps the XRP balance on screen: a reserve failure takes down only what it derives', () => {
    useSpendableBalance.mockReturnValue(spendable({ status: 'unavailable', reserveFailed: true }))
    render(<BalancesTab />)

    expect(screen.getByText('25')).toBeTruthy()
    expect(screen.queryByText('Balance unavailable')).toBeNull()
    expect(screen.getByText('Live')).toBeTruthy()
  })

  it('shows no figure derived from a reserve read that is in error, even one the hook still offers', () => {
    // The screen-level half of the rule: if the gate were moved back to
    // `spendableDrops &&`, these figures would render beside a message saying
    // they could not be read.
    useSpendableBalance.mockReturnValue(
      spendable({ status: 'unavailable', reserveFailed: true, spendableDrops: '23400000', reservedDrops: '1600000' }),
    )
    render(<BalancesTab />)

    expect(screen.queryByText('23.4')).toBeNull()
    expect(screen.queryByText('1.6')).toBeNull()
    expect(screen.getAllByText('Unavailable').length).toBe(2)
  })

  it('retries the reserve read from a control that is never disabled', () => {
    const retryReserves = vi.fn().mockResolvedValue({})
    useSpendableBalance.mockReturnValue(spendable({ status: 'unavailable', reserveFailed: true, retryReserves }))
    render(<BalancesTab />)

    const retry = screen.getByRole('button', { name: 'Try again' })
    expect(retry.hasAttribute('disabled')).toBe(false)
    expect(retry.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(retry)
    expect(retryReserves).toHaveBeenCalledOnce()
  })

  it('says nothing while the reserve read is merely in flight — pending is not failed', () => {
    useSpendableBalance.mockReturnValue(spendable({ status: 'loading', isLoading: true }))
    render(<BalancesTab />)

    expect(screen.queryByText('Unavailable')).toBeNull()
    expect(screen.queryByText('Reserve unavailable')).toBeNull()
  })

  it('reports both failures separately when both reads fail', () => {
    useAccountState.mockReturnValue(query({ isError: true }))
    useSpendableBalance.mockReturnValue(
      spendable({ status: 'unavailable', reserveFailed: true, accountFailed: true }),
    )
    render(<BalancesTab />)

    expect(screen.getByText('Balance unavailable')).toBeTruthy()
    expect(screen.getByText('Reserve unavailable')).toBeTruthy()
  })

  it('reports no reserve failure when only the balance read failed', () => {
    useAccountState.mockReturnValue(query({ isError: true }))
    useSpendableBalance.mockReturnValue(spendable({ status: 'unavailable', accountFailed: true }))
    render(<BalancesTab />)

    expect(screen.getByText('Balance unavailable')).toBeTruthy()
    expect(screen.queryByText('Reserve unavailable')).toBeNull()
  })

  it('leaves the not-activated alert alone: an absent account is a successful read', () => {
    useAccountState.mockReturnValue(query({ data: { exists: false, balanceDrops: '0', ownerCount: 0 } }))
    useSpendableBalance.mockReturnValue(spendable({ status: 'not-activated' }))
    render(<BalancesTab />)

    expect(screen.getByText('Account not activated yet')).toBeTruthy()
    expect(screen.queryByText('Reserve unavailable')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('renders both figures when both reads succeed', () => {
    useAccountState.mockReturnValue(query({ data: { exists: true, balanceDrops: '25000000', ownerCount: 3 } }))
    useSpendableBalance.mockReturnValue(spendableOk())
    render(<BalancesTab />)

    expect(screen.getByText('23.4')).toBeTruthy()
    expect(screen.getByText('1.6')).toBeTruthy()
    expect(screen.queryByText('Unavailable')).toBeNull()
    expect(screen.getByText('3 owned objects')).toBeTruthy()
  })

  it('falls back to the prose when the reserve read has not answered yet', () => {
    // The `'the base reserve'` fallback that spec 3 judged graceful. It is
    // reached whenever there is no figure to engrave, and nothing else in this
    // suite exercises it now that the default fixture answers successfully.
    useAccountState.mockReturnValue(query({ data: { exists: false, balanceDrops: '0', ownerCount: 0 } }))
    useServerReserves.mockReturnValue(query({ data: undefined }))
    useSpendableBalance.mockReturnValue(spendable({ status: 'loading' }))
    render(<BalancesTab />)

    expect(screen.getByText(/the base reserve/)).toBeTruthy()
  })

  it('does not engrave a retained base reserve as current on the not-activated alert', () => {
    // Retained data again, on the one figure this screen prints outside the
    // readout: `data` and `isError` arrive together on the poll, and the
    // activation threshold would otherwise be stated from a read that is in
    // error right now.
    useAccountState.mockReturnValue(query({ data: { exists: false, balanceDrops: '0', ownerCount: 0 } }))
    useServerReserves.mockReturnValue(
      query({ isError: true, data: { baseReserveDrops: '1000000', ownerReserveDrops: '200000' } }),
    )
    useSpendableBalance.mockReturnValue(spendable({ status: 'unavailable', reserveFailed: true }))
    render(<BalancesTab />)

    expect(screen.getByText('Account not activated yet')).toBeTruthy()
    expect(screen.getByText(/the base reserve/)).toBeTruthy()
    expect(screen.queryByText(/1 XRP/)).toBeNull()
  })

  it('does not report a reserve failure where no derived figure would have been', () => {
    // No readout on screen: nothing is missing from it, and a message about a
    // Spendable row nobody can see describes a row that is not there.
    useAccountState.mockReturnValue(query({ data: { exists: false, balanceDrops: '0', ownerCount: 0 } }))
    useServerReserves.mockReturnValue(query({ isError: true }))
    useSpendableBalance.mockReturnValue(spendable({ status: 'unavailable', reserveFailed: true }))
    render(<BalancesTab />)

    expect(screen.queryByText('Reserve unavailable')).toBeNull()
  })

  it('does not report a reserve failure beside the first-load skeleton', () => {
    useAccountState.mockReturnValue(query({ isLoading: true }))
    useSpendableBalance.mockReturnValue(spendable({ status: 'unavailable', reserveFailed: true, isLoading: true }))
    render(<BalancesTab />)

    expect(screen.queryByText('Reserve unavailable')).toBeNull()
  })
})
