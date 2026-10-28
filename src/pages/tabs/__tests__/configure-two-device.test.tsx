/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The Configure counterpart of the Settings row of `two-device-sign.test.tsx`, and the Node
 * and Let another wallet sign launches (test design R12): the Two-device signing plate opens
 * the shipped screen with the label `Back to Configure`, Back returns to Configure with
 * focus on the opener, and the Settings tab's own launch is unchanged.
 */
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
  getLockInfo: async (id: string) => ({ id, openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }),
}))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: async () => {}, retireNode: () => {}, verifyNode: async () => ({ ok: true }) }))
vi.mock('@/lib/xrpl/query-reads', () => ({ fetchAccountStateOnce: async () => null }))
vi.mock('@/hooks/useAccountState', () => ({ useAccountState: () => ({ isError: false, data: undefined }) }))
vi.mock('@/hooks/useAppUpdate', () => ({
  useAppUpdate: () => ({
    updateReady: false, applying: false, applyUpdate: () => {}, checking: false, checkError: null,
    checkForUpdate: () => {}, pendingRelease: null, blockedReason: null, declined: false, declineCurrent: () => {},
  }),
}))
vi.mock('@/lib/build-info', () => ({ BUILD: { version: '0.0.0', commitSha: 'x', builtAt: '' }, shortSha: 'x', sourceUrl: 'https://example.invalid', formatBuiltAt: () => '' }))
vi.mock('@/components/wallet/RevealSeedControl', () => ({ RevealSeedControl: () => <button>Reveal seed</button> }))
vi.mock('@/components/wallet/QrScanner', () => ({ QrScanner: () => <p>scanner</p> }))

import { SettingsTab } from '../SettingsTab'
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

function Host({ at }: { at: 'configure' | 'settings' }) {
  const route = useRoute()
  if (isTaskRoute(route)) return <WalletScreens route={route} />
  return at === 'configure' ? <ConfigureScreen wallet={useAppStore.getState().wallets[0] as never} /> : <SettingsTab />
}
function renderAt(at: 'configure' | 'settings') {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PromptsContext.Provider value={{ pin: async () => '123456' }}>
        <TooltipProvider>
          <Host at={at} />
        </TooltipProvider>
      </PromptsContext.Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
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

  it('opened from the Settings tab the label stays `Settings`', async () => {
    navigate('/')
    renderAt('settings')
    fireEvent.click(screen.getByRole('button', { name: 'Sign with two devices' }))
    const back = await screen.findByRole('button', { name: /Settings/ })
    expect(back.textContent).toBe('Settings')
    expect(screen.queryByText('Back to Configure')).toBeNull()
  })
})
