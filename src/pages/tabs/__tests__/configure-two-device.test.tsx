/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The Configure counterpart of the Settings row of `two-device-sign.test.tsx`, and the Node
 * and Let another wallet sign launches (test design R12): the Two-device signing plate opens
 * the shipped screen with the label `Back to Configure`, Back returns to Configure with
 * focus on the opener. The Settings tab no longer launches any of them (Story 17).
 */
import { encodeUnsigned } from '@/lib/qr-codec'

const h = vi.hoisted(() => ({
  account: { isError: false, data: undefined as unknown },
  buildUnsigned: vi.fn(),
  signUnsigned: vi.fn(),
  submitReturned: vi.fn(),
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
  getLockInfo: async (id: string) => ({ id, openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }),
}))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: async () => {}, retireNode: () => {}, verifyNode: async () => ({ ok: true }) }))
vi.mock('@/lib/xrpl/query-reads', () => ({ fetchAccountStateOnce: async () => null }))
vi.mock('@/hooks/useAccountState', () => ({ useAccountState: () => h.account }))
vi.mock('@/components/wallet/QrCode', () => ({ QrCode: ({ text }: { text: string }) => <div data-testid="qr">{text}</div> }))
vi.mock('@/lib/two-device', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/two-device')>()
  return {
    ...actual,
    buildUnsigned: (...a: unknown[]) => h.buildUnsigned(...a),
    signUnsigned: (...a: unknown[]) => h.signUnsigned(...a),
    submitReturned: (...a: unknown[]) => h.submitReturned(...a),
  }
})
vi.mock('@/hooks/useAppUpdate', () => ({
  useAppUpdate: () => ({
    updateReady: false, applying: false, applyUpdate: () => {}, checking: false, checkError: null,
    checkForUpdate: () => {}, pendingRelease: null, blockedReason: null, declined: false, declineCurrent: () => {},
  }),
}))
vi.mock('@/lib/build-info', () => ({ BUILD: { version: '0.0.0', commitSha: 'x', builtAt: '' }, shortSha: 'x', sourceUrl: 'https://example.invalid', formatBuiltAt: () => '' }))
vi.mock('@/components/wallet/RevealSeedControl', () => ({ RevealSeedControl: () => <button>Reveal seed</button> }))

import { WalletScreens } from '../../WalletScreens'
import { ConfigureScreen } from '@/components/wallet/ConfigureScreen'
import { useRoute } from '@/hooks/useRoute'
import { isTaskRoute, navigate } from '@/lib/route'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PromptsContext } from '@/hooks/usePrompts'
import { useAppStore } from '@/store/app-store'

const A = {
  id: 'a', seedId: 'a', lockId: 'X', label: 'Alpha', address: 'rAlphaAddr', keyAddress: 'rAlphaAddr',
  createdAt: 1, algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard', network: 'testnet',
}
const OPEN = { key: {} as CryptoKey, autoLockMinutes: 5 }

function Host() {
  const route = useRoute()
  if (isTaskRoute(route)) return <WalletScreens route={route} />
  return <ConfigureScreen wallet={useAppStore.getState().wallets[0] as never} />
}
function renderAt(_at: 'configure') {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PromptsContext.Provider value={{ pin: async () => '123456' }}>
        <TooltipProvider>
          <Host />
        </TooltipProvider>
      </PromptsContext.Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  h.account = { isError: false, data: undefined }
  h.buildUnsigned.mockReset()
  h.signUnsigned.mockReset()
  h.submitReturned.mockReset()
  useAppStore.setState({ wallets: [A], activeWalletId: 'a', openLocks: { X: OPEN } } as never)
})
afterEach(cleanup)

describe('Configure: Node and Two-device signing plates', () => {
  it('mounts the shipped Node section and the two-device entry, each in its own plate', () => {
    renderAt('configure')
    const node = screen.getByRole('region', { name: 'Node' })
    // The section itself, not just the plate's heading: its custom-Node field.
    expect(within(node).getByLabelText(/Custom Node/i)).toBeTruthy()
    const plate = screen.getByRole('region', { name: 'Two-device signing' })
    expect(plate.querySelector('[data-testid="two-device-sign"]')).toBeTruthy()
  })

  it('Sign with two devices opens its screen with `Back to Configure`; Back returns with focus on the key', async () => {
    navigate('/wallets/a/configure')
    renderAt('configure')
    fireEvent.click(screen.getByRole('button', { name: 'Sign with two devices' }))
    expect(window.location.pathname).toBe('/wallets/a/two-device')
    const back = await screen.findByRole('button', { name: /Back to Configure/ })
    expect(back.textContent).toBe('Back to Configure')
    fireEvent.click(back)
    await waitFor(() => expect(window.location.pathname).toBe('/wallets/a/configure'))
    const key = await screen.findByRole('button', { name: 'Sign with two devices' })
    await waitFor(() => expect(document.activeElement).toBe(key))
  })

  it('Let another wallet sign opens the control screen with `Back to Configure` and focus returns to its key', async () => {
    navigate('/wallets/a/configure')
    renderAt('configure')
    fireEvent.click(screen.getByRole('button', { name: 'Let another wallet sign' }))
    expect(window.location.pathname).toBe('/wallets/a/control')
    fireEvent.click(await screen.findByRole('button', { name: /Back to Configure/ }))
    await waitFor(() => expect(window.location.pathname).toBe('/wallets/a/configure'))
    const key = await screen.findByRole('button', { name: 'Let another wallet sign' })
    await waitFor(() => expect(document.activeElement).toBe(key))
  })
})

/**
 * Story 17 (R12): the build / offline / busy-lock flows of `two-device-sign.test.tsx`, which
 * the Settings row used to be the only full-screen way into, driven through the Configure plate:
 * every screen here is the one the Two-device signing plate opened, labelled `Back to Configure`.
 */
describe('Configure: Two-device signing flows through the plate', () => {
  const VALID = 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL'
  const state = (extra: Record<string, unknown> = {}) => ({
    exists: true, address: 'rA', balanceDrops: '50000000', ownerCount: 0, sequence: 1, requireDestTag: false, disableMasterKey: false, ...extra,
  })
  const click = async (el: HTMLElement) => act(async () => void fireEvent.click(el))
  const btn = (name: RegExp | string) => screen.getByRole('button', { name })
  const fill = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
  const builtOk = { status: 'built', text: 'xrplbench:1:u:AAA', tx: {}, lastLedgerSequence: 1075 }

  async function openScreen(wallet: Record<string, unknown> = A) {
    useAppStore.setState({ wallets: [wallet] } as never)
    navigate('/wallets/a/configure')
    renderAt('configure')
    fireEvent.click(screen.getByRole('button', { name: 'Sign with two devices' }))
    await screen.findByRole('button', { name: 'Back to Configure' })
  }
  async function buildOnline() {
    h.buildUnsigned.mockResolvedValue(builtOk)
    await click(btn(/This device is online/))
    fill('Destination', 'rX')
    fill('Amount (XRP)', '1')
    await click(btn('Build the transaction'))
  }

  it('an errored read is aria-disabled with the reason as text, and a click builds nothing', async () => {
    h.account = { isError: true, data: state() }
    await openScreen()
    await click(btn(/This device is online/))
    expect(btn('Build the transaction').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/ledger could not be read/)).toBeTruthy()
    await click(btn('Build the transaction'))
    expect(h.buildUnsigned).not.toHaveBeenCalled()
  })

  it('builds a payment: the window with its figure beside the code, copy and the paste field', async () => {
    h.account = { isError: false, data: state() }
    await openScreen()
    h.buildUnsigned.mockResolvedValue(builtOk)
    await click(btn(/This device is online/))
    fill('Destination', 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe')
    fill('Amount (XRP)', '1.5')
    await click(btn('Build the transaction'))
    expect(h.buildUnsigned).toHaveBeenCalledWith('a', expect.objectContaining({ kind: 'payment', amountDrops: '1500000' }), expect.anything())
    expect(screen.getByText(/roughly four to six minutes/)).toBeTruthy()
    expect(screen.getByText(/not a promised time/)).toBeTruthy()
    expect(screen.getByText('1075')).toBeTruthy()
    expect(screen.getByTestId('qr').textContent).toBe('xrplbench:1:u:AAA')
    expect(screen.getByLabelText(/Or paste the text of the signed transaction/)).toBeTruthy()
  })

  it('a refusal is shown as text and builds no code', async () => {
    h.account = { isError: false, data: state() }
    await openScreen()
    h.buildUnsigned.mockResolvedValue({ status: 'refused', reason: 'The amount is more than this account can spend.' })
    await click(btn(/This device is online/))
    fill('Destination', 'rX')
    fill('Amount (XRP)', '1')
    await click(btn('Build the transaction'))
    expect(screen.getByText(/more than this account can spend/)).toBeTruthy()
    expect(screen.queryByTestId('qr')).toBeNull()
  })

  it('an expired return says so and offers a new build', async () => {
    h.account = { isError: false, data: state() }
    await openScreen()
    h.submitReturned.mockResolvedValue({ status: 'expired', reason: 'This transaction expired before it validated.' })
    await buildOnline()
    fill(/Or paste the text of the signed transaction/, 'xrplbench:1:s:AAAA')
    await click(btn('Use the pasted text'))
    await waitFor(() => expect(screen.getByText(/expired before it validated/)).toBeTruthy())
    expect(h.submitReturned).toHaveBeenCalledTimes(1)
    expect(btn('Build another')).toBeTruthy()
  })

  it('busy lock: Back to Configure cannot be used while a return is submitted, submits once, and works after', async () => {
    h.account = { isError: false, data: state() }
    await openScreen()
    let finish: (v: unknown) => void = () => {}
    h.submitReturned.mockReturnValue(new Promise((res) => (finish = res)))
    await buildOnline()
    fill(/Or paste the text of the signed transaction/, 'xrplbench:1:s:AAAA')
    await click(btn('Use the pasted text'))
    await click(btn('Use the pasted text'))
    expect(h.submitReturned).toHaveBeenCalledTimes(1)
    expect((btn('Back to Configure') as HTMLButtonElement).disabled).toBe(true)
    await click(btn('Back to Configure'))
    expect(window.location.pathname).toBe('/wallets/a/two-device')
    expect(screen.getByText(/Checking and sending/)).toBeTruthy()
    await act(async () => finish({ status: 'expired', reason: 'This transaction expired before it validated.' }))
    await waitFor(() => expect(screen.getByText(/expired before it validated/)).toBeTruthy())
    expect((btn('Back to Configure') as HTMLButtonElement).disabled).toBe(false)
    await click(btn('Back to Configure'))
    await waitFor(() => expect(window.location.pathname).toBe('/wallets/a/configure'))
    const key = await screen.findByRole('button', { name: 'Sign with two devices' })
    await waitFor(() => expect(document.activeElement).toBe(key))
  })

  it('after an unconfirmed result the scanner and old code are gone and it says to check history', async () => {
    h.account = { isError: false, data: state() }
    await openScreen()
    h.submitReturned.mockResolvedValue({ status: 'unconfirmed', reason: 'The transaction may have been sent. Check the account’s history before building another.' })
    await buildOnline()
    fill(/Or paste the text of the signed transaction/, 'xrplbench:1:s:AAAA')
    await click(btn('Use the pasted text'))
    await waitFor(() => expect(screen.getByText(/history before building another/)).toBeTruthy())
    expect(screen.queryByLabelText(/Or paste the text/)).toBeNull()
    expect(screen.queryByTestId('qr')).toBeNull()
  })

  it('offline side: shows the decoded fields before any Signing Check and signs only after the confirm', async () => {
    const mine = { ...A, address: VALID, keyAddress: VALID }
    await openScreen(mine)
    const e = encodeUnsigned({
      network: 'testnet',
      tx: { TransactionType: 'Payment', Account: VALID, Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', Amount: '2500000', Sequence: 4, Fee: '12', LastLedgerSequence: 1075, Flags: 0 },
    })
    h.signUnsigned.mockResolvedValue({ status: 'signed', text: 'xrplbench:1:s:BBB' })
    await click(btn(/This device is offline/))
    fill(/Or paste the text of the transaction to sign/, e.ok ? e.text : '')
    await click(btn('Use the pasted text'))
    expect(screen.getByText('2.5 XRP')).toBeTruthy()
    expect(screen.getByText(/cannot check it against the ledger/)).toBeTruthy()
    expect(h.signUnsigned).not.toHaveBeenCalled()
    await click(btn('Confirm and sign'))
    expect(h.signUnsigned).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('qr').textContent).toBe('xrplbench:1:s:BBB')
  })

  it('offline side: a wrong Account is refused in words, with no confirm to press and nothing signed', async () => {
    const mine = { ...A, address: VALID, keyAddress: VALID }
    await openScreen(mine)
    const enc = (Account: string) =>
      encodeUnsigned({
        network: 'testnet',
        tx: { TransactionType: 'Payment', Account, Destination: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', Amount: '2500000', Sequence: 4, Fee: '12', LastLedgerSequence: 1075, Flags: 0 },
      })
    const wrong = enc('rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe')
    await click(btn(/This device is offline/))
    fill(/Or paste the text of the transaction to sign/, wrong.ok ? wrong.text : '')
    await click(btn('Use the pasted text'))
    expect(screen.getByText(/different account/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirm and sign' })).toBeNull()
    expect(h.signUnsigned).not.toHaveBeenCalled()
  })
})
