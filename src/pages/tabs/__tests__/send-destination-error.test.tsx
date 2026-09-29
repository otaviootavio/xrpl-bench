/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

const useDestinationInfo = vi.fn()
const useSpendableBalance = vi.fn()
const useRecommendedFee = vi.fn()
const useTrustLines = vi.fn()
const fetchQuery = vi.fn()
const submitXrpPayment = vi.fn()
const submitIssuedPayment = vi.fn()
const unlockWalletForSigning = vi.fn()
/** Named, so a test can see what a send discards and for whom. */
const invalidateQueries = vi.fn()

vi.mock('@/hooks/useDestinationInfo', () => ({ useDestinationInfo: () => useDestinationInfo() }))
vi.mock('@/hooks/useRecommendedFee', () => ({ useRecommendedFee: () => useRecommendedFee() }))
vi.mock('@/hooks/useTrustLines', () => ({ useTrustLines: () => useTrustLines() }))
/** Radix's Select needs pointer capture jsdom does not implement, and the
 * asset picker is a means to an end here: the token-send assertions are about
 * the fee, not about the listbox. A native select keeps the same contract —
 * `value` in, `onValueChange` out — with none of that apparatus. */
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) => (
    <select data-testid="asset" value={value} onChange={(e) => onValueChange(e.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}))
vi.mock('@/hooks/useSpendableBalance', () => ({ useSpendableBalance: () => useSpendableBalance() }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries, fetchQuery }),
}))
vi.mock('@/lib/crypto/keystore', () => ({
  unlockWalletForSigning: (...args: unknown[]) => unlockWalletForSigning(...args),
}))
vi.mock('@/lib/xrpl/writes', () => ({
  submitXrpPayment: (...args: unknown[]) => submitXrpPayment(...args),
  submitIssuedPayment: (...args: unknown[]) => submitIssuedPayment(...args),
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
import type { SpendableBalance } from '@/hooks/useSpendableBalance'
import { DESTINATION_CHECK_FRESHNESS_MS } from '@/lib/xrpl/query-reads'
import { queryKeys } from '@/lib/xrpl/query-keys'
// The real formatter, so a test asserting the figure cannot drift from the one
// the row actually renders.
import { formatXrp } from '@/lib/xrpl/money'

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

/**
 * The spendable figure this form checks an amount against. Annotated with the
 * hook's own interface, so a renamed `status` value or a dropped field is a
 * compile error here instead of a test passing against a stale contract.
 */
function spendable(overrides: Partial<SpendableBalance> = {}): SpendableBalance {
  return {
    status: 'ok',
    isLoading: false,
    reserveFailed: false,
    accountFailed: false,
    retryReserves: vi.fn().mockResolvedValue({}),
    spendableDrops: '100000000',
    reservedDrops: '1000000',
    ...overrides,
  }
}

/**
 * The recommended-fee read, as the form sees it. Three outcomes and no fourth:
 * a figure that was read, a read still in flight, a read that failed. The
 * default is a fee that was read, because every other assertion in this file
 * depends on the XRP affordability check being able to complete.
 */
function feeRead(overrides: { data?: string; isError?: boolean; refetch?: () => unknown } = {}) {
  const { isError = false, refetch = vi.fn().mockResolvedValue({}) } = overrides
  const data = 'data' in overrides ? overrides.data : '12'
  // Only what `SendTab` actually reads. `isSuccess`/`isLoading` would be
  // inconsistent for a retained value under an errored refetch, and nothing
  // would catch it because nothing consults them.
  return { data, isError, refetch }
}

/** A token the wallet holds, so an issued-currency send can be selected. */
const TOKEN_ISSUER = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const TOKEN_ASSET = `USD|${TOKEN_ISSUER}`
function heldToken() {
  return { currency: 'USD', account: TOKEN_ISSUER, balance: '50', freeze: false, freezePeer: false }
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
  useSpendableBalance.mockReturnValue(spendable())
  useRecommendedFee.mockReturnValue(feeRead())
  useTrustLines.mockReturnValue({ data: [] })
  fetchQuery.mockResolvedValue(info())
  // The active wallet's own address, not the destination's: a signing wallet
  // that IS the recipient describes a self-send the form already refuses.
  unlockWalletForSigning.mockResolvedValue({ address: WALLET_ADDRESS })
  submitXrpPayment.mockResolvedValue({ status: 'validated', resultCode: 'tesSUCCESS', hash: 'AB' })
  submitIssuedPayment.mockResolvedValue({ status: 'validated', resultCode: 'tesSUCCESS', hash: 'CD' })
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

  it('closes the guard when the tab comes back to an expiry its timer never fired', () => {
    // A `setTimeout` is not a promise that it fires. `setSystemTime` is that
    // tab exactly: the wall clock moves past the window while the pending
    // timeout stays pending, which is what a frozen tab or a slept laptop
    // does. Before this, the form came back still holding permission.
    const refetch = vi.fn().mockResolvedValue({})
    useDestinationInfo.mockReturnValue(query({ refetch }))
    render(<SendTab />)
    fillValidForm()
    settleClock()
    expect(reviewButton().disabled).toBe(false)

    vi.setSystemTime(NOW + DESTINATION_CHECK_FRESHNESS_MS + 15_000)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(reviewButton().disabled).toBe(true)
    expect(screen.getByText('Destination check is out of date')).toBeTruthy()
    // Taking a reading is not re-reading: the tab returning must not fetch.
    expect(refetch).not.toHaveBeenCalled()
  })

  it('never lets the freshness clock run backwards', () => {
    render(<SendTab />)
    fillValidForm()
    settleClock()
    act(() => {
      vi.advanceTimersByTime(DESTINATION_CHECK_FRESHNESS_MS + 1_000)
    })
    expect(reviewButton().disabled).toBe(true)

    // A clock that steps back — an NTP correction, a machine whose wall clock
    // was wrong — must not hand back a permission that already expired. Each
    // reading is a floor, never a replacement.
    vi.setSystemTime(NOW)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(reviewButton().disabled).toBe(true)
    expect(screen.getByText('Destination check is out of date')).toBeTruthy()
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

  it('warns that the destination is not activated, on a check that permits the send', () => {
    // Gated on `destCheckOk` by this story. Nothing asserted this panel APPEARS,
    // so re-gating it on anything false in the reachable case — or deleting it —
    // took the only warning off the screen with every test still green.
    // `canSend` consults neither `exists` nor `hasTrustLine`: the panel is the
    // whole warning, and the send it does not block costs a fee on a validated
    // tecNO_DST_INSUFF_XRP.
    useDestinationInfo.mockReturnValue(query({ data: info({ exists: false }) }))
    render(<SendTab />)
    fillValidForm()
    settleClock()

    expect(screen.getByText('Destination not activated')).toBeTruthy()
    // The other half of the title: `canSend` consults neither `exists` nor
    // `hasTrustLine`, so this warns without blocking. A change that starts
    // blocking instead is a different screen, and should fail here.
    expect(reviewButton().disabled).toBe(false)
  })

  it("warns that the recipient can't hold the token, on a check that permits the send", () => {
    // The same hole on the issued-currency leg, where it ends in tecNO_LINE /
    // tecPATH_DRY — also fee-taking, also unwarned.
    useTrustLines.mockReturnValue({ data: [heldToken()] })
    useDestinationInfo.mockReturnValue(query({ data: info({ asset: TOKEN_ASSET, hasTrustLine: false }) }))
    render(<SendTab />)
    fillValidForm()
    fireEvent.change(screen.getByTestId('asset'), { target: { value: TOKEN_ASSET } })
    settleClock()

    expect(screen.getByText("Recipient can't hold this token")).toBeTruthy()
    expect(reviewButton().disabled).toBe(false)
  })

  it('hides both destination warnings once the check they came from is stale', () => {
    // Triage #16: a stale answer must not put its warnings back on screen —
    // that renders a non-current answer as current. Round one of this review
    // pinned only that the panels APPEAR; re-gating them
    // `(destCheckOk || destCheckStale)` passed all 251 tests.
    useTrustLines.mockReturnValue({ data: [heldToken()] })
    useDestinationInfo.mockReturnValue(
      query({ data: info({ exists: false, asset: TOKEN_ASSET, hasTrustLine: false }), ageMs: DESTINATION_CHECK_FRESHNESS_MS + 1_000 }),
    )
    render(<SendTab />)
    fillValidForm()
    fireEvent.change(screen.getByTestId('asset'), { target: { value: TOKEN_ASSET } })
    settleClock()

    expect(screen.getByText('Destination check is out of date')).toBeTruthy()
    expect(screen.queryByText('Destination not activated')).toBeNull()
    expect(screen.queryByText("Recipient can't hold this token")).toBeNull()
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
    // One call carrying BOTH: asserted separately, a probe with the right key
    // and a probe with the right window could be two different calls.
    //
    // `staleTime: Infinity` — an arbitrarily old cached answer authorising a
    // payment — passes every other assertion in this file. It is also caught
    // behaviourally by `query-key-wiring.test.tsx`'s "re-reads an entry older
    // than the freshness window" against a real QueryClient; this pins the same
    // thing at the call site the operator's payment actually goes through.
    expect(fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: queryKeys.destinationInfo('testnet', DESTINATION, 'XRP'),
        staleTime: DESTINATION_CHECK_FRESHNESS_MS,
      }),
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

  it('retires the refusal when the destination changes under it', async () => {
    fetchQuery.mockResolvedValue(info({ requireDestTag: true }))
    render(<SendTab />)
    await reviewAndConfirm()
    expect(screen.getByText('Payment not sent — this address now requires a destination tag')).toBeTruthy()

    // The tag requirement was read about the OLD address. Left on screen it
    // states as fact about the new recipient something never read about them.
    useDestinationInfo.mockReturnValue(query({ data: info({ destination: OTHER_DESTINATION }) }))
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Destination address'), { target: { value: OTHER_DESTINATION } })
    })

    expect(screen.queryByText('Payment not sent — this address now requires a destination tag')).toBeNull()
  })

  it('retires the refusal when the asset changes under it', async () => {
    fetchQuery.mockResolvedValue(info({ requireDestTag: true }))
    useTrustLines.mockReturnValue({ data: [heldToken()] })
    render(<SendTab />)
    await reviewAndConfirm()
    expect(screen.getByText('Payment not sent — this address now requires a destination tag')).toBeTruthy()

    useDestinationInfo.mockReturnValue(query({ data: info({ asset: TOKEN_ASSET, hasTrustLine: true }) }))
    await act(async () => {
      fireEvent.change(screen.getByTestId('asset'), { target: { value: TOKEN_ASSET } })
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

  it('disables both dialog controls while a send is in flight', async () => {
    // The premise `doSend`'s re-entry guard rests on: React drops a press on a
    // disabled control before any handler runs, so no second activation can
    // reach the submit path. Dropping `disabled={busy}` would make a double
    // press reachable — and `busy` there is a render closure, so the guard in
    // `doSend` would not catch it either.
    let release: (w: unknown) => void = () => {}
    unlockWalletForSigning.mockImplementationOnce(() => new Promise((r) => (release = r)))

    render(<SendTab />)
    fillValidForm()
    settleClock()
    fireEvent.click(reviewButton())
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' }))

    expect((screen.getByRole('button', { name: 'Sending…' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      release({ address: WALLET_ADDRESS })
    })
    expect(submitXrpPayment).toHaveBeenCalledOnce()
  })

  it('retires the tag-required refusal once the tag it asked for is entered', async () => {
    fetchQuery.mockResolvedValue(info({ requireDestTag: true }))
    render(<SendTab />)
    await reviewAndConfirm()
    expect(screen.getByText('Payment not sent — this address now requires a destination tag')).toBeTruthy()

    // "Enter the tag the recipient gave you, then send again" — with the tag
    // entered, that sentence is no longer true of this form.
    fireEvent.change(screen.getByLabelText(/^Destination tag/), { target: { value: '42' } })

    expect(screen.queryByText('Payment not sent — this address now requires a destination tag')).toBeNull()
    // And nothing else changed: no other input was touched.
    expect(reviewButton().disabled).toBe(false)
  })

  it('retires the guard-closed refusal once the form is ready again', async () => {
    render(<SendTab />)
    fillValidForm()
    settleClock()
    fireEvent.click(reviewButton())
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1000' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' }))
    })
    expect(screen.getByText('Payment not sent — the form was no longer ready')).toBeTruthy()

    // "What is outstanding is shown on the form" — with nothing outstanding,
    // the panel is a false statement about the form.
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1' } })

    expect(screen.queryByText('Payment not sent — the form was no longer ready')).toBeNull()
    expect(reviewButton().disabled).toBe(false)
  })

  it('does not reopen the confirm step when a withdrawn check recovers', () => {
    const { rerender } = render(<SendTab />)
    fillValidForm()
    settleClock()
    fireEvent.click(reviewButton())
    expect(screen.getByRole('button', { name: 'Confirm and send' })).toBeTruthy()

    // The guard withdraws the dialog when the check ages out under it.
    act(() => {
      vi.advanceTimersByTime(DESTINATION_CHECK_FRESHNESS_MS + 1_000)
    })
    expect(screen.queryByRole('button', { name: 'Confirm and send' })).toBeNull()

    // "Check again" succeeds. The intent to confirm went with the check that
    // formed it, so the spend confirmation does not come back on its own — the
    // one thing a form that moves money must never put in front of somebody
    // unasked. A read that actually ran is stamped at the clock as it stands
    // now, so its age against this file's fixed NOW is negative.
    useDestinationInfo.mockReturnValue(query({ ageMs: -(DESTINATION_CHECK_FRESHNESS_MS + 1_000) }))
    rerender(<SendTab />)
    settleClock()

    expect(reviewButton().disabled).toBe(false)
    expect(screen.queryByRole('button', { name: 'Confirm and send' })).toBeNull()
  })

  it('does not submit when the re-read contradicts the activation it showed', async () => {
    // Shown activated, and the re-read says otherwise. An account CAN be
    // deleted (AccountDelete), and the payment would be a different act from
    // the one the operator approved.
    fetchQuery.mockResolvedValue(info({ exists: false }))
    const { rerender } = render(<SendTab />)
    await reviewAndConfirm()

    expect(submitXrpPayment).not.toHaveBeenCalled()
    expect(screen.getByText('Payment not sent — this address stopped being activated')).toBeTruthy()

    // The probe writes through to the entry the form observes, so the
    // contradicted fact becomes the displayed one within the same tick. A
    // refusal that retired on the current fact would vanish here, leaving a
    // payment that did not happen unexplained.
    useDestinationInfo.mockReturnValue(query({ data: info({ exists: false }) }))
    rerender(<SendTab />)

    expect(screen.getByText('Payment not sent — this address stopped being activated')).toBeTruthy()
    // And says it once: the standing warning stands down while the refusal,
    // which states the same fact in the stronger form of what changed, is up.
    expect(screen.queryByText('Destination not activated')).toBeNull()
  })

  it('does not submit when the re-read contradicts the trust line it showed', async () => {
    useTrustLines.mockReturnValue({ data: [heldToken()] })
    useDestinationInfo.mockReturnValue(query({ data: info({ asset: TOKEN_ASSET, hasTrustLine: true }) }))
    fetchQuery.mockResolvedValue(info({ asset: TOKEN_ASSET, hasTrustLine: false }))
    const { rerender } = render(<SendTab />)
    fireEvent.change(screen.getByTestId('asset'), { target: { value: TOKEN_ASSET } })
    await reviewAndConfirm()

    expect(submitIssuedPayment).not.toHaveBeenCalled()
    expect(screen.getByText('Payment not sent — the recipient stopped accepting this token')).toBeTruthy()

    // The same write-through on the issued-currency leg.
    useDestinationInfo.mockReturnValue(query({ data: info({ asset: TOKEN_ASSET, hasTrustLine: false }) }))
    rerender(<SendTab />)

    expect(screen.getByText('Payment not sent — the recipient stopped accepting this token')).toBeTruthy()
    expect(screen.queryByText("Recipient can't hold this token")).toBeNull()
  })

  it('submits when the re-read agrees the destination was never activated', async () => {
    // The fact was false on screen and is false in the re-read: nothing
    // changed under the operator. Sending to an unactivated address is how an
    // account is activated, and this wallet supports that — a check written
    // against the fact rather than against the contradiction would refuse it.
    useDestinationInfo.mockReturnValue(query({ data: info({ exists: false }) }))
    fetchQuery.mockResolvedValue(info({ exists: false }))
    render(<SendTab />)
    await reviewAndConfirm()

    expect(submitXrpPayment).toHaveBeenCalledOnce()
    expect(screen.queryByText('Payment not sent — this address stopped being activated')).toBeNull()
  })

  it('submits when the re-read agrees the recipient has no trust line', async () => {
    // The warning half of the same rule: `hasTrustLine: false` warns and does
    // not block, on screen and in the re-read alike. A check written against
    // the fact rather than against the contradiction would turn a standing
    // warning into a refusal the operator was never shown.
    useTrustLines.mockReturnValue({ data: [heldToken()] })
    useDestinationInfo.mockReturnValue(query({ data: info({ asset: TOKEN_ASSET, hasTrustLine: false }) }))
    fetchQuery.mockResolvedValue(info({ asset: TOKEN_ASSET, hasTrustLine: false }))
    render(<SendTab />)
    fireEvent.change(screen.getByTestId('asset'), { target: { value: TOKEN_ASSET } })
    await reviewAndConfirm()

    expect(submitIssuedPayment).toHaveBeenCalledOnce()
    expect(screen.queryByText('Payment not sent — the recipient stopped accepting this token')).toBeNull()
  })

  it('takes the confirm step away when the unlock throws', async () => {
    // Nothing was signed and nothing was submitted, and the confirm step goes
    // with the attempt rather than standing over a failure: re-confirming a
    // payment after one is an act the operator takes again.
    unlockWalletForSigning.mockRejectedValue(new Error('unlock failed'))
    render(<SendTab />)
    await reviewAndConfirm()

    expect(submitXrpPayment).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Confirm and send' })).toBeNull()
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

  /** A send discards the whole account-scoped group, for the sender — never the
   * destination — whatever the outcome: a `tec*` claim still moved the fee. */
  function expectAccountGroupInvalidated() {
    for (const key of [
      queryKeys.accountState('testnet', WALLET_ADDRESS),
      queryKeys.accountTx('testnet', WALLET_ADDRESS),
      queryKeys.trustLines('testnet', WALLET_ADDRESS),
      queryKeys.incomingPaymentWatch('testnet', WALLET_ADDRESS),
    ]) {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: key })
    }
  }

  it('invalidates every account-scoped entry for the sender after a validated send', async () => {
    render(<SendTab />)
    await reviewAndConfirm()

    expect(submitXrpPayment).toHaveBeenCalledOnce()
    expectAccountGroupInvalidated()
  })

  it('invalidates every account-scoped entry for the sender after a claimed send', async () => {
    submitXrpPayment.mockResolvedValue({ status: 'claimed', resultCode: 'tecUNFUNDED_PAYMENT', hash: 'AB' })
    render(<SendTab />)
    await reviewAndConfirm()

    expect(submitXrpPayment).toHaveBeenCalledOnce()
    expectAccountGroupInvalidated()
  })
})

/**
 * The affordability check used to `return undefined` the moment there was no
 * spendable figure — "no figure, so no objection" — and an amount was then
 * declared affordable against a balance the app had never worked out. The read
 * that gets there is the 15-second account poll with `retry: 1`, so one failed
 * poll reaches a form the operator is already filling in.
 */
describe('the affordability check fails closed without a spendable figure', () => {
  it('says the balance is still being read, not that it failed, while a read is in flight', () => {
    // A read in flight has not failed. The amount is still refused — nothing
    // may be declared affordable against an unknown balance — but the reason
    // has to be the true one.
    useSpendableBalance.mockReturnValue(spendable({ status: 'loading', isLoading: true, spendableDrops: null, reservedDrops: null }))
    render(<SendTab />)
    fireEvent.change(screen.getByLabelText('Destination address'), { target: { value: DESTINATION } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1000' } })
    settleClock()

    expect(reviewButton().disabled).toBe(true)
    expect(screen.getByText(/still being read/i)).toBeTruthy()
    expect(screen.queryByText(/could not be read/i)).toBeNull()
  })

  it('says an account that does not exist yet has nothing to check against', () => {
    useSpendableBalance.mockReturnValue(spendable({ status: 'not-activated', spendableDrops: null, reservedDrops: null }))
    render(<SendTab />)
    fireEvent.change(screen.getByLabelText('Destination address'), { target: { value: DESTINATION } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1000' } })
    settleClock()

    expect(reviewButton().disabled).toBe(true)
    expect(screen.getByText(/isn't activated yet/i)).toBeTruthy()
    expect(screen.queryByText(/could not be read/i)).toBeNull()
  })

  it('refuses an amount when the spendable balance could not be worked out', () => {
    useSpendableBalance.mockReturnValue(
      spendable({ status: 'unavailable', accountFailed: true, spendableDrops: null, reservedDrops: null }),
    )
    render(<SendTab />)
    // 1000 XRP against a 100 XRP balance: affordable only if nothing checked.
    fireEvent.change(screen.getByLabelText('Destination address'), { target: { value: DESTINATION } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1000' } })
    settleClock()

    expect(reviewButton().disabled).toBe(true)
    expect(screen.getByText(/spendable balance could not be read/i)).toBeTruthy()
  })

  it('says the Spendable readout is unavailable instead of dropping the row', () => {
    useSpendableBalance.mockReturnValue(
      spendable({ status: 'unavailable', accountFailed: true, spendableDrops: null, reservedDrops: null }),
    )
    render(<SendTab />)

    expect(screen.getByText('Spendable')).toBeTruthy()
    expect(screen.getByText('Unavailable')).toBeTruthy()
  })

  it('still allows an amount that fits when the figure was read', () => {
    render(<SendTab />)
    fillValidForm()
    settleClock()

    expect(reviewButton().disabled).toBe(false)
    expect(screen.queryByText(/could not be worked out/i)).toBeNull()
  })
})

/**
 * The fee read used to reach `amountPlusFeeFits` as `fee.data ?? '0'`, so a
 * read that failed — or simply had not landed — was substituted with a fee of
 * zero and an amount that does not fit was declared affordable. The same read
 * was reported twice more as something it was not: the readout rendered the
 * pending ellipsis, and the confirm dialog named "the current rate".
 *
 * `useRecommendedFee` has no `refetchInterval`, so a failed read stays failed
 * until something asks again — which makes the retry below the only way back,
 * not a convenience.
 */
describe('the affordability check fails closed without a fee figure', () => {
  /** An amount comfortably inside the 100 XRP spendable balance, so nothing
   * but the fee can be what refuses it. */
  function fillWellWithinBalance() {
    fireEvent.change(screen.getByLabelText('Destination address'), { target: { value: DESTINATION } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1' } })
  }

  it('refuses an amount that is well within the balance when the fee read failed', () => {
    // Absence of a prohibition is not permission. With `?? '0'` this amount was
    // declared affordable against a fee the app had never read.
    useRecommendedFee.mockReturnValue(feeRead({ data: undefined, isError: true }))
    render(<SendTab />)
    fillWellWithinBalance()
    settleClock()

    expect(reviewButton().disabled).toBe(true)
    // Twice over: the amount field's reason, and the inline report by the row.
    expect(screen.getByText(/network fee could not be read, so this amount/i)).toBeTruthy()
  })

  it('names the fee, not the balance, as the reason', () => {
    useRecommendedFee.mockReturnValue(feeRead({ data: undefined, isError: true }))
    render(<SendTab />)
    fillWellWithinBalance()
    settleClock()

    // The spendable read succeeded. Blaming it would be a second false
    // statement layered on the first.
    expect(screen.queryByText(/spendable balance could not be read/i)).toBeNull()
  })

  it('says the fee is still being read, not that it failed, while a read is in flight', () => {
    useRecommendedFee.mockReturnValue(feeRead({ data: undefined }))
    render(<SendTab />)
    fillWellWithinBalance()
    settleClock()

    expect(reviewButton().disabled).toBe(true)
    expect(screen.getByText(/network fee is still being read/i)).toBeTruthy()
    // In flight has not failed, and nothing on screen may say it has.
    expect(screen.queryByText(/network fee could not be read/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('drops a retained figure while the read is in error', () => {
    // §12 rule 2: a failed refetch that kept an earlier answer is still a
    // failure, and the stale figure must not be shown or acted on.
    useRecommendedFee.mockReturnValue(feeRead({ data: '12', isError: true }))
    render(<SendTab />)
    fillWellWithinBalance()
    settleClock()

    expect(reviewButton().disabled).toBe(true)
    expect(screen.getByText('Unavailable')).toBeTruthy()
  })

  it('keeps the Network fee row and states unavailability in words', () => {
    useRecommendedFee.mockReturnValue(feeRead({ data: undefined, isError: true }))
    render(<SendTab />)

    // A screen with fewer numbers on it than before is the defect, not the fix.
    expect(screen.getByText('Network fee')).toBeTruthy()
    expect(screen.getByText('Unavailable')).toBeTruthy()
  })

  it('shows the pending treatment, and no failure, while the read is in flight', () => {
    useRecommendedFee.mockReturnValue(feeRead({ data: undefined }))
    render(<SendTab />)

    expect(screen.getByText('Network fee')).toBeTruthy()
    expect(screen.getByText('…')).toBeTruthy()
    expect(screen.queryByText('Network fee could not be read')).toBeNull()
  })

  it('offers a retry that is reachable by keyboard alone', () => {
    const refetch = vi.fn().mockResolvedValue({})
    useRecommendedFee.mockReturnValue(feeRead({ data: undefined, isError: true, refetch }))
    render(<SendTab />)

    // A real button, neither `disabled` nor `aria-disabled`: that is what makes
    // it focusable and activatable by Enter without a pointer.
    const retry = screen.getByRole('button', { name: 'Try again' })
    expect(retry.tagName).toBe('BUTTON')
    expect(retry.hasAttribute('disabled')).toBe(false)
    expect(retry.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(retry)
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('puts the figure back and reopens the guard when the retried read succeeds', () => {
    // The panel promises the send is held "until this read succeeds". Without
    // this, that promise is only prose: nothing checks the screen ever comes
    // back, and the hook has no refetchInterval to come back on its own.
    useRecommendedFee.mockReturnValue(feeRead({ data: undefined, isError: true }))
    const { rerender } = render(<SendTab />)
    fillWellWithinBalance()
    settleClock()
    expect(reviewButton().disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    useRecommendedFee.mockReturnValue(feeRead())
    rerender(<SendTab />)
    settleClock()

    expect(screen.getByText(formatXrp('12'))).toBeTruthy()
    expect(screen.queryByText('Network fee could not be read')).toBeNull()
    expect(reviewButton().disabled).toBe(false)
  })

  it('reports a failed fee and a failed balance each in its own words, once', () => {
    useRecommendedFee.mockReturnValue(feeRead({ data: undefined, isError: true }))
    useSpendableBalance.mockReturnValue(
      spendable({ status: 'unavailable', accountFailed: true, spendableDrops: null, reservedDrops: null }),
    )
    render(<SendTab />)
    fillWellWithinBalance()
    settleClock()

    // Two failed reads, two reports. The spendable wording story 5.2 settled is
    // the one the amount field carries, because it is checked first.
    expect(screen.getByText(/spendable balance could not be read/i)).toBeTruthy()
    expect(screen.getByText('Network fee could not be read')).toBeTruthy()
    // Scoped to the fee's own row: counting 'Unavailable' across the well would
    // tie this story's assertion to the Spendable row's wording, which story
    // 5.2 owns and this one must not constrain.
    expect(screen.getByText('Network fee').closest('div')?.textContent).toContain('Unavailable')
    expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1)
  })

  it('behaves exactly as before once the fee read succeeds', () => {
    render(<SendTab />)
    fillWellWithinBalance()
    settleClock()

    expect(reviewButton().disabled).toBe(false)
    // The figure itself, not merely the absence of a complaint: a row that
    // rendered the pending ellipsis over a fee it HAD would otherwise pass.
    expect(screen.getByText(formatXrp('12'))).toBeTruthy()
    expect(screen.queryByText('…')).toBeNull()
    expect(screen.queryByText(/network fee could not be read/i)).toBeNull()
    expect(screen.queryByText(/network fee is still being read/i)).toBeNull()
  })

  it('keeps the confirm step out of reach while the fee read has failed', () => {
    // The matrix row says the dialog is unreachable, and the mechanism is
    // `fundsError` closing `canSend` — not the dialog's own open condition,
    // which consults the destination check alone. Asserted on the dialog, so a
    // future change that opens it another way fails here.
    useRecommendedFee.mockReturnValue(feeRead({ data: undefined, isError: true }))
    render(<SendTab />)
    fillWellWithinBalance()
    settleClock()

    fireEvent.click(reviewButton())
    expect(screen.queryByRole('button', { name: 'Confirm and send' })).toBeNull()
  })

  it('names the fee in the confirm dialog when it was read', () => {
    render(<SendTab />)
    fillWellWithinBalance()
    settleClock()
    fireEvent.click(reviewButton())

    // The figure the row shows, not just the preposition before it.
    expect(screen.getByText(/plus a network fee of/i).textContent).toContain(`plus a network fee of ${formatXrp('12')}`)
    expect(screen.queryByText(/the current rate/i)).toBeNull()
  })
})

/**
 * A token send decides nothing against the fee figure — no arithmetic on this
 * path reads it — so a failed fee read states a fact here rather than closing a
 * guard. Blocking it would refuse sends whose affordability never depended on
 * the fee.
 */
describe('a failed fee read does not block a token send', () => {
  function renderTokenForm() {
    useTrustLines.mockReturnValue({ data: [heldToken()] })
    // The destination answer has to be stamped for the asset actually selected:
    // `hasTrustLine` answers a question about the token, not about XRP.
    useDestinationInfo.mockReturnValue(query({ data: info({ asset: TOKEN_ASSET, hasTrustLine: true }) }))
    render(<SendTab />)
    fireEvent.change(screen.getByTestId('asset'), { target: { value: TOKEN_ASSET } })
    fireEvent.change(screen.getByLabelText('Destination address'), { target: { value: DESTINATION } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1' } })
    settleClock()
  }

  it('still permits the send', () => {
    useRecommendedFee.mockReturnValue(feeRead({ data: undefined, isError: true }))
    renderTokenForm()

    expect(reviewButton().disabled).toBe(false)
    // The failed read is still STATED — the fee row is not asset-gated, and a
    // panel that came and went with the asset picker would be a second thing
    // the screen says about one read. What must not appear is a refusal: the
    // amount field carries no fee reason, because nothing here was decided
    // against the fee.
    expect(screen.getByText('Network fee could not be read')).toBeTruthy()
    expect(screen.queryByText(/network fee could not be read, so this amount/i)).toBeNull()
  })

  it('states in the confirm dialog that the fee is still being read, while it is', () => {
    // A token send is permitted throughout, so this is the one place the
    // in-flight wording is reachable — and pending must not borrow failed's
    // words here either.
    useRecommendedFee.mockReturnValue(feeRead({ data: undefined }))
    renderTokenForm()
    fireEvent.click(reviewButton())

    expect(screen.getByText(/plus a network fee that is still being read/i)).toBeTruthy()
    expect(screen.queryByText(/plus a network fee that could not be read/i)).toBeNull()
  })

  it('states in the confirm dialog that the fee could not be read', () => {
    useRecommendedFee.mockReturnValue(feeRead({ data: undefined, isError: true }))
    renderTokenForm()
    fireEvent.click(reviewButton())

    expect(screen.getByText(/plus a network fee that could not be read/i)).toBeTruthy()
    expect(screen.queryByText(/the current rate/i)).toBeNull()
  })
})
