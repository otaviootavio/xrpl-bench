/** @vitest-environment jsdom */
import { existsSync, readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Story 17 (AD-45): Settings is ONE component, `AppSettings`, with Version and
 * updates, and Remove all wallets from this device. `/settings` renders it; the in-wallet tab is now the Wallet tab (Epic 23).
 * Real: Main, AppSettings, RemoveAllPlate, the app store. Faked: persistence, the vault, the ledger
 * hooks, the other five tabs, the update hook and the build stamp.
 */
const h = vi.hoisted(() => ({ wipeVault: vi.fn(async () => {}) }))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: () => h.wipeVault() }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {}, extendLockSession: async () => {} }))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: async () => {} }))
vi.mock('@/hooks/useIncomingPaymentNotifications', () => ({ useIncomingPaymentNotifications: () => {} }))
vi.mock('@/hooks/useAccountLiveUpdates', () => ({ useAccountLiveUpdates: () => {} }))
vi.mock('@/hooks/useAppUpdate', () => ({
  useAppUpdate: () => ({
    updateReady: false, declined: false, applying: false, applyUpdate: () => {}, checking: false, checkError: false,
    checkForUpdate: () => {}, pendingRelease: null, blockedReason: null, declineCurrent: () => {},
  }),
}))
vi.mock('@/lib/build-info', () => ({ BUILD: { version: '0.0.0', commitSha: 'x', builtAt: '' }, shortSha: 'x', sourceUrl: 'https://example.invalid', formatBuiltAt: () => '' }))
vi.mock('@/pages/Unlock', () => ({ Unlock: () => <p>unlock</p> }))
vi.mock('@/pages/tabs/BalancesTab', () => ({ BalancesTab: () => <p>tab</p> }))
vi.mock('@/pages/tabs/SendTab', () => ({ SendTab: () => <p>tab</p> }))
vi.mock('@/pages/tabs/ReceiveTab', () => ({ ReceiveTab: () => <p>tab</p> }))
vi.mock('@/pages/tabs/HistoryTab', () => ({ HistoryTab: () => <p>tab</p> }))
vi.mock('@/pages/tabs/TrustLinesTab', () => ({ TrustLinesTab: () => <p>tab</p> }))
vi.mock('@/pages/tabs/WalletTab', () => ({ WalletTab: () => <p>wallet tab</p> }))

import { Main } from '@/pages/Main'
import { AppSettings } from '@/pages/AppSettings'
import { useAppStore } from '@/store/app-store'

const W = (id: string, lockId: string) =>
  ({ id, seedId: id, lockId, label: `Wallet ${id}`, address: `r${id}`, createdAt: 1, network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' }) as never
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>)

/** Every per-wallet control Settings used to carry, by the accessible names it had. */
const DELETED_NAMES: Array<[string, RegExp]> = [
  ['Use this wallet', /^Use this wallet/],
  ['Reveal seed', /^Reveal seed/],
  ['Edit checks', /^Edit checks/],
  ['Use on a network', /^Use .* on /],
  ['Let another wallet sign', /^Let another wallet sign/],
  ['Sign with two devices', /^Sign with two devices/],
  ['Turn master key off or on', /^Turn master key/],
  ['Custom Node', /Test and save|Use built-in Nodes/],
  ['Remove a wallet', /^Remove (?!all wallets)/],
  ['Lock now', /^Lock now$/],
  ['Add wallet', /^Add wallet/],
]

function expectOnlyAppLevel() {
  // The Address Book is a Wallet-tab plate, not an app-level one (AD-50).
  expect(screen.queryByRole('heading', { name: /^Address book$/i })).toBeNull()
  expect(screen.getByRole('heading', { name: 'Version' })).toBeTruthy()
  expect(screen.getByRole('button', { name: /^Remove all wallets from this device$/ })).toBeTruthy()
  // Nothing else holds a heading: the per-wallet Wallets and Security plates are gone.
  expect(screen.queryByRole('heading', { name: /^(Wallets|Security)$/ })).toBeNull()
  for (const [what, name] of DELETED_NAMES) expect(screen.queryByRole('button', { name }), what).toBeNull()
  expect(screen.queryByLabelText(/Auto-lock after inactivity/i)).toBeNull()
  expect(screen.queryByRole('combobox')).toBeNull()
  expect(screen.queryByText(/auto-lock/i)).toBeNull()
  expect(screen.queryByTestId('master-key-control')).toBeNull()
  expect(screen.queryByTestId('two-device-sign')).toBeNull()
  expect(screen.queryByTestId('controlled-note')).toBeNull()
}

beforeEach(() => {
  h.wipeVault.mockReset().mockResolvedValue(undefined)
  window.history.replaceState(null, '', '/wallets/a')
  useAppStore.setState({ wallets: [W('a', 'X'), W('b', 'Y')], activeWalletId: 'a', openLocks: {}, addressBook: {} } as never)
  useAppStore.getState().openLock('X', {} as CryptoKey, 5)
})
afterEach(() => {
  cleanup()
  useAppStore.getState().closeAllLocks()
})

describe('AppSettings holds only what belongs to the app', () => {
  it('with open locks and several wallets: the three app-level items and no per-wallet control', () => {
    useAppStore.getState().openLock('Y', {} as CryptoKey, 5)
    wrap(<AppSettings />)
    expectOnlyAppLevel()
  })

  it('with no wallet and no open lock it renders the same, and Remove all is offered', () => {
    useAppStore.setState({ wallets: [], activeWalletId: null, openLocks: {} } as never)
    wrap(<AppSettings />)
    expectOnlyAppLevel()
  })

  it('Remove all works with a PIN wallet and no lock open: it asks for no lock and no PIN', async () => {
    useAppStore.setState({ openLocks: {} } as never)
    const real = window.location
    const reload = vi.fn()
    vi.stubGlobal('location', { get pathname() { return real.pathname }, get search() { return real.search }, get hash() { return real.hash }, reload })
    try {
      wrap(<AppSettings />)
      fireEvent.click(screen.getByRole('button', { name: 'Remove all wallets from this device' }))
      fireEvent.click(await screen.findByRole('button', { name: /erase everything/i }))
      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
      expect(h.wipeVault).toHaveBeenCalledTimes(1)
      expect(useAppStore.getState().wallets).toEqual([])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('the in-wallet tab list has a Wallet tab and no Settings tab (CAP-1, AD-51)', () => {
  it('lists Balances, Send, Receive, History, Tokens, Wallet in that order, and no Settings', async () => {
    wrap(<Main />)
    await screen.findAllByRole('tab')
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Balances', 'Send', 'Receive', 'History', 'Tokens', 'Local settings'])
    expect(screen.queryByRole('tab', { name: /Settings/ })).toBeNull()
  })

  it('the Wallet tab carries no app-level plate', async () => {
    wrap(<Main />)
    const tab = await screen.findByRole('tab', { name: 'Local settings' })
    await act(async () => {
      fireEvent.mouseDown(tab, { button: 0, ctrlKey: false })
    })
    await screen.findByText('wallet tab')
    expect(screen.queryByRole('heading', { name: 'Address book' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Version' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove all wallets from this device' })).toBeNull()
  })

  it('Main no longer imports AppSettings or the update marker; /settings is the only mount of the component', () => {
    const main = readFileSync('src/pages/Main.tsx', 'utf8')
    expect(main).not.toMatch(/AppSettings/)
    expect(main).not.toMatch(/useUpdateMarker|Lamp/)
    expect(main).toMatch(/Panel: WalletPanel/)
    expect(existsSync('src/pages/tabs/SettingsTab.tsx')).toBe(false)
    expect(readFileSync('src/pages/SettingsScreen.tsx', 'utf8')).toMatch(/<AppSettings \/>/)
  })
})
