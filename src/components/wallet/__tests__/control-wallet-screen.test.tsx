/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Story 9: the screen and the note only RENDER what `lib/control.ts` decides.
 * The flow is stubbed at its edge; the status and blocked-reason functions are real.
 */
const h = vi.hoisted(() => ({
  account: { isError: false, data: undefined as unknown },
  setRegularKey: vi.fn(),
  confirmControl: vi.fn(),
}))

vi.mock('@/hooks/useAccountState', () => ({ useAccountState: () => h.account }))
vi.mock('@/hooks/usePrompts', () => ({ usePrompts: () => ({ pin: async () => null }) }))
vi.mock('@/store/app-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/app-store')>()
  return { ...actual, useWalletOpenKey: () => null }
})
vi.mock('@/lib/control', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/control')>()
  return { ...actual, setRegularKey: (...a: unknown[]) => h.setRegularKey(...a), confirmControl: (...a: unknown[]) => h.confirmControl(...a) }
})

import { ControlWalletScreen } from '../ControlWalletScreen'
import { ControlledNote } from '../ControlledNote'

const base = { seedId: 's', lockId: 'l', createdAt: 1, network: 'testnet', algorithm: 'ed25519', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard' } as const
const CONTROLLER = { ...base, id: 'c', seedId: 'sc', label: 'Vault', address: 'rAcct', keyAddress: 'rAcct' } as never
const TARGET = { ...base, id: 't', seedId: 'st', label: 'Phone', address: 'rKey', keyAddress: 'rKey' }
const PASSKEY_TARGET = { ...TARGET, id: 'p', seedId: 'sp', label: 'Passkey wallet', address: 'rPk', keyAddress: 'rPk', seedMethod: 'passkey-derived', signingCheck: 'passkey' }
const state = (extra: Record<string, unknown> = {}) => ({
  exists: true, address: 'rAcct', balanceDrops: '1', ownerCount: 0, sequence: 1, requireDestTag: false, disableMasterKey: false, ...extra,
})

const click = async (el: HTMLElement) => act(async () => void fireEvent.click(el))
const setButton = () => screen.getByRole('button', { name: /Set Regular Key|Replace Regular Key|Working/ })

function mount(wallets: unknown[] = [CONTROLLER, TARGET]) {
  const onClose = vi.fn()
  const onControlled = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ControlWalletScreen controller={CONTROLLER} wallets={wallets as never} onClose={onClose} onControlled={onControlled} />
    </QueryClientProvider>,
  )
  return { onClose, onControlled }
}

beforeEach(() => {
  h.account = { isError: false, data: state() }
  h.setRegularKey.mockReset()
  h.confirmControl.mockReset()
})
afterEach(cleanup)

describe('Control screen', () => {
  it('is aria-disabled with the reason in words on an errored read, and a click signs nothing', async () => {
    h.account = { isError: true, data: undefined }
    mount()
    fireEvent.change(screen.getByLabelText('Wallet that will sign'), { target: { value: 't' } })
    expect(setButton().getAttribute('aria-disabled')).toBe('true')
    expect(screen.getAllByText(/could not be read/).length).toBeGreaterThan(0)
    await click(setButton())
    expect(h.setRegularKey).not.toHaveBeenCalled()
  })

  it('is aria-disabled when the master key is off', async () => {
    h.account = { isError: false, data: state({ disableMasterKey: true }) }
    mount()
    fireEvent.change(screen.getByLabelText('Wallet that will sign'), { target: { value: 't' } })
    expect(setButton().getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/master key turned off/)).toBeTruthy()
  })

  it('says unknown, not "not controlled", until a wallet is chosen', () => {
    mount()
    expect(screen.getByText(/Unknown: choose a wallet/)).toBeTruthy()
    expect(screen.queryByText(/Not controlled/)).toBeNull()
  })

  it('states the takeover warning, and the passkey extra-key sentence for a passkey target', async () => {
    mount([CONTROLLER, PASSKEY_TARGET])
    expect(screen.getByText(/Whoever holds this phone can take over the account/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Wallet that will sign'), { target: { value: 'p' } })
    expect(screen.getByText(/The passkey becomes an extra key for this account\. The master key keeps working\./)).toBeTruthy()
  })

  it('asks before replacing, naming the old key, and "Keep it" resolves false', async () => {
    h.account = { isError: false, data: state({ regularKey: 'rOld' }) }
    let answered: boolean | null = null
    h.setRegularKey.mockImplementation(async (_c: string, _t: string, ctx: { confirmReplace: (k: string) => Promise<boolean> }) => {
      answered = await ctx.confirmReplace('rOld')
      return { status: 'cancelled', reason: 'Cancelled. Nothing was signed.' }
    })
    mount()
    fireEvent.change(screen.getByLabelText('Wallet that will sign'), { target: { value: 't' } })
    await click(screen.getByRole('button', { name: 'Replace Regular Key' }))
    expect(await screen.findByText(/that key will stop working/)).toBeTruthy()
    expect(screen.getByText('rOld')).toBeTruthy()
    await click(screen.getByRole('button', { name: 'Keep it' }))
    await waitFor(() => expect(answered).toBe(false))
    expect(await screen.findByText('Cancelled. Nothing was signed.')).toBeTruthy()
  })

  it('offers "Check again" only after an unconfirmed result, and it runs only the claim', async () => {
    h.setRegularKey.mockResolvedValue({ status: 'unconfirmed', reason: 'Could not confirm. Check again.' })
    h.confirmControl.mockResolvedValue({ status: 'controlled', meta: TARGET, sent: false })
    const { onControlled } = mount()
    fireEvent.change(screen.getByLabelText('Wallet that will sign'), { target: { value: 't' } })
    expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull()
    await click(setButton())
    await click(await screen.findByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(onControlled).toHaveBeenCalledWith(TARGET))
    expect(h.setRegularKey).toHaveBeenCalledTimes(1)
    expect(h.confirmControl).toHaveBeenCalledTimes(1)
  })
})

describe('Control screen: the result names the Wallet that now operates the Account', () => {
  it('says "Phone now operates this account" even though Phone has left the eligible list by then', async () => {
    h.setRegularKey.mockResolvedValue({ status: 'controlled', meta: TARGET, sent: true })
    mount()
    fireEvent.change(screen.getByLabelText('Wallet that will sign'), { target: { value: 't' } })
    await click(setButton())
    expect(await screen.findByText(/Done\. Phone now operates this account\./)).toBeTruthy()
  })
})

describe('Control screen: the list cannot refresh after a validated change', () => {
  it('says it is done on the ledger and offers Check again, with no unhandled rejection', async () => {
    h.setRegularKey.mockResolvedValue({ status: 'controlled', meta: TARGET, sent: true })
    h.confirmControl.mockResolvedValue({ status: 'controlled', meta: TARGET, sent: false })
    const { onControlled } = mount()
    onControlled.mockRejectedValueOnce(new Error('idb down'))
    fireEvent.change(screen.getByLabelText('Wallet that will sign'), { target: { value: 't' } })
    await click(setButton())
    expect(await screen.findByText(/done on the ledger, but this screen could not refresh/)).toBeTruthy()
    // Check again claims once more and, this time, the refresh works.
    await click(await screen.findByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(onControlled).toHaveBeenCalledTimes(2))
    expect(h.setRegularKey).toHaveBeenCalledTimes(1)
  })
})

describe('ControlledNote', () => {
  const controlled = { ...TARGET, address: 'rAcct' } as never
  const mountNote = (w: unknown) => render(<ControlledNote wallet={w as never} />)

  it('renders nothing for a Wallet on its own Account', () => {
    mountNote(TARGET)
    expect(screen.queryByTestId('controlled-note')).toBeNull()
  })

  it('says controlled only when the ledger shows the key as the Regular Key', () => {
    h.account = { isError: false, data: state({ regularKey: 'rKey' }) }
    mountNote(controlled)
    expect(screen.getByText(/^Controlled:/)).toBeTruthy()
  })

  it('says not controlled when the ledger shows a different key', () => {
    h.account = { isError: false, data: state({ regularKey: 'rOther' }) }
    mountNote(controlled)
    expect(screen.getByText(/^Not controlled:/)).toBeTruthy()
  })

  it('never renders a failed read as current: unknown, even with data cached', () => {
    h.account = { isError: true, data: state({ regularKey: 'rKey' }) }
    mountNote(controlled)
    expect(screen.getByText(/^Unknown:/)).toBeTruthy()
    expect(screen.queryByText(/^Controlled:/)).toBeNull()
  })
})
