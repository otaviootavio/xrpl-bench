/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SpendableBalance } from '@/hooks/useSpendableBalance'

const useTrustLines = vi.fn()
/** Named, so a test can see what a TrustSet discards and for whom. */
const invalidateQueries = vi.fn()
const submitTrustSet = vi.fn()
const signingHandleFor = vi.fn()

vi.mock('@/hooks/useTrustLines', () => ({ useTrustLines: (...a: unknown[]) => useTrustLines(...a) }))
vi.mock('@/hooks/useServerReserves', () => ({
  useServerReserves: () => ({ data: { baseReserveDrops: '1000000', ownerReserveDrops: '200000' } }),
}))
vi.mock('@/hooks/useSpendableBalance', () => ({
  // Annotated, so renaming a `status` value or dropping a field is a compile
  // error here rather than a test that stays green against a stale contract.
  useSpendableBalance: (): SpendableBalance => ({
    status: 'ok',
    isLoading: false,
    reserveFailed: false,
    accountFailed: false,
    retryReserves: vi.fn().mockResolvedValue({}),
    spendableDrops: '25000000',
    reservedDrops: '1000000',
  }),
}))
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
  TrustLineRow: ({ line }: { line: { currency: string } }) => <div>row:{line.currency}</div>,
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

beforeEach(() => {
  useTrustLines.mockReturnValue(query({ data: [] }))
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
