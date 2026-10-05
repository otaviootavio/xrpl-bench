/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

/**
 * Story 9.2 — FR-21's "you haven't sent here before" is decided on the
 * `(network, address, destination tag)` triple (AD-6; the network since the
 * Epic 9 retro, items 28/29), and the entry a send writes records the network
 * and tag actually signed and no fabricated label.
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
let network: 'mainnet' | 'testnet' = 'testnet'
let addressBook: { address: string; network?: string; destinationTag?: string; label?: string }[] = []

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
    selector({ network, vaultKey: {}, addressBook, addAddressBookEntry }),
  useActiveWallet: () => ({ id: 'w1', address: WALLET_ADDRESS, label: 'Test' }),
}))

import { SendTab } from '../SendTab'

const EXCHANGE = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const WALLET_ADDRESS = 'r4NagxniGTmPRr8yBRXRD6NNpZP7FfP4KR'
const NOW = 1_800_000_000_000

function info() {
  return { network, destination: EXCHANGE, asset: 'XRP', exists: true, requireDestTag: false }
}

beforeEach(() => {
  addressBook = []
  network = 'testnet'
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  // Read per render, so a test that changes `network` sees the check for it.
  useDestinationInfo.mockImplementation(() => ({
    data: info(),
    isError: false,
    isSuccess: true,
    isFetching: false,
    dataUpdatedAt: NOW,
    refetch: vi.fn().mockResolvedValue({}),
  }))
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
  fetchQuery.mockImplementation(async () => info())
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
    addressBook = [{ address: EXCHANGE, network: 'testnet', destinationTag: '1' }]
    review('2')

    expect(screen.getByText("You haven't sent with destination tag 2 before")).toBeTruthy()
    // The words point at what is new — the tag — not at the familiar address.
    expect(screen.queryByText(/character by character/)).toBeNull()
  })

  it('fires for a known tagged address sent to with no tag', () => {
    addressBook = [{ address: EXCHANGE, network: 'testnet', destinationTag: '1' }]
    review('')

    expect(screen.getByText("You haven't sent here without a destination tag before")).toBeTruthy()
    expect(screen.getByText(/only with a destination tag/)).toBeTruthy()
  })

  it('fires for a known tagless address sent to with a tag — absence is not a wildcard', () => {
    addressBook = [{ address: EXCHANGE, network: 'testnet' }]
    review('5')

    expect(screen.getByText("You haven't sent with destination tag 5 before")).toBeTruthy()
  })

  it('does not fire for the exact pair already sent to', () => {
    addressBook = [{ address: EXCHANGE, network: 'testnet', destinationTag: '7' }]
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

/**
 * Epic 9 retro items 28/29: identity is (network, address, tag). Only an entry
 * recorded on the network being sent on silences the warning or unlocks the
 * tag-specific "You have paid this address before" words.
 */
describe('SendTab — the warning is decided on the network too', () => {
  it('pre-epic-9 entry, tagless send: warns with the generic copy', () => {
    addressBook = [{ address: EXCHANGE }]
    review('')

    expect(screen.getByText("You haven't sent here before")).toBeTruthy()
    expect(screen.getByText(/character by character/)).toBeTruthy()
  })

  it('pre-epic-9 entry, tagged send: warns with the generic copy', () => {
    addressBook = [{ address: EXCHANGE }]
    review('5')

    expect(screen.getByText("You haven't sent here before")).toBeTruthy()
    expect(screen.queryByText(/You have paid this address before/)).toBeNull()
  })

  it('an epic-9 tagged entry with no network warns for its own pair, with the generic copy', () => {
    addressBook = [{ address: EXCHANGE, destinationTag: '1' }]
    review('1')

    expect(screen.getByText("You haven't sent here before")).toBeTruthy()
  })

  it('recorded on Mainnet, sending on Testnet: warns with the generic copy', () => {
    addressBook = [{ address: EXCHANGE, network: 'mainnet' }]
    review('')

    expect(screen.getByText("You haven't sent here before")).toBeTruthy()
    expect(screen.queryByText(/You have paid this address before/)).toBeNull()
  })

  it('recorded on Testnet, sending on Mainnet: warns (and vice versa)', () => {
    network = 'mainnet'
    addressBook = [{ address: EXCHANGE, network: 'testnet', destinationTag: '1' }]
    review('1')

    expect(screen.getByText("You haven't sent here before")).toBeTruthy()
  })

  it('a different tag recorded on another network does not unlock the tag-specific words', () => {
    addressBook = [{ address: EXCHANGE, network: 'mainnet', destinationTag: '1' }]
    review('2')

    expect(screen.getByText("You haven't sent here before")).toBeTruthy()
    expect(screen.queryByText(/You have paid this address before/)).toBeNull()
  })

  it('a legacy entry beside a recorded tagged one keeps the generic copy for a tagless send', () => {
    addressBook = [{ address: EXCHANGE }, { address: EXCHANGE, network: 'testnet', destinationTag: '1' }]
    review('')

    expect(screen.getByText("You haven't sent here before")).toBeTruthy()
    expect(screen.queryByText(/only with a destination tag/)).toBeNull()
  })

  it('recorded here: no warning', () => {
    addressBook = [{ address: EXCHANGE, network: 'testnet' }]
    review('')

    expect(screen.getByRole('button', { name: 'Confirm and send' })).toBeTruthy()
    expect(anyFirstSendWarning()).toBeNull()
  })

  it('recorded here on Mainnet: no warning on Mainnet', () => {
    network = 'mainnet'
    addressBook = [{ address: EXCHANGE, network: 'mainnet', destinationTag: '9' }]
    review('9')

    expect(screen.getByRole('button', { name: 'Confirm and send' })).toBeTruthy()
    expect(anyFirstSendWarning()).toBeNull()
  })

  it('a validated send over a legacy entry writes the recorded triple', async () => {
    addressBook = [{ address: EXCHANGE }]
    review('')
    await confirm()

    expect(addAddressBookEntry).toHaveBeenCalledOnce()
    expect(addAddressBookEntry.mock.calls[0][0]).toEqual({ network: 'testnet', address: EXCHANGE, destinationTag: undefined })
  })

  it('writes the network it submitted on', async () => {
    network = 'mainnet'
    review('3')
    await confirm()

    expect(submitXrpPayment).toHaveBeenCalledWith('mainnet', expect.anything(), expect.objectContaining({ destinationTag: 3 }))
    expect(addAddressBookEntry.mock.calls[0][0]).toMatchObject({ network: 'mainnet', address: EXCHANGE, destinationTag: '3' })
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
    expect(entry.network).toBe('testnet')
    expect(entry.destinationTag).toBe('42')
    expect(entry.label).toBeUndefined()
  })

  it('signs the fee the dialog stated, not one autofill computes', async () => {
    useRecommendedFee.mockReturnValue({ data: '10', isError: false, refetch: vi.fn() })
    review('')

    expect(screen.getByText(/plus a network fee of 0\.00001 XRP/)).toBeTruthy()
    await confirm()

    expect(submitXrpPayment).toHaveBeenCalledWith('testnet', expect.anything(), expect.objectContaining({ feeDrops: '10' }))
  })

  it('refuses on the form when the fee read is above the cap', () => {
    useRecommendedFee.mockReturnValue({ data: '20000', isError: false, refetch: vi.fn() })
    review('')

    expect(screen.getByText(/currently 0\.02 XRP, above this wallet's limit of 0\.01 XRP/)).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Review payment' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: 'Confirm and send' })).toBeNull()
  })

  it('records a tagless send as tagless', async () => {
    review('')
    await confirm()

    const [entry] = addAddressBookEntry.mock.calls[0]
    expect(entry.destinationTag).toBeUndefined()
    expect(entry.label).toBeUndefined()
  })

  it('writes a second tag at a known address rather than skipping it', async () => {
    addressBook = [{ address: EXCHANGE, network: 'testnet', destinationTag: '1' }]
    review('2')
    await confirm()

    expect(addAddressBookEntry).toHaveBeenCalledOnce()
    expect(addAddressBookEntry.mock.calls[0][0].destinationTag).toBe('2')
  })

  it('writes nothing for a pair already in the book', async () => {
    addressBook = [{ address: EXCHANGE, network: 'testnet', destinationTag: '1' }]
    review('1')
    await confirm()

    expect(submitXrpPayment).toHaveBeenCalledOnce()
    expect(addAddressBookEntry).not.toHaveBeenCalled()
  })
})
