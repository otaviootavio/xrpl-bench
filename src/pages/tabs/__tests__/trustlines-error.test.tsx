/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { SpendableBalance } from '@/hooks/useSpendableBalance'

const useTrustLines = vi.fn()
/** Named, so a test can see what a TrustSet discards and for whom. */
const invalidateQueries = vi.fn()
const submitTrustSet = vi.fn()
const signingHandleFor = vi.fn()

vi.mock('@/hooks/useTrustLines', () => ({ useTrustLines: (...a: unknown[]) => useTrustLines(...a) }))
const useServerReserves = vi.fn()
const useRecommendedFee = vi.fn()
// Annotated, so renaming a `status` value or dropping a field is a compile
// error here rather than a test that stays green against a stale contract.
const useSpendableBalance = vi.fn<() => SpendableBalance>()
vi.mock('@/hooks/useServerReserves', () => ({ useServerReserves: () => useServerReserves() }))
vi.mock('@/hooks/useRecommendedFee', () => ({ useRecommendedFee: () => useRecommendedFee() }))
vi.mock('@/hooks/useSpendableBalance', () => ({ useSpendableBalance: () => useSpendableBalance() }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))
vi.mock('@/lib/crypto/keystore', () => ({
  signingHandleFor: (...args: unknown[]) => signingHandleFor(...args),
  unavailablePrompts: { pin: async () => null },
}))
vi.mock('@/lib/xrpl/writes', () => ({
  submitTrustSet: (...args: unknown[]) => submitTrustSet(...args),
}))
// The row renders an AddressLink, which reads the store and mounts a Tooltip;
// neither is what this test is about.
vi.mock('@/components/wallet/TrustLineRow', () => ({
  TrustLineRow: ({ line, onEditLimit, onRemove }: { line: { currency: string }; onEditLimit: () => void; onRemove: () => void }) => (
    <div>
      row:{line.currency}
      <button onClick={onEditLimit}>Edit {line.currency}</button>
      <button onClick={onRemove}>Remove {line.currency}</button>
    </div>
  ),
}))
let activeNode: string | undefined
vi.mock('@/store/app-store', () => ({
  // A real vaultKey: with `null` here `submit` returns at its first line and a
  // TrustSet never reaches the invalidation.
  useAppStore: (selector: (s: { network: string; vaultKey: object }) => unknown) =>
    selector({ network: 'testnet', vaultKey: {} }),
  useWalletOpenKey: () => ({}),
  useActiveNetwork: () => 'testnet',
  useActiveNode: () => activeNode,
  useActiveWallet: () => ({ id: 'w1', address: 'rBoGUS9uiK9m3Kk6qnGRvWWCwAeN8hF3wR', label: 'Test' }),
}))

import { TrustLinesTab } from '../TrustLinesTab'
import { queryKeys } from '@/lib/xrpl/query-keys'
import { toast } from '@/lib/notify'

const WALLET_ADDRESS = 'rBoGUS9uiK9m3Kk6qnGRvWWCwAeN8hF3wR'

/** A handle whose Signing Check passes at once. */
const signed = vi.fn()
const fakeHandle = () => ({
  address: WALLET_ADDRESS,
  open: async () => ({ sign: (tx: unknown) => (signed(tx), { tx_blob: '00', hash: 'AA' }), dispose: () => {} }),
})
/** A submit that, like the choke point, opens the Signer before reporting `outcome`. */
const opening = (outcome: unknown) => async (_network: unknown, handle: { open(): Promise<{ sign(tx: unknown): unknown; dispose(): void }> }) => {
  const signer = await handle.open()
  signer.sign({})
  signer.dispose()
  return outcome
}
const ISSUER = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'

function query(overrides: Record<string, unknown> = {}) {
  return { data: undefined, isLoading: false, isError: false, refetch: vi.fn(), ...overrides }
}

const line = { account: 'rIssuer', currency: 'USD', balance: '0', limit: '1', freeze: false, freezePeer: false }

const RESERVES = { baseReserveDrops: '1000000', ownerReserveDrops: '200000' }
function spendableOf(overrides: Partial<SpendableBalance> = {}): SpendableBalance {
  return {
    status: 'ok',
    isLoading: false,
    reserveFailed: false,
    accountFailed: false,
    retryReserves: vi.fn().mockResolvedValue({}),
    spendableDrops: '25000000',
    reservedDrops: '1000000',
    ...overrides,
  }
}

beforeEach(() => {
  useTrustLines.mockReturnValue(query({ data: [] }))
  useServerReserves.mockReturnValue(query({ data: RESERVES }))
  useRecommendedFee.mockReturnValue(query({ data: '12' }))
  useSpendableBalance.mockReturnValue(spendableOf())
  invalidateQueries.mockClear()
  submitTrustSet.mockReset()
  activeNode = undefined
  signingHandleFor.mockReset()
  signed.mockClear()
})
afterEach(cleanup)

describe('TrustLinesTab — a TrustSet discards the whole account group', () => {
  it('invalidates every account-scoped entry for the active wallet after a submit', async () => {
    signingHandleFor.mockImplementation(async () => fakeHandle())
    submitTrustSet.mockImplementation(opening({ status: 'validated', resultCode: 'tesSUCCESS', hash: 'EF' }))
    render(<TrustLinesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Add trust line' }))
    fireEvent.change(screen.getByLabelText('Issuer address'), { target: { value: ISSUER } })
    fireEvent.change(screen.getByLabelText('Currency code'), { target: { value: 'USD' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create trust line' }))
    })

    expect(submitTrustSet).toHaveBeenCalledOnce()
    for (const key of [
      queryKeys.accountState('testnet', WALLET_ADDRESS),
      queryKeys.accountTx('testnet', WALLET_ADDRESS),
      queryKeys.trustLines('testnet', WALLET_ADDRESS),
      queryKeys.incomingPaymentWatch('testnet', WALLET_ADDRESS),
    ]) {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: key })
    }
  })
})

describe('TrustLinesTab — an unknown outcome', () => {
  it('warns with the hash, raises no error, and closes the dialog so one click cannot resubmit', async () => {
    const warning = vi.spyOn(toast, 'warning')
    const error = vi.spyOn(toast, 'error')
    signingHandleFor.mockImplementation(async () => fakeHandle())
    submitTrustSet.mockImplementation(opening({ status: 'unknown', hash: 'C0FFEE' }))
    render(<TrustLinesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Add trust line' }))
    fireEvent.change(screen.getByLabelText('Issuer address'), { target: { value: ISSUER } })
    fireEvent.change(screen.getByLabelText('Currency code'), { target: { value: 'USD' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create trust line' }))
    })

    expect(warning).toHaveBeenCalledOnce()
    expect(warning.mock.calls[0][0]).toMatch(/^Outcome unknown\..*C0FFEE/)
    expect(error).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Create trust line' })).toBeNull()
    expect(screen.queryByLabelText('Issuer address')).toBeNull()
    warning.mockRestore()
    error.mockRestore()
  })
})

describe('TrustLinesTab — the active Wallet\'s Node', () => {
  it('reaches the submit as its trailing argument and the read hooks', async () => {
    activeNode = 'wss://node.example.com'
    signingHandleFor.mockImplementation(async () => fakeHandle())
    submitTrustSet.mockImplementation(opening({ status: 'validated', resultCode: 'tesSUCCESS', hash: 'EF' }))
    render(<TrustLinesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Add trust line' }))
    fireEvent.change(screen.getByLabelText('Issuer address'), { target: { value: ISSUER } })
    fireEvent.change(screen.getByLabelText('Currency code'), { target: { value: 'USD' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create trust line' }))
    })
    expect(submitTrustSet.mock.calls[0][3]).toBe('wss://node.example.com')
    expect(useTrustLines).toHaveBeenCalledWith('testnet', WALLET_ADDRESS, 'wss://node.example.com')
  })
})

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

/** Opens the add dialog with a valid issuer and currency, and returns it. */
function openAddDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Add trust line' }))
  fireEvent.change(screen.getByLabelText('Issuer address'), { target: { value: ISSUER } })
  fireEvent.change(screen.getByLabelText('Currency code'), { target: { value: 'USD' } })
  return screen.getByRole('dialog')
}
const createButton = () => screen.getByRole('button', { name: /Create trust line/ }) as HTMLButtonElement

/** The trust-line screen's reserve, balance and fee guard — one case per row of
 * the spec's matrix, read at the screen surface. */
describe('TrustLinesTab — the reserve, balance and fee are read states', () => {
  it('all read and enough XRP: states reserve and fee, enables Create, and signs the shown fee', async () => {
    signingHandleFor.mockImplementation(async () => fakeHandle())
    submitTrustSet.mockImplementation(opening({ status: 'validated', resultCode: 'tesSUCCESS', hash: 'EF' }))
    useRecommendedFee.mockReturnValue(query({ data: '15' }))
    render(<TrustLinesTab />)
    const dialog = openAddDialog()

    expect(within(dialog).getByText('0.2 XRP')).toBeTruthy()
    expect(within(dialog).getByText('0.000015 XRP')).toBeTruthy()
    expect(createButton().disabled).toBe(false)
    await act(async () => {
      fireEvent.click(createButton())
    })
    expect(submitTrustSet.mock.calls[0][2]).toMatchObject({ currency: 'USD', issuer: ISSUER, feeDrops: '15' })
  })

  it('reserve pending: no reserve figure anywhere, Create disabled with the reason', () => {
    useServerReserves.mockReturnValue(query({ isLoading: true }))
    render(<TrustLinesTab />)
    openAddDialog()

    expect(document.body.textContent).not.toMatch(/0\.2 XRP/)
    expect(screen.getByText('Reading the owner reserve…')).toBeTruthy()
    expect(createButton().disabled).toBe(true)
  })

  it('reserve failed over retained data: no figure, Create disabled, and Retry refetches the reserve', () => {
    const refetch = vi.fn().mockResolvedValue({})
    useServerReserves.mockReturnValue(query({ isError: true, data: RESERVES, refetch }))
    render(<TrustLinesTab />)
    const dialog = openAddDialog()

    expect(document.body.textContent).not.toMatch(/0\.2 XRP/)
    expect(within(dialog).getByText(/^The owner reserve could not be read/)).toBeTruthy()
    expect(createButton().disabled).toBe(true)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  it.each([
    ['loading', /^Reading your spendable balance/],
    ['unavailable', /^Your spendable balance could not be read/],
    ['not-activated', /not activated/],
  ] as const)('spendable %s: Create disabled with a balance reason, not "not enough XRP"', (status, reason) => {
    useSpendableBalance.mockReturnValue(spendableOf({ status, spendableDrops: null, reservedDrops: null }))
    render(<TrustLinesTab />)
    const dialog = openAddDialog()

    expect(within(dialog).getByText(reason)).toBeTruthy()
    expect(within(dialog).queryByText(/enough spendable XRP/)).toBeNull()
    expect(createButton().disabled).toBe(true)
  })

  it('not enough: spendable covers the reserve but not the fee on top of it', () => {
    useSpendableBalance.mockReturnValue(spendableOf({ spendableDrops: '200011' }))
    render(<TrustLinesTab />)
    openAddDialog()

    expect(screen.getByText("You don't have enough spendable XRP to cover the reserve and fee.")).toBeTruthy()
    expect(createButton().disabled).toBe(true)
  })

  it('exactly reserve plus fee is enough', () => {
    useSpendableBalance.mockReturnValue(spendableOf({ spendableDrops: '200012' }))
    render(<TrustLinesTab />)
    openAddDialog()

    expect(createButton().disabled).toBe(false)
  })

  it('fee pending: shown as "…", and Create disabled with the reason', () => {
    useRecommendedFee.mockReturnValue(query({ isLoading: true }))
    render(<TrustLinesTab />)
    const dialog = openAddDialog()

    expect(within(dialog).getByText('…')).toBeTruthy()
    expect(within(dialog).getByText('Reading the network fee…')).toBeTruthy()
    expect(createButton().disabled).toBe(true)
  })

  it('fee failed over retained data: shown as "Unavailable", and Create disabled with the reason', () => {
    useRecommendedFee.mockReturnValue(query({ isError: true, data: '12' }))
    render(<TrustLinesTab />)
    const dialog = openAddDialog()

    expect(within(dialog).getByText('Unavailable')).toBeTruthy()
    expect(within(dialog).queryByText('0.000012 XRP')).toBeNull()
    expect(within(dialog).getByText(/^The current network fee could not be read/)).toBeTruthy()
    expect(createButton().disabled).toBe(true)
  })

  it('fee above the cap: Create disabled, and the reason states the cap', () => {
    useRecommendedFee.mockReturnValue(query({ data: '20000' }))
    render(<TrustLinesTab />)
    openAddDialog()

    expect(screen.getByText(/above this wallet's limit of 0\.01 XRP/)).toBeTruthy()
    expect(createButton().disabled).toBe(true)
  })
})

describe('TrustLinesTab — edit and close state and sign the fee', () => {
  beforeEach(() => {
    useTrustLines.mockReturnValue(query({ data: [line] }))
    signingHandleFor.mockImplementation(async () => fakeHandle())
    submitTrustSet.mockImplementation(opening({ status: 'validated', resultCode: 'tesSUCCESS', hash: 'EF' }))
    useRecommendedFee.mockReturnValue(query({ data: '15' }))
  })

  it('edit: the dialog states the fee and the signed fee equals it', async () => {
    render(<TrustLinesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit USD' }))
    const dialog = screen.getByRole('dialog')

    expect(within(dialog).getByText('0.000015 XRP')).toBeTruthy()
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Update limit' }))
    })
    expect(submitTrustSet.mock.calls[0][2]).toMatchObject({ limit: '1', feeDrops: '15' })
  })

  it('close: the dialog states the fee and the reserve it releases, and the signed fee equals it', async () => {
    render(<TrustLinesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove USD' }))
    const dialog = screen.getByRole('dialog')

    expect(within(dialog).getByText('0.000015 XRP')).toBeTruthy()
    expect(within(dialog).getByText(/releases its 0\.2 XRP owner reserve/)).toBeTruthy()
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close trust line' }))
    })
    expect(submitTrustSet.mock.calls[0][2]).toMatchObject({ limit: '0', feeDrops: '15' })
  })

  it('close with the reserve unread: no reserve figure in the dialog', () => {
    useServerReserves.mockReturnValue(query({ isError: true, data: RESERVES }))
    render(<TrustLinesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove USD' }))

    expect(document.body.textContent).not.toMatch(/0\.2 XRP/)
    expect(within(screen.getByRole('dialog')).getByText(/releases its owner reserve/)).toBeTruthy()
  })

  it.each([
    ['pending', query({ isLoading: true })],
    ['failed', query({ isError: true, data: '15' })],
    ['above the cap', query({ data: '20000' })],
  ])('fee %s: Update limit and Close trust line are both disabled', (_label, feeQuery) => {
    useRecommendedFee.mockReturnValue(feeQuery)
    render(<TrustLinesTab />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit USD' }))
    expect((within(screen.getByRole('dialog')).getByRole('button', { name: 'Update limit' }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()

    render(<TrustLinesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove USD' }))
    expect((within(screen.getByRole('dialog')).getByRole('button', { name: 'Close trust line' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('TrustLinesTab — fee refusals are retried, described and never formatted when malformed', () => {
  it('a failed fee: "Try again" in the dialog refetches the fee read once', () => {
    const refetch = vi.fn().mockResolvedValue({})
    useRecommendedFee.mockReturnValue(query({ isError: true, refetch }))
    render(<TrustLinesTab />)
    const dialog = openAddDialog()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('a malformed fee ("012"): "Unavailable", no fee figure, the could-not-be-read reason, Create disabled', () => {
    useRecommendedFee.mockReturnValue(query({ data: '012' }))
    render(<TrustLinesTab />)
    const dialog = openAddDialog()

    expect(within(dialog).getByText('Unavailable')).toBeTruthy()
    expect(within(dialog).queryByText(/0\.000012 XRP|0\.00012 XRP/)).toBeNull()
    expect(within(dialog).getByText(/^The current network fee could not be read/)).toBeTruthy()
    expect(createButton().disabled).toBe(true)
  })

  const FEES = [
    ['pending', () => query({ isLoading: true }), /^Reading the network fee/],
    ['failed', () => query({ isError: true, data: '15' }), /The current network fee could not be read/],
    ['above the cap', () => query({ data: '20000' }), /above this wallet's limit of 0\.01 XRP/],
  ] as const

  it.each(FEES)('add, fee %s: the refusal note renders and Create is described by it', (_label, feeQuery, reason) => {
    useRecommendedFee.mockReturnValue(feeQuery())
    render(<TrustLinesTab />)
    openAddDialog()

    const note = document.getElementById('add-refusal')
    expect(note?.textContent).toMatch(reason)
    expect(createButton().getAttribute('aria-describedby')).toBe('add-refusal')
  })

  it.each(FEES)('edit and close, fee %s: the refusal note renders and the action is described by it', (_label, feeQuery, reason) => {
    useTrustLines.mockReturnValue(query({ data: [line] }))
    useRecommendedFee.mockReturnValue(feeQuery())

    render(<TrustLinesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit USD' }))
    expect(document.getElementById('edit-refusal')?.textContent).toMatch(reason)
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Update limit' }).getAttribute('aria-describedby')).toBe('edit-refusal')
    cleanup()

    render(<TrustLinesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove USD' }))
    expect(document.getElementById('close-refusal')?.textContent).toMatch(reason)
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close trust line' }).getAttribute('aria-describedby')).toBe('close-refusal')
  })

  it('while submitting, the dialog shows the fee pinned at the press, not the live poll', async () => {
    useTrustLines.mockReturnValue(query({ data: [line] }))
    useRecommendedFee.mockReturnValue(query({ data: '15' }))
    signingHandleFor.mockImplementation(async () => fakeHandle())
    let settle: (v: unknown) => void = () => {}
    submitTrustSet.mockImplementation(() => new Promise((r) => (settle = r)))
    const { rerender } = render(<TrustLinesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit USD' }))
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Update limit' }))
    })

    useRecommendedFee.mockReturnValue(query({ data: '30' }))
    rerender(<TrustLinesTab />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('0.000015 XRP')).toBeTruthy()
    expect(within(dialog).queryByText('0.00003 XRP')).toBeNull()

    await act(async () => settle({ status: 'failed', resultCode: 'tefPAST_SEQ', hash: 'AB' }))
    expect(within(screen.getByRole('dialog')).getByText('0.00003 XRP')).toBeTruthy()
  })
})
