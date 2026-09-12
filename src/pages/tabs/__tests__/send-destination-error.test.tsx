/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const useDestinationInfo = vi.fn()

vi.mock('@/hooks/useDestinationInfo', () => ({ useDestinationInfo: () => useDestinationInfo() }))
vi.mock('@/hooks/useRecommendedFee', () => ({ useRecommendedFee: () => ({ data: '12' }) }))
vi.mock('@/hooks/useTrustLines', () => ({ useTrustLines: () => ({ data: [] }) }))
vi.mock('@/hooks/useSpendableBalance', () => ({
  useSpendableBalance: () => ({ isLoading: false, spendableDrops: '100000000', reservedDrops: '1000000' }),
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('@/store/app-store', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ network: 'testnet', vaultKey: null, addressBook: [], addAddressBookEntry: vi.fn() }),
  useActiveWallet: () => ({ id: 'w1', address: 'r4NagxniGTmPRr8yBRXRD6NNpZP7FfP4KR', label: 'Test' }),
}))

import { SendTab } from '../SendTab'

// Real addresses: `isValidClassicAddress` is the actual xrpl checksum check,
// not a mock, so a made-up string would fail validation before anything this
// test is about is reached.
const DESTINATION = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'

function query(overrides: Record<string, unknown> = {}) {
  return { data: undefined, isError: false, isFetching: false, refetch: vi.fn().mockResolvedValue({}), ...overrides }
}

/** Fill in everything a send needs EXCEPT knowing about the destination. */
function fillValidForm() {
  fireEvent.change(screen.getByLabelText('Destination address'), { target: { value: DESTINATION } })
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1' } })
}

const reviewButton = () => screen.getByRole('button', { name: 'Review payment' }) as HTMLButtonElement

beforeEach(() => useDestinationInfo.mockReturnValue(query({ data: { exists: true, requireDestTag: false } })))
afterEach(cleanup)

/**
 * The highest-severity defect in this epic, and the only one that loses money.
 *
 * A failed destination check leaves `destInfo` undefined, and undefined used to
 * mean "nothing required": `!destInfo?.requireDestTag` was SATISFIED by the
 * failure and the tag field said "(optional)". An untagged payment to an
 * exchange address that requires a tag is credited to nobody and cannot be
 * recovered from this app. A read that never succeeded may not authorise it.
 *
 * These assertions exist to fail if `!destCheckFailed` is ever dropped from
 * `canSend`, or if the label's unknown state is collapsed back into "optional".
 */
describe('SendTab — a failed destination check never reads as "nothing required"', () => {
  it('reports the failed check rather than saying nothing', () => {
    useDestinationInfo.mockReturnValue(query({ isError: true }))
    render(<SendTab />)
    fillValidForm()

    expect(screen.getByText('Destination check failed')).toBeTruthy()
  })

  it('says the tag requirement is unknown, never "(optional)"', () => {
    useDestinationInfo.mockReturnValue(query({ isError: true }))
    render(<SendTab />)
    fillValidForm()

    expect(screen.getByText('Destination tag (requirement unknown)')).toBeTruthy()
    expect(screen.queryByText('Destination tag (optional)')).toBeNull()
  })

  it('does not let a valid address and amount alone enable the send', () => {
    useDestinationInfo.mockReturnValue(query({ isError: true }))
    render(<SendTab />)
    fillValidForm()

    // Everything else about this form is valid and funded. The ONLY thing
    // holding the send is the check that failed.
    expect(reviewButton().disabled).toBe(true)
  })

  it('enables the send once the same form has a destination check that succeeded', () => {
    render(<SendTab />)
    fillValidForm()

    // The control case. Without it the assertion above would also pass on a
    // form that is broken for some unrelated reason.
    expect(reviewButton().disabled).toBe(false)
  })

  it('retries the check from a control that is not disabled', () => {
    const refetch = vi.fn().mockResolvedValue({})
    useDestinationInfo.mockReturnValue(query({ isError: true, refetch }))
    render(<SendTab />)
    fillValidForm()

    const retry = screen.getByRole('button', { name: 'Try again' })
    expect(retry.hasAttribute('disabled')).toBe(false)
    expect(retry.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(retry)
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('keeps the recipient-requires-a-tag state distinct from the unknown one', () => {
    useDestinationInfo.mockReturnValue(query({ data: { exists: true, requireDestTag: true } }))
    render(<SendTab />)
    fillValidForm()

    expect(screen.getByText('Destination tag (required by recipient)')).toBeTruthy()
    // A known requirement with no tag entered still blocks, as it always did.
    expect(reviewButton().disabled).toBe(true)
  })
})
