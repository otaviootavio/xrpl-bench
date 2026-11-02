/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The real `Main` with the real `WalletTab`: Wallet tab, a task screen, Back. Everything the round
 * trip depends on (the tab Main holds, the label, the focus return) is real here; only the
 * ledger-facing tabs, live hooks and the task screen's body are stand-ins.
 */
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
  getLockInfo: async (id: string) => ({ id, openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }),
  startLockSession: async () => {},
}))
vi.mock('@/lib/crypto/keystore', () => ({
  addressFromSeed: () => '',
  importAndStoreWallet: async () => {},
  listWallets: async () => [],
  removeWallet: async () => {},
  revealSeed: async () => ({ status: 'cancelled' }),
  unavailablePrompts: { pin: async () => null },
  describeCheckFailure: () => 'x',
  setLockAutoLock: async () => ({ ok: true }),
}))
vi.mock('@/components/wallet/EditChecksScreen', async () => {
  const { TaskScreen } = await import('@/components/wallet/TaskScreen')
  return {
    EditChecksScreen: ({ onClose, backLabel }: { onClose: () => void; backLabel?: string }) => (
      <TaskScreen title="Edit checks" backLabel={backLabel} onBack={onClose}>
        <p>edit checks body</p>
      </TaskScreen>
    ),
  }
})
vi.mock('@/pages/tabs/BalancesTab', () => ({ BalancesTab: () => <p>balances body</p> }))
vi.mock('@/pages/tabs/SendTab', () => ({ SendTab: () => <p>send body</p> }))
vi.mock('@/pages/tabs/ReceiveTab', () => ({ ReceiveTab: () => <p>receive body</p> }))
vi.mock('@/pages/tabs/HistoryTab', () => ({ HistoryTab: () => <p>history body</p> }))
vi.mock('@/pages/tabs/TrustLinesTab', () => ({ TrustLinesTab: () => <p>tokens body</p> }))
vi.mock('@/hooks/useIncomingPaymentNotifications', () => ({ useIncomingPaymentNotifications: () => {} }))
vi.mock('@/hooks/useAccountLiveUpdates', () => ({ useAccountLiveUpdates: () => {} }))
vi.mock('@/lib/notify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: async () => {} }))
vi.mock('@/lib/xrpl/query-reads', () => ({ fetchAccountStateOnce: async () => null }))
vi.mock('@/hooks/useAppUpdate', () => ({
  useAppUpdate: () => ({
    updateReady: false, applying: false, applyUpdate: () => {}, checking: false, checkError: null,
    checkForUpdate: () => {}, pendingRelease: null, blockedReason: null, declined: false, declineCurrent: () => {},
  }),
}))
vi.mock('@/lib/build-info', () => ({
  BUILD: { version: '0.0.0', commitSha: 'unknown-dev', builtAt: '' },
  shortSha: 'unknown',
  sourceUrl: 'https://example.invalid',
  formatBuiltAt: () => '',
}))

import { Main } from '../Main'
import { clearConfigureFocusReturn } from '@/lib/configure-launch'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PromptsContext } from '@/hooks/usePrompts'
import { useAppStore } from '@/store/app-store'

const A = { createdAt: 1, algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard', network: 'testnet', id: 'a', seedId: 'a', lockId: 'X', label: 'Alpha', address: 'rAlphaAddr' }

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  useAppStore.setState({ wallets: [A], activeWalletId: 'a', openLocks: {} } as never)
  useAppStore.getState().openLock('X', {} as CryptoKey, 5)
})
afterEach(() => {
  clearConfigureFocusReturn()
  cleanup()
  useAppStore.getState().closeAllLocks()
})

describe('Main with the real Wallet tab', () => {
  it('Wallet tab, Edit checks, Back: Wallet is selected, the label said Back to Wallet, focus is on Edit checks', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PromptsContext.Provider value={{ pin: async () => '123456' }}>
          <TooltipProvider>
            <Main />
          </TooltipProvider>
        </PromptsContext.Provider>
      </QueryClientProvider>,
    )
    const walletTab = screen.getByRole('tab', { name: 'Wallet' })
    fireEvent.mouseDown(walletTab)
    fireEvent.click(walletTab)
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Wallet' }).getAttribute('aria-selected')).toBe('true'))

    fireEvent.click(await screen.findByRole('button', { name: 'Edit checks' }))
    const back = await screen.findByRole('button', { name: /Back to Wallet/ })
    expect(back.textContent).toBe('Back to Wallet')
    fireEvent.click(back)

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Wallet' }).getAttribute('aria-selected')).toBe('true'))
    const key = await screen.findByRole('button', { name: 'Edit checks' })
    await waitFor(() => expect(document.activeElement).toBe(key))
  })
})
