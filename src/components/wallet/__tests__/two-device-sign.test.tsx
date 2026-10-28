/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { encodeUnsigned } from '@/lib/qr-codec'

/** Story 11: the component only RENDERS what `lib/two-device.ts` decides; the flows are stubbed at their edge. */
const h = vi.hoisted(() => ({
  account: { isError: false, data: undefined as unknown },
  buildUnsigned: vi.fn(),
  signUnsigned: vi.fn(),
  submitReturned: vi.fn(),
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/hooks/useAccountState', () => ({ useAccountState: () => h.account }))
vi.mock('@/hooks/usePrompts', () => ({ usePrompts: () => ({ pin: async () => null }) }))
vi.mock('@/components/wallet/QrCode', () => ({ QrCode: ({ text }: { text: string }) => <div data-testid="qr">{text}</div> }))
vi.mock('@/store/app-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/app-store')>()
  return { ...actual, useWalletOpenKey: () => null }
})
vi.mock('@/lib/two-device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/two-device')>()
  return {
    ...actual,
    buildUnsigned: (...a: unknown[]) => h.buildUnsigned(...a),
    signUnsigned: (...a: unknown[]) => h.signUnsigned(...a),
    submitReturned: (...a: unknown[]) => h.submitReturned(...a),
  }
})

import { TwoDeviceScreen, TwoDeviceSign } from '../TwoDeviceSign'
import { useAppStore } from '@/store/app-store'

const WALLET = {
  id: 'w', seedId: 's', lockId: 'l', label: 'Vault', address: 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL', keyAddress: 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL',
  createdAt: 1, network: 'testnet', algorithm: 'ed25519', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard',
} as never
const state = (extra: Record<string, unknown> = {}) => ({
  exists: true, address: 'rA', balanceDrops: '50000000', ownerCount: 0, sequence: 1, requireDestTag: false, disableMasterKey: false, ...extra,
})
const click = async (el: HTMLElement) => act(async () => void fireEvent.click(el))
const onClose = vi.fn()
const mount = (w: unknown = WALLET) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <TwoDeviceScreen wallet={w as never} onClose={onClose} />
    </QueryClientProvider>,
  )
const btn = (name: RegExp | string) => screen.getByRole('button', { name })

beforeEach(() => {
  onClose.mockReset()
  h.account = { isError: false, data: state() }
  h.buildUnsigned.mockReset()
  h.signUnsigned.mockReset()
  h.submitReturned.mockReset()
})
afterEach(cleanup)

describe('TwoDeviceSign, online side', () => {
  it('is aria-disabled with the reason as text on an errored read, and a click builds nothing', async () => {
    h.account = { isError: true, data: state() }
    mount()
    await click(btn(/This device is online/))
    expect(btn('Build the transaction').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/ledger could not be read/)).toBeTruthy()
    await click(btn('Build the transaction'))
    expect(h.buildUnsigned).not.toHaveBeenCalled()
  })

  it('states the expiry as a window, with the figure, beside the code, and offers copy and the paste field', async () => {
    h.buildUnsigned.mockResolvedValue({ status: 'built', text: 'xrplbench:1:u:AAA', tx: {}, lastLedgerSequence: 1075 })
    mount()
    await click(btn(/This device is online/))
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' } })
    fireEvent.change(screen.getByLabelText('Amount (XRP)'), { target: { value: '1.5' } })
    await click(btn('Build the transaction'))
    expect(h.buildUnsigned).toHaveBeenCalledWith('w', expect.objectContaining({ kind: 'payment', amountDrops: '1500000' }), expect.anything())
    expect(screen.getByText(/roughly four to six minutes/)).toBeTruthy()
    expect(screen.getByText(/not a promised time/)).toBeTruthy()
    expect(screen.getByText('1075')).toBeTruthy()
    expect(screen.getByTestId('qr').textContent).toBe('xrplbench:1:u:AAA')
    expect(btn(/Copy the text of the transaction to sign/)).toBeTruthy()
    // jsdom has no BarcodeDetector: the same screen takes the signed result as pasted text.
    expect(screen.getByLabelText(/Or paste the text of the signed transaction/)).toBeTruthy()
  })

  it('shows a refusal reason as text and builds no code', async () => {
    h.buildUnsigned.mockResolvedValue({ status: 'refused', reason: 'The amount is more than this account can spend.' })
    mount()
    await click(btn(/This device is online/))
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'rX' } })
    fireEvent.change(screen.getByLabelText('Amount (XRP)'), { target: { value: '1' } })
    await click(btn('Build the transaction'))
    expect(screen.getByText(/more than this account can spend/)).toBeTruthy()
    expect(screen.queryByTestId('qr')).toBeNull()
  })

  it('reports an expired return as expired, and offers a new build', async () => {
    h.buildUnsigned.mockResolvedValue({ status: 'built', text: 'xrplbench:1:u:AAA', tx: {}, lastLedgerSequence: 1075 })
    h.submitReturned.mockResolvedValue({ status: 'expired', reason: 'This transaction expired before it validated.' })
    mount()
    await click(btn(/This device is online/))
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'rX' } })
    fireEvent.change(screen.getByLabelText('Amount (XRP)'), { target: { value: '1' } })
    await click(btn('Build the transaction'))
    fireEvent.change(screen.getByLabelText(/Or paste the text of the signed transaction/), { target: { value: 'xrplbench:1:s:AAAA' } })
    await click(btn('Use the pasted text'))
    await waitFor(() => expect(screen.getByText(/expired before it validated/)).toBeTruthy())
    expect(h.submitReturned).toHaveBeenCalledTimes(1)
    expect(btn('Build another')).toBeTruthy()
  })
})

describe('TwoDeviceSign, busy lock', () => {
  it('cannot be left while a return is being submitted, submits once, and can be left after', async () => {
    h.buildUnsigned.mockResolvedValue({ status: 'built', text: 'xrplbench:1:u:AAA', tx: {}, lastLedgerSequence: 1075 })
    let finish: (v: unknown) => void = () => {}
    h.submitReturned.mockReturnValue(new Promise((res) => (finish = res)))
    mount()
    await click(btn(/This device is online/))
    fireEvent.change(screen.getByLabelText('Destination'), { target: { value: 'rX' } })
    fireEvent.change(screen.getByLabelText('Amount (XRP)'), { target: { value: '1' } })
    await click(btn('Build the transaction'))
    fireEvent.change(screen.getByLabelText(/Or paste the text of the signed transaction/), { target: { value: 'xrplbench:1:s:AAAA' } })
    await click(btn('Use the pasted text'))
    await click(btn('Use the pasted text'))
    expect(h.submitReturned).toHaveBeenCalledTimes(1)
    // The screen cannot be left while the return is submitted: Back is disabled.
    expect((btn('Settings') as HTMLButtonElement).disabled).toBe(true)
    await click(btn('Settings'))
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText(/Checking and sending/)).toBeTruthy()
    await act(async () => finish({ status: 'expired', reason: 'This transaction expired before it validated.' }))
    await waitFor(() => expect(screen.getByText(/expired before it validated/)).toBeTruthy())
    expect((btn('Settings') as HTMLButtonElement).disabled).toBe(false)
    await click(btn('Settings'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('TwoDeviceSign, online side: requests and results', () => {
  const open = async () => {
    mount()
    await click(btn(/This device is online/))
  }
  const builtOk = { status: 'built', text: 'xrplbench:1:u:AAA', tx: {}, lastLedgerSequence: 1075 }
  const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

  it('builds a Set Regular Key request', async () => {
    h.buildUnsigned.mockResolvedValue(builtOk)
    await open()
    await click(btn('Set Regular Key'))
    fill('Regular Key address', ' rKey ')
    await click(btn('Build the transaction'))
    expect(h.buildUnsigned).toHaveBeenCalledWith('w', { kind: 'regular-key', regularKey: 'rKey' }, expect.anything())
  })

  it('will not offer the master key off while no wallet here signs as the Regular Key, and says why', async () => {
    useAppStore.setState({ wallets: [WALLET] } as never)
    h.account = { isError: false, data: state({ regularKey: 'rK', disableMasterKey: false }) }
    await open()
    await click(btn('Master key'))
    expect(btn('Build the transaction').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getAllByText(/No wallet on this device signs as this account’s Regular Key/).length).toBeGreaterThan(0)
    await click(btn('Build the transaction'))
    expect(h.buildUnsigned).not.toHaveBeenCalled()
  })

  it('builds the master key off and on requests', async () => {
    useAppStore.setState({ wallets: [WALLET, { ...(WALLET as object), id: 'rk', keyAddress: 'rK' }] } as never)
    h.buildUnsigned.mockResolvedValue(builtOk)
    h.account = { isError: false, data: state({ regularKey: 'rK', disableMasterKey: false }) }
    await open()
    await click(btn('Master key'))
    await click(btn('Build the transaction'))
    expect(h.buildUnsigned).toHaveBeenLastCalledWith('w', { kind: 'master-key', enable: false }, expect.anything())
    cleanup()
    h.account = { isError: false, data: state({ regularKey: 'rK', disableMasterKey: true }) }
    await open()
    await click(btn('Master key'))
    await click(btn('Turn the master key on'))
    await click(btn('Build the transaction'))
    expect(h.buildUnsigned).toHaveBeenLastCalledWith('w', { kind: 'master-key', enable: true }, expect.anything())
  })

  it('passes a destination tag as a number', async () => {
    h.buildUnsigned.mockResolvedValue(builtOk)
    await open()
    fill('Destination', 'rX')
    fill('Amount (XRP)', '1')
    fill('Destination tag (optional)', '77')
    await click(btn('Build the transaction'))
    expect(h.buildUnsigned).toHaveBeenCalledWith('w', { kind: 'payment', destination: 'rX', amountDrops: '1000000', destinationTag: 77 }, expect.anything())
  })

  it('says what is wrong with a bad amount or tag and builds nothing', async () => {
    await open()
    fill('Destination', 'rX')
    fill('Amount (XRP)', 'abc')
    await click(btn('Build the transaction'))
    expect(screen.getByText('Enter the amount as a number of XRP.')).toBeTruthy()
    fill('Amount (XRP)', '1')
    fill('Destination tag (optional)', '1x')
    await click(btn('Build the transaction'))
    expect(screen.getByText('The destination tag must be a whole number.')).toBeTruthy()
    expect(h.buildUnsigned).not.toHaveBeenCalled()
  })

  it('after an unconfirmed result, hides the scanner and the old code, says to check history, and offers a new build', async () => {
    h.buildUnsigned.mockResolvedValue(builtOk)
    h.submitReturned.mockResolvedValue({ status: 'unconfirmed', reason: 'The transaction may have been sent. Check the account’s history before building another.' })
    await open()
    fill('Destination', 'rX')
    fill('Amount (XRP)', '1')
    await click(btn('Build the transaction'))
    fireEvent.change(screen.getByLabelText(/Or paste the text of the signed transaction/), { target: { value: 'xrplbench:1:s:AAAA' } })
    await click(btn('Use the pasted text'))
    await waitFor(() => expect(screen.getByText(/history before building another/)).toBeTruthy())
    expect(screen.queryByLabelText(/Or paste the text/)).toBeNull()
    expect(screen.queryByTestId('qr')).toBeNull()
    expect(btn('Build another')).toBeTruthy()
  })
})

describe('TwoDeviceSign, offline side', () => {
  const unsigned = (extra: Record<string, unknown> = {}, network: 'testnet' | 'mainnet' = 'testnet') => {
    const e = encodeUnsigned({
      network,
      tx: { TransactionType: 'Payment', Account: (WALLET as { address: string }).address, Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', Amount: '2500000', Sequence: 4, Fee: '12', LastLedgerSequence: 1075, Flags: 0, ...extra },
    })
    return e.ok ? e.text : ''
  }
  const paste = async (text: string) => {
    await click(btn(/This device is offline/))
    fireEvent.change(screen.getByLabelText(/Or paste the text of the transaction to sign/), { target: { value: text } })
    await click(btn('Use the pasted text'))
  }

  it('shows the decoded fields and the expiry words before any Signing Check, and signs only after the confirm', async () => {
    h.signUnsigned.mockResolvedValue({ status: 'signed', text: 'xrplbench:1:s:BBB' })
    mount()
    await paste(unsigned())
    expect(screen.getByText('2.5 XRP')).toBeTruthy()
    expect(screen.getByText('1075')).toBeTruthy()
    expect(screen.getByText(/cannot check it against the ledger/)).toBeTruthy()
    expect(screen.getByText(/real limit/)).toBeTruthy()
    expect(h.signUnsigned).not.toHaveBeenCalled()
    await click(btn('Confirm and sign'))
    expect(h.signUnsigned).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('qr').textContent).toBe('xrplbench:1:s:BBB')
  })

  it('says real funds on Mainnet', async () => {
    mount({ ...(WALLET as object), network: 'mainnet' })
    await paste(unsigned({}, 'mainnet'))
    expect(screen.getAllByText(/real funds/).length).toBeGreaterThan(0)
  })

  it('refuses a wrong Account in words, with no confirm to press', async () => {
    mount()
    await paste(unsigned({ Account: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' }))
    expect(screen.getByText(/different account/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirm and sign' })).toBeNull()
    expect(h.signUnsigned).not.toHaveBeenCalled()
  })

  it('says a cancelled check signed nothing', async () => {
    h.signUnsigned.mockResolvedValue({ status: 'cancelled', reason: 'Cancelled. Nothing was signed.' })
    mount()
    await paste(unsigned())
    await click(btn('Confirm and sign'))
    expect(screen.getByText('Cancelled. Nothing was signed.')).toBeTruthy()
  })
})

describe('TwoDeviceSign, the Settings row', () => {
  it('opens the screen by navigating to its path, and carries nothing but the Wallet id', async () => {
    window.history.replaceState(null, '', '/')
    render(<TwoDeviceSign wallet={WALLET} />)
    await click(btn('Sign with two devices'))
    expect(window.location.pathname).toBe('/wallets/w/two-device')
    expect(window.history.state).toEqual({ screen: true, depth: 1 })
  })

  it('wraps the two role buttons instead of letting them run sideways', async () => {
    mount()
    for (const b of [btn(/This device is online/), btn(/This device is offline/)]) {
      expect(b.className).toContain('whitespace-normal')
      expect(b.className).toContain('h-auto')
    }
  })
})
