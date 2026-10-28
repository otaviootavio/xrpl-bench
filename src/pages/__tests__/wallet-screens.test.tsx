/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
// Each screen has its own test: here they are stand-ins that name the Wallet they were given.
vi.mock('@/components/wallet/EditChecksScreen', () => ({ EditChecksScreen: ({ wallet }: { wallet: { id: string } }) => <p>edit checks for {wallet.id}</p> }))
vi.mock('@/components/wallet/ControlWalletScreen', () => ({ ControlWalletScreen: ({ controller }: { controller: { id: string } }) => <p>control for {controller.id}</p> }))
vi.mock('@/components/wallet/TwoDeviceSign', () => ({ TwoDeviceScreen: ({ wallet }: { wallet: { id: string } }) => <p>two device for {wallet.id}</p> }))

import { WalletScreens } from '../WalletScreens'
import { useAppStore } from '@/store/app-store'
import type { TaskRoute } from '@/lib/route'

const wallet = (id: string, lockId: string) => ({
  id, seedId: id, lockId, label: id, address: `r${id}`, createdAt: 1, network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard',
})

function mount(route: TaskRoute) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <WalletScreens route={route} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useAppStore.setState({
    wallets: [wallet('a', 'X'), wallet('b', 'Y')],
    activeWalletId: 'a',
    openLocks: { X: { key: {} as CryptoKey, autoLockMinutes: 5 } },
  } as never)
})
afterEach(cleanup)

describe('WalletScreens', () => {
  it('shows a screen for a Wallet whose own lock is open', () => {
    window.history.replaceState(null, '', '/wallets/a/checks')
    mount({ screen: 'edit-checks', walletId: 'a' })
    expect(screen.getByText('edit checks for a')).toBeTruthy()
    expect(window.location.pathname).toBe('/wallets/a/checks')
  })

  it.each([
    ['edit-checks', 'b'],
    ['two-device', 'b'],
    ['control', 'b'],
    ['control', 'nobody'],
  ] as const)('renders nothing for %s of a Wallet that is locked or absent (%s), and resets to the shell', (screenName, walletId) => {
    window.history.replaceState(null, '', `/wallets/${walletId}/x`)
    mount({ screen: screenName, walletId })
    expect(screen.queryByText(/for /)).toBeNull()
    expect(window.location.pathname).toBe('/')
  })
})
