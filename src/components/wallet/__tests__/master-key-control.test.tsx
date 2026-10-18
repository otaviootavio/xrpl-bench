/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/** Story 10: the control only RENDERS what `lib/master-key.ts` decides; the flow is stubbed at its edge. */
const h = vi.hoisted(() => ({
  account: { isError: false, data: undefined as unknown },
  setMasterKey: vi.fn(),
  refetch: vi.fn(),
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/hooks/useAccountState', () => ({ useAccountState: () => h.account }))
vi.mock('@/hooks/usePrompts', () => ({
  usePrompts: () => ({ pin: async () => null }),
  useYieldingPrompts: () => ({ prompts: { pin: async () => null }, promptOpen: false }),
}))
vi.mock('@/store/app-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/app-store')>()
  return { ...actual, useWalletOpenKey: () => null }
})
vi.mock('@/lib/master-key', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/master-key')>()
  return { ...actual, setMasterKey: (...a: unknown[]) => h.setMasterKey(...a) }
})

import { MasterKeyControl } from '../MasterKeyControl'
import { useAppStore } from '@/store/app-store'

const base = { seedId: 's', lockId: 'l', createdAt: 1, network: 'testnet', algorithm: 'ed25519', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard' } as const
const MASTER = { ...base, id: 'm', label: 'Vault', address: 'rAcct', keyAddress: 'rAcct' } as never
const REGULAR = { ...base, id: 'r', label: 'Phone', address: 'rAcct', keyAddress: 'rKey' } as never
const MAINNET_MASTER = { ...base, id: 'mm', label: 'Vault', network: 'mainnet', address: 'rAcct', keyAddress: 'rAcct' } as never
const state = (extra: Record<string, unknown> = {}) => ({
  exists: true, address: 'rAcct', balanceDrops: '1', ownerCount: 0, sequence: 1, requireDestTag: false, disableMasterKey: false, ...extra,
})

const click = async (el: HTMLElement) => act(async () => void fireEvent.click(el))
const mount = (w: unknown) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MasterKeyControl wallet={w as never} />
    </QueryClientProvider>,
  )
const action = (name: RegExp | string) => screen.getByRole('button', { name })

beforeEach(() => {
  // The wallet that signs as the Regular Key `rKey` is on this device, as turning off requires.
  useAppStore.setState({ wallets: [MASTER, REGULAR, MAINNET_MASTER, { ...(REGULAR as object), id: 'rm', network: 'mainnet' }] } as never)
  h.account = { isError: false, data: state({ regularKey: 'rKey' }), refetch: h.refetch } as never
  h.setMasterKey.mockReset()
  h.refetch.mockReset()
})
afterEach(cleanup)

describe('MasterKeyControl', () => {
  it('is aria-disabled with the reason when no wallet here signs as the Regular Key', () => {
    useAppStore.setState({ wallets: [MASTER] } as never)
    mount(MASTER)
    expect(action('Turn master key off').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/No wallet on this device signs as this account’s Regular Key/)).toBeTruthy()
  })

  it('says unknown, aria-disabled with the reason as text, on an errored read; a click signs nothing', async () => {
    h.account = { isError: true, data: state({ regularKey: 'rKey' }) }
    mount(MASTER)
    expect(screen.getByText(/^Master key: unknown/)).toBeTruthy()
    expect(screen.queryByText(/^Master key: on/)).toBeNull()
    expect(action('Turn master key off').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/cannot tell whether the master key is on/)).toBeTruthy()
    await click(action('Turn master key off'))
    expect(screen.queryByText(/Turn the master key off\?/)).toBeNull()
    expect(h.setMasterKey).not.toHaveBeenCalled()
  })

  it('is aria-disabled with no Regular Key', () => {
    h.account = { isError: false, data: state() }
    mount(MASTER)
    expect(action('Turn master key off').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/no Regular Key yet/)).toBeTruthy()
  })

  it('is aria-disabled for the Regular Key wallet while the master key is on', () => {
    mount(REGULAR)
    expect(action('Turn master key on').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/already on/)).toBeTruthy()
  })

  it('is aria-disabled for the master wallet while the master key is off, pointing to the Regular Key wallet', () => {
    h.account = { isError: false, data: state({ regularKey: 'rKey', disableMasterKey: true }) }
    mount(MASTER)
    expect(screen.getByText(/^Master key: off/)).toBeTruthy()
    expect(action('Turn master key off').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/already off/)).toBeTruthy()
  })

  it('states the exact consequence, naming the Regular Key, before anything is signed; cancel sends nothing', async () => {
    mount(MAINNET_MASTER)
    expect(action('Turn master key off').getAttribute('aria-disabled')).toBeNull()
    await click(action('Turn master key off'))
    expect(screen.getByText(/can no longer sign for this account/)).toBeTruthy()
    expect(screen.getByText('rKey')).toBeTruthy()
    expect(screen.getByText(/you lose the funds/)).toBeTruthy()
    expect(screen.getByText(/real funds/)).toBeTruthy()
    expect(h.setMasterKey).not.toHaveBeenCalled()
    await click(screen.getByRole('button', { name: 'Cancel' }))
    expect(h.setMasterKey).not.toHaveBeenCalled()
  })

  it('Mainnet holds the confirm key until the phrase is typed, then commits with confirmed: true', async () => {
    h.setMasterKey.mockResolvedValue({ status: 'validated', state: 'off' })
    mount(MAINNET_MASTER)
    await click(action('Turn master key off'))
    const confirmKey = () => screen.getAllByRole('button', { name: 'Turn master key off' }).at(-1)!
    expect(confirmKey().getAttribute('aria-disabled')).toBe('true')
    await click(confirmKey())
    expect(h.setMasterKey).not.toHaveBeenCalled()
    const field = screen.getByLabelText(/Type “turn off”/)
    fireEvent.change(field, { target: { value: 'turn' } })
    expect(confirmKey().getAttribute('aria-disabled')).toBe('true')
    await click(confirmKey())
    expect(h.setMasterKey).not.toHaveBeenCalled()
    fireEvent.change(field, { target: { value: 'turn off now' } })
    expect(confirmKey().getAttribute('aria-disabled')).toBe('true')
    fireEvent.change(field, { target: { value: '  Turn   OFF ' } })
    expect(confirmKey().getAttribute('aria-disabled')).toBeNull()
    await click(confirmKey())
    await waitFor(() => expect(h.setMasterKey).toHaveBeenCalledTimes(1))
    expect(h.setMasterKey.mock.calls[0][2]).toMatchObject({ confirmed: true })
  })

  it('Mainnet turn-on is unchanged: no plate, no phrase field, confirm enabled, commits with confirmed: true', async () => {
    h.account = { isError: false, data: state({ regularKey: 'rKey', disableMasterKey: true }) }
    h.setMasterKey.mockResolvedValue({ status: 'validated', state: 'on' })
    mount({ ...(REGULAR as object), id: 'rm', network: 'mainnet' })
    await click(action('Turn master key on'))
    expect(screen.queryByLabelText(/Type “turn off”/)).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    const confirmKey = screen.getAllByRole('button', { name: 'Turn master key on' }).at(-1)!
    expect(confirmKey.getAttribute('aria-disabled')).toBeNull()
    await click(confirmKey)
    await waitFor(() => expect(h.setMasterKey).toHaveBeenCalledWith('rm', true, expect.objectContaining({ confirmed: true })))
  })

  it('Mainnet clears the phrase when the sheet reopens', async () => {
    mount(MAINNET_MASTER)
    await click(action('Turn master key off'))
    fireEvent.change(screen.getByLabelText(/Type “turn off”/), { target: { value: 'turn off' } })
    await click(screen.getByRole('button', { name: 'Cancel' }))
    await click(action('Turn master key off'))
    expect((screen.getByLabelText(/Type “turn off”/) as HTMLInputElement).value).toBe('')
    expect(screen.getAllByRole('button', { name: 'Turn master key off' }).at(-1)!.getAttribute('aria-disabled')).toBe('true')
  })

  it('Testnet has no phrase field and the confirm key is enabled at once; the alert plate shows the address', async () => {
    mount(MASTER)
    await click(action('Turn master key off'))
    expect(screen.queryByLabelText(/Type “turn off”/)).toBeNull()
    expect(screen.getByRole('alert').textContent).toContain('rKey')
    expect(screen.getAllByRole('button', { name: 'Turn master key off' }).at(-1)!.getAttribute('aria-disabled')).toBeNull()
  })

  it('turns it off with confirmed: true and reports the re-read state', async () => {
    h.setMasterKey.mockResolvedValue({ status: 'validated', state: 'off' })
    mount(MASTER)
    await click(action('Turn master key off'))
    await click(screen.getAllByRole('button', { name: 'Turn master key off' }).at(-1)!)
    await waitFor(() => expect(h.setMasterKey).toHaveBeenCalledTimes(1))
    expect(h.setMasterKey.mock.calls[0][0]).toBe('m')
    expect(h.setMasterKey.mock.calls[0][1]).toBe(false)
    expect(h.setMasterKey.mock.calls[0][2]).toMatchObject({ confirmed: true })
    expect(await screen.findByText(/shows the master key as off/)).toBeTruthy()
  })

  it('shows the reason and closes the confirm when the flow throws before anything is sent', async () => {
    h.setMasterKey.mockRejectedValue(new Error('The vault could not be read.'))
    mount(MASTER)
    await click(action('Turn master key off'))
    await click(screen.getAllByRole('button', { name: 'Turn master key off' }).at(-1)!)
    expect(await screen.findByText(/The vault could not be read\./)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Turn master key off' })).toHaveLength(1)
  })

  it('turns it on from the Regular Key wallet, and says the Regular Key signs', async () => {
    h.account = { isError: false, data: state({ regularKey: 'rKey', disableMasterKey: true }) }
    h.setMasterKey.mockResolvedValue({ status: 'unconfirmed', reason: 'Submitted, could not confirm.' })
    mount(REGULAR)
    await click(action('Turn master key on'))
    expect(screen.getByText(/signed by the Regular Key/)).toBeTruthy()
    await click(screen.getAllByRole('button', { name: 'Turn master key on' }).at(-1)!)
    await waitFor(() => expect(h.setMasterKey).toHaveBeenCalledWith('r', true, expect.objectContaining({ confirmed: true })))
    expect(await screen.findByText('Submitted, could not confirm.')).toBeTruthy()
    expect(screen.getByText(/^Master key: unknown/)).toBeTruthy()
  })

  it('recovers from an unconfirmed result only when "Check again" re-reads successfully', async () => {
    h.account = { isError: false, data: state({ regularKey: 'rKey' }), refetch: h.refetch } as never
    h.setMasterKey.mockResolvedValue({ status: 'unconfirmed', reason: 'Submitted, could not confirm.' })
    mount(MASTER)
    await click(action('Turn master key off'))
    await click(screen.getAllByRole('button', { name: 'Turn master key off' }).at(-1)!)
    await screen.findByText(/^Master key: unknown/)
    expect(action('Turn master key off').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/cannot tell whether the master key is on/)).toBeTruthy()

    h.refetch.mockResolvedValueOnce({ isError: true, data: undefined })
    await click(action('Check again'))
    expect(screen.getByText(/^Master key: unknown/)).toBeTruthy()

    h.refetch.mockResolvedValueOnce({ isError: false, data: state({ regularKey: 'rKey', disableMasterKey: true }) })
    await click(action('Check again'))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Check again' })).toBeNull())
    expect(screen.queryByText('Submitted, could not confirm.')).toBeNull()
  })
})
