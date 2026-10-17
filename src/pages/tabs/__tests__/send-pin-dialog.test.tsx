/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

/**
 * Story 5: Send of a PIN-sealed Wallet. The PIN dialog opens above the confirm
 * dialog, states tries remaining, and is reachable by role (not aria-hidden
 * behind the confirm dialog).
 */
const useDestinationInfo = vi.fn()
const useSpendableBalance = vi.fn()
const useRecommendedFee = vi.fn()
const useTrustLines = vi.fn()
const fetchQuery = vi.fn()
const submitXrpPayment = vi.fn()
const submitIssuedPayment = vi.fn()
const signingHandleFor = vi.fn()
/** Named, so a test can see what a send discards and for whom. */
const invalidateQueries = vi.fn()

vi.mock('@/hooks/useDestinationInfo', () => ({ useDestinationInfo: () => useDestinationInfo() }))
vi.mock('@/hooks/useRecommendedFee', () => ({ useRecommendedFee: () => useRecommendedFee() }))
vi.mock('@/hooks/useTrustLines', () => ({ useTrustLines: () => useTrustLines() }))
/** Radix's Select needs pointer capture jsdom does not implement, and the
 * asset picker is a means to an end here: the token-send assertions are about
 * the fee, not about the listbox. A native select keeps the same contract —
 * `value` in, `onValueChange` out — with none of that apparatus. */
vi.mock('@/components/ui/select', () => {
  // The trigger (and the `SelectValue` label inside it) renders beside the
  // native select rather than in it: a `<span>` is not valid inside `<select>`.
  const SelectTrigger = ({ children }: any) => <>{children}</>
  return {
    Select: ({ value, onValueChange, children }: any) => {
      const all = Array.isArray(children) ? children : [children]
      return (
        <>
          <select data-testid="asset" value={value} onChange={(e) => onValueChange(e.target.value)}>
            {all.filter((c: any) => c?.type !== SelectTrigger)}
          </select>
          {all.filter((c: any) => c?.type === SelectTrigger)}
        </>
      )
    },
    SelectTrigger,
    SelectValue: ({ children }: any) => <span data-testid="asset-label">{children}</span>,
    SelectContent: ({ children }: any) => <>{children}</>,
    SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
  }
})
vi.mock('@/hooks/useSpendableBalance', () => ({ useSpendableBalance: () => useSpendableBalance() }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries, fetchQuery }),
}))
vi.mock('@/lib/crypto/keystore', () => ({
  signingHandleFor: (...args: unknown[]) => signingHandleFor(...args),
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
/** Mutable so a test can switch networks, or wallets, under a rendered form.
 * `SendTab` is not remounted by either switch in the app, and is not here. */
let network = 'testnet'
let walletAddress = 'r4NagxniGTmPRr8yBRXRD6NNpZP7FfP4KR'

vi.mock('@/store/app-store', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    // A real vaultKey: with `null` here `doSend` returns at its first line and
    // every submit-path assertion below would pass without reaching the guard.
    selector({ network, vaultKey: {}, addressBook: [], addAddressBookEntry: vi.fn() }),
  useWalletOpenKey: () => ({}),
  useActiveNetwork: () => network,
  useActiveNode: () => undefined,
  useActiveWallet: () => ({ id: 'w1', address: walletAddress, label: 'Test' }),
}))

import { SendTab } from '../SendTab'
import { PinPromptProvider } from '@/components/wallet/PinPromptDialog'

const DESTINATION = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'
const WALLET_ADDRESS = 'r4NagxniGTmPRr8yBRXRD6NNpZP7FfP4KR'

beforeEach(() => {
  network = 'testnet'
  walletAddress = WALLET_ADDRESS
  useDestinationInfo.mockReturnValue({
    data: { network: 'testnet', destination: DESTINATION, asset: 'XRP', exists: true, requireDestTag: false },
    isError: false,
    isSuccess: true,
    isFetching: false,
    dataUpdatedAt: Date.now(),
    refetch: vi.fn().mockResolvedValue({}),
  })
  useSpendableBalance.mockReturnValue({
    status: 'ok', isLoading: false, reserveFailed: false, accountFailed: false, retryReserves: vi.fn(),
    spendableDrops: '100000000', reservedDrops: '1000000',
  })
  useRecommendedFee.mockReturnValue({ data: '12', isError: false, refetch: vi.fn() })
  useTrustLines.mockReturnValue({ data: [] })
  fetchQuery.mockResolvedValue({ network: 'testnet', destination: DESTINATION, asset: 'XRP', exists: true, requireDestTag: false })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SendTab with a PIN Signing Check', () => {
  it('asks the PIN in a dialog above the confirm step, states tries remaining, and signs with the answer', async () => {
    let answered: string | null | undefined
    signingHandleFor.mockImplementation(async (_id: string, ctx: { prompts: { pin(i: { triesRemaining: number }): Promise<string | null> } }) => ({
      address: WALLET_ADDRESS,
      open: async () => {
        answered = await ctx.prompts.pin({ triesRemaining: 6 })
        return { sign: () => ({ tx_blob: '00', hash: 'AA' }), dispose: () => {} }
      },
    }))
    submitXrpPayment.mockImplementation(async (_n: unknown, handle: { open(): Promise<{ sign(tx: unknown): unknown; dispose(): void }> }) => {
      const signer = await handle.open()
      signer.sign({})
      signer.dispose()
      return { status: 'validated', resultCode: 'tesSUCCESS', hash: 'AB' }
    })
    render(
      <PinPromptProvider>
        <SendTab />
      </PinPromptProvider>,
    )
    fireEvent.change(screen.getByLabelText('Destination address'), { target: { value: DESTINATION } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review payment' }))
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' })))

    // Reachable by role: not hidden behind the confirm dialog.
    expect(await screen.findByText('6 tries remaining.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('App PIN'), { target: { value: '123456' } })
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Continue' })))
    expect(answered).toBe('123456')
    expect(submitXrpPayment).toHaveBeenCalledOnce()
  })

  it('cancelling the dialog submits nothing', async () => {
    let answered: string | null | undefined
    signingHandleFor.mockImplementation(async (_id: string, ctx: { prompts: { pin(i: { triesRemaining: number }): Promise<string | null> } }) => ({
      address: WALLET_ADDRESS,
      open: async () => {
        answered = await ctx.prompts.pin({ triesRemaining: 8 })
        throw new Error('Cancelled. Nothing was signed.')
      },
    }))
    submitXrpPayment.mockImplementation(async (_n: unknown, handle: { open(): Promise<unknown> }) => handle.open())
    render(
      <PinPromptProvider>
        <SendTab />
      </PinPromptProvider>,
    )
    fireEvent.change(screen.getByLabelText('Destination address'), { target: { value: DESTINATION } })
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review payment' }))
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' })))
    await screen.findByText('8 tries remaining.')
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Cancel', hidden: false })))
    expect(answered).toBeNull()
    expect(screen.queryByText('8 tries remaining.')).toBeNull()
    expect(submitXrpPayment).toHaveBeenCalledOnce() // it asked, and the open() threw: nothing signed
  })
})
