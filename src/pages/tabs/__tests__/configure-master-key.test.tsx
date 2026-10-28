/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The Configure counterpart of `master-key-control.test.tsx` and of the Let another wallet
 * sign key (test design R12): the Operating another account plate, driven through the
 * Configure screen. The control's behaviour is unchanged; this pins that the plate mounts it.
 */
const h = vi.hoisted(() => ({
  account: { isError: false, data: undefined as unknown },
  setMasterKey: vi.fn(),
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ getLockInfo: async () => ({ id: 'l', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }) }))
vi.mock('@/hooks/useAccountState', () => ({ useAccountState: () => h.account }))
vi.mock('@/hooks/usePrompts', () => ({
  usePrompts: () => ({ pin: async () => null }),
  useYieldingPrompts: () => ({ prompts: { pin: async () => null }, promptOpen: false }),
}))
vi.mock('@/components/wallet/RevealSeedControl', () => ({ RevealSeedControl: () => <button>Reveal seed</button> }))
vi.mock('@/store/app-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/app-store')>()
  return { ...actual, useWalletOpenKey: () => null }
})
vi.mock('@/lib/master-key', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/master-key')>()
  return { ...actual, setMasterKey: (...a: unknown[]) => h.setMasterKey(...a) }
})

import { ConfigureScreen } from '@/components/wallet/ConfigureScreen'
import { useAppStore } from '@/store/app-store'

const base = { seedId: 's', lockId: 'l', createdAt: 1, network: 'testnet', algorithm: 'ed25519', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard' } as const
const MASTER = { ...base, id: 'm', label: 'Vault', address: 'rAcct', keyAddress: 'rAcct' }
const REGULAR = { ...base, id: 'r', label: 'Phone', address: 'rAcct', keyAddress: 'rKey' }
const MAINNET_MASTER = { ...base, id: 'mm', label: 'Vault', network: 'mainnet', address: 'rAcct', keyAddress: 'rAcct' }
const state = (extra: Record<string, unknown> = {}) => ({
  exists: true, address: 'rAcct', balanceDrops: '1', ownerCount: 0, sequence: 1, requireDestTag: false, disableMasterKey: false, ...extra,
})
const click = async (el: HTMLElement) => act(async () => void fireEvent.click(el))
const mount = (w: unknown) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConfigureScreen wallet={w as never} />
    </QueryClientProvider>,
  )
const action = (name: RegExp | string) => screen.getByRole('button', { name })
const confirmKey = (name: string) => screen.getAllByRole('button', { name }).at(-1)!

beforeEach(() => {
  useAppStore.setState({ wallets: [MASTER, REGULAR, MAINNET_MASTER, { ...REGULAR, id: 'rm', network: 'mainnet' }], openLocks: { l: { key: {} as CryptoKey, autoLockMinutes: 5 } }, activeWalletId: 'm' } as never)
  h.account = { isError: false, data: state({ regularKey: 'rKey' }) }
  h.setMasterKey.mockReset()
})
afterEach(cleanup)

describe('Configure: Operating another account', () => {
  it('a wallet that holds the master key shows the plate with the master key control and the Let another wallet sign key, no note', () => {
    mount(MASTER)
    expect(screen.getByRole('heading', { level: 2, name: 'Operating another account' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Let another wallet sign' })).toBeTruthy()
    expect(screen.getByTestId('master-key-control')).toBeTruthy()
    expect(screen.queryByTestId('controlled-note')).toBeNull()
  })

  it('a wallet that operates another account shows the ControlledNote with the ledger status, and no Let another wallet sign key', () => {
    mount(REGULAR)
    expect(screen.getByTestId('controlled-note').textContent).toContain('This wallet operates another account')
    expect(screen.getByText('Controlled')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Let another wallet sign' })).toBeNull()
    expect(screen.getByTestId('master-key-control')).toBeTruthy()
  })

  it('an errored read is aria-disabled with the reason as text, and a click signs nothing', async () => {
    h.account = { isError: true, data: state({ regularKey: 'rKey' }) }
    mount(MASTER)
    expect(action('Turn master key off').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/cannot tell whether the master key is on/)).toBeTruthy()
    await click(action('Turn master key off'))
    expect(screen.queryByText(/Turn the master key off\?/)).toBeNull()
    expect(h.setMasterKey).not.toHaveBeenCalled()
  })

  it('is aria-disabled with no Regular Key and while it is the Regular Key wallet with the master key on', () => {
    h.account = { isError: false, data: state() }
    mount(MASTER)
    expect(action('Turn master key off').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/no Regular Key yet/)).toBeTruthy()
    cleanup()
    h.account = { isError: false, data: state({ regularKey: 'rKey' }) }
    mount(REGULAR)
    expect(action('Turn master key on').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/already on/)).toBeTruthy()
  })

  it('states the consequence before anything is signed; Cancel sends nothing', async () => {
    mount(MASTER)
    await click(action('Turn master key off'))
    expect(screen.getByText(/can no longer sign for this account/)).toBeTruthy()
    expect(screen.getByText('rKey')).toBeTruthy()
    expect(h.setMasterKey).not.toHaveBeenCalled()
    await click(screen.getByRole('button', { name: 'Cancel' }))
    expect(h.setMasterKey).not.toHaveBeenCalled()
  })

  it('Mainnet holds the confirm until the phrase is typed, then commits with confirmed: true', async () => {
    h.setMasterKey.mockResolvedValue({ status: 'validated', state: 'off' })
    mount(MAINNET_MASTER)
    await click(action('Turn master key off'))
    expect(confirmKey('Turn master key off').getAttribute('aria-disabled')).toBe('true')
    await click(confirmKey('Turn master key off'))
    expect(h.setMasterKey).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/Type “turn off”/), { target: { value: '  Turn   OFF ' } })
    await click(confirmKey('Turn master key off'))
    await waitFor(() => expect(h.setMasterKey).toHaveBeenCalledTimes(1))
    expect(h.setMasterKey.mock.calls[0][2]).toMatchObject({ confirmed: true })
    expect(await screen.findByText(/shows the master key as off/)).toBeTruthy()
  })

  it('turns it on from the Regular Key wallet and reports an unconfirmed result as unknown', async () => {
    h.account = { isError: false, data: state({ regularKey: 'rKey', disableMasterKey: true }) }
    h.setMasterKey.mockResolvedValue({ status: 'unconfirmed', reason: 'Submitted, could not confirm.' })
    mount(REGULAR)
    await click(action('Turn master key on'))
    await click(confirmKey('Turn master key on'))
    await waitFor(() => expect(h.setMasterKey).toHaveBeenCalledWith('r', true, expect.objectContaining({ confirmed: true })))
    expect(await screen.findByText('Submitted, could not confirm.')).toBeTruthy()
    expect(screen.getByText(/^Master key unknown/)).toBeTruthy()
  })
})
