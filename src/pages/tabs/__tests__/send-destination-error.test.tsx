/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const useDestinationInfo = vi.fn()
const fetchQuery = vi.fn()
const submitXrpPayment = vi.fn()
const unlockWalletForSigning = vi.fn()

vi.mock('@/hooks/useDestinationInfo', () => ({ useDestinationInfo: () => useDestinationInfo() }))
vi.mock('@/hooks/useRecommendedFee', () => ({ useRecommendedFee: () => ({ data: '12' }) }))
vi.mock('@/hooks/useTrustLines', () => ({ useTrustLines: () => ({ data: [] }) }))
vi.mock('@/hooks/useSpendableBalance', () => ({
  useSpendableBalance: () => ({ isLoading: false, spendableDrops: '100000000', reservedDrops: '1000000' }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), fetchQuery }),
}))
vi.mock('@/lib/crypto/keystore', () => ({
  unlockWalletForSigning: (...args: unknown[]) => unlockWalletForSigning(...args),
}))
vi.mock('@/lib/xrpl/writes', () => ({
  submitXrpPayment: (...args: unknown[]) => submitXrpPayment(...args),
  submitIssuedPayment: vi.fn(),
}))
// TxLink mounts a Tooltip that needs a provider this test doesn't supply, and
// the outcome panel that renders it is not what any assertion here is about.
vi.mock('@/components/wallet/AddressLink', () => ({
  TxLink: ({ hash }: { hash: string }) => <span>{hash}</span>,
  AddressLink: ({ address }: { address: string }) => <span>{address}</span>,
}))
/** Mutable so one test can switch networks under a rendered form. */
let network = 'testnet'

vi.mock('@/store/app-store', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    // A real vaultKey: with `null` here `doSend` returns at its first line and
    // every submit-path assertion below would pass without reaching the guard.
    selector({ network, vaultKey: {}, addressBook: [], addAddressBookEntry: vi.fn() }),
  useActiveWallet: () => ({ id: 'w1', address: 'r4NagxniGTmPRr8yBRXRD6NNpZP7FfP4KR', label: 'Test' }),
}))

import { SendTab } from '../SendTab'
import { DESTINATION_CHECK_FRESHNESS_MS } from '@/lib/xrpl/query-reads'
import { queryKeys } from '@/lib/xrpl/query-keys'

// Real addresses: `isValidClassicAddress` is the actual xrpl checksum check,
// not a mock, so a made-up string would fail validation before anything this
// test is about is reached.
const DESTINATION = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const OTHER_DESTINATION = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const WALLET_ADDRESS = 'r4NagxniGTmPRr8yBRXRD6NNpZP7FfP4KR'

/** A fixed wall clock. Every age in this file is stated against it, so the
 * freshness assertions are decided by arithmetic rather than by how long the
 * suite happened to take. */
const NOW = 1_800_000_000_000

/** A successful answer, carrying the triple it answered for. */
function info(overrides: Record<string, unknown> = {}) {
  return { network: 'testnet', destination: DESTINATION, asset: 'XRP', exists: true, requireDestTag: false, ...overrides }
}

/**
 * A mocked query result. `isSuccess` and `isError` are derived rather than
 * passed, because the two are mutually exclusive in TanStack Query v5 and a
 * test that sets both describes a state the app can never be in.
 */
function query(
  overrides: { data?: unknown; isError?: boolean; isFetching?: boolean; ageMs?: number; refetch?: () => unknown } = {},
) {
  const { ageMs = 0, isError = false, isFetching = false, refetch = vi.fn().mockResolvedValue({}), ...rest } = overrides
  const data = 'data' in overrides ? overrides.data : info()
  return {
    ...rest,
    data,
    isError,
    isSuccess: !isError && data !== undefined,
    isFetching,
    dataUpdatedAt: data === undefined ? 0 : NOW - ageMs,
    refetch,
  }
}

/** Fill in everything a send needs EXCEPT knowing about the destination. */
function fillValidForm(destination = DESTINATION) {
  fireEvent.change(screen.getByLabelText('Destination address'), { target: { value: destination } })
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1' } })
}

const reviewButton = () => screen.getByRole('button', { name: 'Review payment' }) as HTMLButtonElement

/** Let the one expiry timer the form arms take its clock reading. */
function settleClock() {
  act(() => {
    vi.advanceTimersByTime(0)
  })
}

beforeEach(() => {
  network = 'testnet'
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  useDestinationInfo.mockReturnValue(query())
  fetchQuery.mockResolvedValue(info())
  // The active wallet's own address, not the destination's: a signing wallet
  // that IS the recipient describes a self-send the form already refuses.
  unlockWalletForSigning.mockResolvedValue({ address: WALLET_ADDRESS })
  submitXrpPayment.mockResolvedValue({ status: 'validated', resultCode: 'tesSUCCESS', hash: 'AB' })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

/**
 * The highest-severity defect in this epic, and the only one that loses money.
 *
 * The guard used to be "no error seen", and three states satisfied it that are
 * not permission: a failed refetch that kept an earlier answer, an answer about
 * a different input, and an answer older than its freshness window. In each,
 * `!destInfo?.requireDestTag` was satisfied and the tag field said "(optional)".
 * An untagged payment to an exchange address that requires a tag is credited to
 * nobody and cannot be recovered from this app.
 *
 * These assertions exist to fail if the guard is ever weakened back to the
 * absence of a prohibition, or if the label's unknown state is collapsed into
 * "optional" for any of them.
 */
describe('SendTab — only a fresh successful check for this input permits a send', () => {
  it('reports the failed check rather than saying nothing', () => {
    useDestinationInfo.mockReturnValue(query({ data: undefined, isError: true }))
    render(<SendTab />)
    fillValidForm()

    expect(screen.getByText('Destination check failed')).toBeTruthy()
  })

  it('says the tag requirement is unknown, never "(optional)"', () => {
    useDestinationInfo.mockReturnValue(query({ data: undefined, isError: true }))
    render(<SendTab />)
    fillValidForm()

    expect(screen.getByText('Destination tag (requirement unknown)')).toBeTruthy()
    expect(screen.queryByText('Destination tag (optional)')).toBeNull()
  })

  it('does not let a valid address and amount alone enable the send', () => {
    useDestinationInfo.mockReturnValue(query({ data: undefined, isError: true }))
    render(<SendTab />)
    fillValidForm()

    // Everything else about this form is valid and funded. The ONLY thing
    // holding the send is the check that failed.
    expect(reviewButton().disabled).toBe(true)
  })

  it('enables the send once the same form has a destination check that succeeded', () => {
    render(<SendTab />)
    fillValidForm()
    settleClock()

    // The control case. Without it the assertions here would also pass on a
    // form that is broken for some unrelated reason.
    expect(reviewButton().disabled).toBe(false)
  })

  it('blocks when a refetch errored but an earlier answer is still retained', () => {
    // The state the old `isError && !data` guard let straight through.
    useDestinationInfo.mockReturnValue(query({ isError: true }))
    render(<SendTab />)
    fillValidForm()

    expect(reviewButton().disabled).toBe(true)
    expect(screen.getByText('Destination check failed')).toBeTruthy()
    expect(screen.getByText('Destination tag (requirement unknown)')).toBeTruthy()
    expect(screen.queryByText('Destination tag (optional)')).toBeNull()
  })

  it('does not render a retained answer as current while the read is in error', () => {
    useDestinationInfo.mockReturnValue(query({ data: info({ exists: false }), isError: true }))
    render(<SendTab />)
    fillValidForm()

    // §12 rule 2: while a read is in error, nothing from an earlier success
    // stays on screen — not even a warning derived from it.
    expect(screen.queryByText('Destination not activated')).toBeNull()
  })

  it('blocks while the retained answer is about a different address', () => {
    useDestinationInfo.mockReturnValue(query({ data: info({ destination: OTHER_DESTINATION }) }))
    render(<SendTab />)
    fillValidForm()

    expect(reviewButton().disabled).toBe(true)
    expect(screen.getByText('Checking destination…')).toBeTruthy()
    expect(screen.queryByText('Destination tag (optional)')).toBeNull()
  })

  it('blocks when the asset is switched after a successful check', () => {
    // `hasTrustLine` answers a question about the asset, so an answer read for
    // XRP says nothing about a token.
    useDestinationInfo.mockReturnValue(query({ data: info({ asset: 'USD|rIssuer' }) }))
    render(<SendTab />)
    fillValidForm()

    expect(reviewButton().disabled).toBe(true)
    expect(screen.queryByText('Destination tag (optional)')).toBeNull()
  })

  it('blocks once a successful check has aged past the freshness window', () => {
    useDestinationInfo.mockReturnValue(query({ ageMs: DESTINATION_CHECK_FRESHNESS_MS + 1_000 }))
    render(<SendTab />)
    fillValidForm()
    settleClock()

    expect(reviewButton().disabled).toBe(true)
    // It did not FAIL. It went out of date, and says so in its own words.
    expect(screen.getByText('Destination check is out of date')).toBeTruthy()
    expect(screen.queryByText('Destination check failed')).toBeNull()
    expect(screen.queryByText('Destination tag (optional)')).toBeNull()
  })

  it('closes the guard the moment the window elapses, with no read of its own', () => {
    const refetch = vi.fn().mockResolvedValue({})
    useDestinationInfo.mockReturnValue(query({ refetch }))
    render(<SendTab />)
    fillValidForm()
    settleClock()
    expect(reviewButton().disabled).toBe(false)

    act(() => {
      vi.advanceTimersByTime(DESTINATION_CHECK_FRESHNESS_MS + 1)
    })

    expect(reviewButton().disabled).toBe(true)
    // Going stale never re-reads on its own, and never polls to stay warm.
    expect(refetch).not.toHaveBeenCalled()
  })

  it('refuses a cached answer that was already expired when the form mounted', () => {
    // The state the freshness clock is weakest in: nothing has happened since
    // mount, so nothing but the initial reading can have closed the guard.
    useDestinationInfo.mockReturnValue(query({ ageMs: DESTINATION_CHECK_FRESHNESS_MS + 60_000 }))
    render(<SendTab />)
    fillValidForm()

    // Asserted BEFORE any timer is allowed to run.
    expect(reviewButton().disabled).toBe(true)
    expect(screen.getByText('Destination check is out of date')).toBeTruthy()
  })

  it('reports a refetch in flight over an answer that is still good', () => {
    useDestinationInfo.mockReturnValue(query({ isFetching: true }))
    render(<SendTab />)
    fillValidForm()
    settleClock()

    expect(screen.getByText('Checking destination…')).toBeTruthy()
  })

  it('offers a re-check on the out-of-date state', () => {
    const refetch = vi.fn().mockResolvedValue({})
    useDestinationInfo.mockReturnValue(query({ ageMs: DESTINATION_CHECK_FRESHNESS_MS + 1_000, refetch }))
    render(<SendTab />)
    fillValidForm()
    settleClock()

    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('retries the check from a control that is not disabled', () => {
    const refetch = vi.fn().mockResolvedValue({})
    useDestinationInfo.mockReturnValue(query({ data: undefined, isError: true, refetch }))
    render(<SendTab />)
    fillValidForm()

    const retry = screen.getByRole('button', { name: 'Try again' })
    expect(retry.hasAttribute('disabled')).toBe(false)
    expect(retry.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(retry)
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('keeps the recipient-requires-a-tag state distinct from the unknown one', () => {
    useDestinationInfo.mockReturnValue(query({ data: info({ requireDestTag: true }) }))
    render(<SendTab />)
    fillValidForm()
    settleClock()

    expect(screen.getByText('Destination tag (required by recipient)')).toBeTruthy()
    // A known requirement with no tag entered still blocks, as it always did.
    expect(reviewButton().disabled).toBe(true)
  })
})

/**
 * The button's `disabled` attribute dims a control; it does not prevent the
 * handler running. Every assertion here drives `doSend` directly, which is what
 * a bypassed control, a re-entered dialog or a stray Enter key would do.
 */
describe('SendTab — the submit path re-checks before it spends', () => {
  /** Open the confirm dialog from a form whose check is good, then press the
   * one control in the app that moves funds. */
  async function reviewAndConfirm() {
    fillValidForm()
    settleClock()
    fireEvent.click(reviewButton())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' }))
    })
  }

  it('re-reads the destination after the unlock and before submitting', async () => {
    render(<SendTab />)
    await reviewAndConfirm()

    expect(unlockWalletForSigning).toHaveBeenCalledOnce()
    expect(fetchQuery).toHaveBeenCalledOnce()
    expect(submitXrpPayment).toHaveBeenCalledOnce()
    // The unlock can take seconds; the check that authorises the payment must
    // be the one taken after it.
    expect(unlockWalletForSigning.mock.invocationCallOrder[0]).toBeLessThan(fetchQuery.mock.invocationCallOrder[0])
    expect(fetchQuery.mock.invocationCallOrder[0]).toBeLessThan(submitXrpPayment.mock.invocationCallOrder[0])
    // And on the SAME cache entry the form's own check reads, from the one key
    // factory — a probe on a different key could not disagree with the display
    // because it would never be looking at it.
    expect(fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: queryKeys.destinationInfo('testnet', DESTINATION, 'XRP') }),
    )
  })

  it('does not submit when the re-read fails, and reports it inline', async () => {
    fetchQuery.mockRejectedValue(new Error('rpc down'))
    render(<SendTab />)
    await reviewAndConfirm()

    expect(submitXrpPayment).not.toHaveBeenCalled()
    expect(screen.getByText('Payment not sent — destination check failed')).toBeTruthy()
  })

  it('reports a failed re-read once, not twice', async () => {
    fetchQuery.mockRejectedValue(new Error('rpc down'))
    const { rerender } = render(<SendTab />)
    await reviewAndConfirm()

    // The rejected probe errors the same cache entry the form's own observer
    // watches, so both reports describe one failure. Two destructive panels
    // with two retry controls is one failure told twice.
    useDestinationInfo.mockReturnValue(query({ isError: true }))
    rerender(<SendTab />)

    expect(screen.queryByText('Destination check failed')).toBeNull()
    expect(screen.getByText('Payment not sent — destination check failed')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1)
  })

  it('retires the refusal when the network changes under it', async () => {
    fetchQuery.mockResolvedValue(info({ requireDestTag: true }))
    render(<SendTab />)
    await reviewAndConfirm()
    expect(screen.getByText('Payment not sent — this address now requires a destination tag')).toBeTruthy()

    // A statement about testnet is not a smaller truth on mainnet; it is false.
    network = 'mainnet'
    useDestinationInfo.mockReturnValue(query({ data: info({ network: 'mainnet' }) }))
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '2' } })
    })

    expect(screen.queryByText('Payment not sent — this address now requires a destination tag')).toBeNull()
  })

  it('does not submit when the re-read says a tag has become required', async () => {
    fetchQuery.mockResolvedValue(info({ requireDestTag: true }))
    render(<SendTab />)
    await reviewAndConfirm()

    expect(submitXrpPayment).not.toHaveBeenCalled()
    expect(screen.getByText('Payment not sent — this address now requires a destination tag')).toBeTruthy()
  })

  it('does not submit when the form guard is closed and the control is activated anyway', async () => {
    render(<SendTab />)
    fillValidForm()
    settleClock()
    fireEvent.click(reviewButton())

    // The amount stops fitting while the confirm dialog is open — the window in
    // which a dimmed Review button protects nothing at all, since the control
    // inside the dialog is not the one that was dimmed.
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1000' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' }))
    })

    expect(unlockWalletForSigning).not.toHaveBeenCalled()
    expect(submitXrpPayment).not.toHaveBeenCalled()
    // And says so, rather than closing the dialog on a press that did nothing.
    expect(screen.getByText('Payment not sent — the form was no longer ready')).toBeTruthy()
  })

  it('keeps the confirm step up while a send it already authorised is in flight', async () => {
    // The expiry timer is independent of `busy`. A check aging out during the
    // unlock must not pull "Sending…" off the screen mid-submission.
    let release: (w: unknown) => void = () => {}
    unlockWalletForSigning.mockImplementationOnce(() => new Promise((r) => (release = r)))

    const { rerender } = render(<SendTab />)
    fillValidForm()
    settleClock()
    fireEvent.click(reviewButton())
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' }))

    // The answer ages out while the unlock is still pending.
    useDestinationInfo.mockReturnValue(query({ ageMs: DESTINATION_CHECK_FRESHNESS_MS + 1_000 }))
    await act(async () => {
      rerender(<SendTab />)
    })
    expect(screen.getByText('Sending…')).toBeTruthy()

    await act(async () => {
      release({ address: WALLET_ADDRESS })
    })
    expect(submitXrpPayment).toHaveBeenCalledOnce()
  })

  it('takes the confirm step away when the check stops holding', () => {
    // Asserted on the dialog's own condition rather than by clicking a dimmed
    // Review button: React drops a click on a disabled control before any
    // handler runs, so that click would pass against no guard at all.
    const { rerender } = render(<SendTab />)
    fillValidForm()
    settleClock()
    fireEvent.click(reviewButton())
    expect(screen.getByRole('button', { name: 'Confirm and send' })).toBeTruthy()

    useDestinationInfo.mockReturnValue(query({ ageMs: DESTINATION_CHECK_FRESHNESS_MS + 1_000 }))
    rerender(<SendTab />)

    expect(screen.queryByRole('button', { name: 'Confirm and send' })).toBeNull()
    expect(screen.getByText('Destination check is out of date')).toBeTruthy()
  })
})
