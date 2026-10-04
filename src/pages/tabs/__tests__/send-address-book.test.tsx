/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

/**
 * Story 9.2 — FR-21's "you haven't sent here before" is decided on the
 * `(address, destination tag)` pair (AD-6), and the entry a send writes
 * records the tag actually signed and no fabricated label.
 *
 * The harness is the one `send-destination-error.test.tsx` uses, cut down to
 * what a validated send needs; the Address Book and its writer are mutable
 * module state here so a test can say what the book held and see what was
 * written.
 */

const useDestinationInfo = vi.fn()
const useSpendableBalance = vi.fn()
const useRecommendedFee = vi.fn()
const useTrustLines = vi.fn()
const fetchQuery = vi.fn()
const submitXrpPayment = vi.fn()
const unlockWalletForSigning = vi.fn()
const invalidateQueries = vi.fn()
const addAddressBookEntry = vi.fn()
let addressBook: { address: string; destinationTag?: string; label?: string }[] = []

vi.mock('@/hooks/useDestinationInfo', () => ({ useDestinationInfo: () => useDestinationInfo() }))
vi.mock('@/hooks/useRecommendedFee', () => ({ useRecommendedFee: () => useRecommendedFee() }))
vi.mock('@/hooks/useTrustLines', () => ({ useTrustLines: () => useTrustLines() }))
vi.mock('@/hooks/useSpendableBalance', () => ({ useSpendableBalance: () => useSpendableBalance() }))
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: any) => <>{children}</>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: () => null,
  SelectItem: () => null,
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries, fetchQuery }) }))
vi.mock('@/lib/crypto/keystore', () => ({
  unlockWalletForSigning: (...args: unknown[]) => unlockWalletForSigning(...args),
}))
vi.mock('@/lib/xrpl/writes', () => ({
  submitXrpPayment: (...args: unknown[]) => submitXrpPayment(...args),
  submitIssuedPayment: vi.fn(),
}))
vi.mock('@/components/wallet/AddressLink', () => ({
  TxLink: ({ hash }: { hash: string }) => <span>{hash}</span>,
  AddressLink: ({ address }: { address: string }) => <span>{address}</span>,
}))
vi.mock('@/store/app-store', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ network: 'testnet', vaultKey: {}, addressBook, addAddressBookEntry }),
  useActiveWallet: () => ({ id: 'w1', address: WALLET_ADDRESS, label: 'Test' }),
}))

import { SendTab } from '../SendTab'

const EXCHANGE = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const WALLET_ADDRESS = 'r4NagxniGTmPRr8yBRXRD6NNpZP7FfP4KR'
const NOW = 1_800_000_000_000

function info() {
  return { network: 'testnet', destination: EXCHANGE, asset: 'XRP', exists: true, requireDestTag: false }
}

beforeEach(() => {
  addressBook = []
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  useDestinationInfo.mockReturnValue({
    data: info(),
    isError: false,
    isSuccess: true,
    isFetching: false,
    dataUpdatedAt: NOW,
    refetch: vi.fn().mockResolvedValue({}),
  })
  useSpendableBalance.mockReturnValue({
    status: 'ok',
    isLoading: false,
    reserveFailed: false,
    accountFailed: false,
    retryReserves: vi.fn(),
    spendableDrops: '100000000',
    reservedDrops: '1000000',
  })
  useRecommendedFee.mockReturnValue({ data: '12', isError: false, refetch: vi.fn() })
  useTrustLines.mockReturnValue({ data: [] })
  fetchQuery.mockResolvedValue(info())
  unlockWalletForSigning.mockResolvedValue({ address: WALLET_ADDRESS })
  submitXrpPayment.mockResolvedValue({ status: 'validated', resultCode: 'tesSUCCESS', hash: 'AB' })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

/** Fill the form for `(EXCHANGE, tag)` and open the confirm step. */
function review(tag: string) {
  render(<SendTab />)
  fireEvent.change(screen.getByLabelText('Destination address'), { target: { value: EXCHANGE } })
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1' } })
  if (tag) fireEvent.change(screen.getByLabelText(/^Destination tag/), { target: { value: tag } })
  act(() => {
    vi.advanceTimersByTime(0)
  })
  fireEvent.click(screen.getByRole('button', { name: 'Review payment' }))
}

async function confirm() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' }))
  })
}

const anyFirstSendWarning = () => screen.queryByText(/You haven't sent/)

describe('SendTab — the first-send warning is decided on the pair', () => {
  it('fires for a known address with a tag never used before', () => {
    addressBook = [{ address: EXCHANGE, destinationTag: '1' }]
    review('2')

    expect(screen.getByText("You haven't sent with destination tag 2 before")).toBeTruthy()
    // The words point at what is new — the tag — not at the familiar address.
    expect(screen.queryByText(/character by character/)).toBeNull()
  })

  it('fires for a known tagged address sent to with no tag', () => {
    addressBook = [{ address: EXCHANGE, destinationTag: '1' }]
    review('')

    expect(screen.getByText("You haven't sent here without a destination tag before")).toBeTruthy()
    expect(screen.getByText(/only with a destination tag/)).toBeTruthy()
  })

  it('fires for a known tagless address sent to with a tag — absence is not a wildcard', () => {
    addressBook = [{ address: EXCHANGE }]
    review('5')

    expect(screen.getByText("You haven't sent with destination tag 5 before")).toBeTruthy()
  })

  it('does not fire for the exact pair already sent to', () => {
    addressBook = [{ address: EXCHANGE, destinationTag: '7' }]
    // Typed with a leading zero: the ledger tag is the same UInt32.
    review('007')

    expect(screen.getByRole('button', { name: 'Confirm and send' })).toBeTruthy()
    expect(anyFirstSendWarning()).toBeNull()
  })

  it('keeps the original address warning for an address never sent to', () => {
    review('1')

    expect(screen.getByText("You haven't sent here before")).toBeTruthy()
    expect(screen.getByText(/character by character/)).toBeTruthy()
  })
})

describe('SendTab — the entry a send writes', () => {
  it('records the tag actually signed, as text, and no fabricated label', async () => {
    review('0042')
    await confirm()

    expect(submitXrpPayment).toHaveBeenCalledWith('testnet', expect.anything(), expect.objectContaining({ destinationTag: 42 }))
    expect(addAddressBookEntry).toHaveBeenCalledOnce()
    const [entry] = addAddressBookEntry.mock.calls[0]
    expect(entry.address).toBe(EXCHANGE)
    expect(entry.destinationTag).toBe('42')
    expect(entry.label).toBeUndefined()
  })

  it('records a tagless send as tagless', async () => {
    review('')
    await confirm()

    const [entry] = addAddressBookEntry.mock.calls[0]
    expect(entry.destinationTag).toBeUndefined()
    expect(entry.label).toBeUndefined()
  })

  it('writes a second tag at a known address rather than skipping it', async () => {
    addressBook = [{ address: EXCHANGE, destinationTag: '1' }]
    review('2')
    await confirm()

    expect(addAddressBookEntry).toHaveBeenCalledOnce()
    expect(addAddressBookEntry.mock.calls[0][0].destinationTag).toBe('2')
  })

  it('writes nothing for a pair already in the book', async () => {
    addressBook = [{ address: EXCHANGE, destinationTag: '1' }]
    review('1')
    await confirm()

    expect(submitXrpPayment).toHaveBeenCalledOnce()
    expect(addAddressBookEntry).not.toHaveBeenCalled()
  })
})
