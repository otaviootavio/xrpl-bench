/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * OS-FR-1, CAP-1: each Wallet kind opens its own screens, chosen in `Main` above
 * every ledger hook. Real: Gate, Main, every kind panel, the real Local settings
 * tab, the app store. Faked: the pool (so any ledger read would be counted), the
 * two live hooks, the vault and the keystore list. Pattern:
 * `locked-no-ledger-request.test.tsx`, but no panel is mocked here.
 */
const h = vi.hoisted(() => ({
  getXrplClient: vi.fn(),
  hookArgs: vi.fn(),
  wallets: [] as unknown[],
  restored: [] as Array<{ lockId: string; key: unknown; autoLockMinutes: number }>,
  setShowBeforeSending: vi.fn(),
  setTransmitterSync: vi.fn(),
}))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/xrpl/client', () => ({
  getXrplClient: h.getXrplClient,
  holdXrplClient: h.getXrplClient,
  disconnectAllClients: vi.fn(),
  retireNode: vi.fn(),
  verifyNode: vi.fn(),
}))
vi.mock('@/pages/Onboarding', () => ({ Onboarding: () => <div>onboarding</div> }))
vi.mock('@/pages/Unlock', () => ({ Unlock: ({ wallet }: { wallet: { label: string } }) => <div>{`locked:${wallet.label}`}</div> }))
vi.mock('@/hooks/useIncomingPaymentNotifications', () => ({ useIncomingPaymentNotifications: (...a: unknown[]) => h.hookArgs('notify', ...a) }))
vi.mock('@/hooks/useAccountLiveUpdates', () => ({ useAccountLiveUpdates: (...a: unknown[]) => h.hookArgs('live', ...a) }))
vi.mock('@/hooks/useAppUpdate', () => ({ useAppUpdate: () => ({ updateReady: false, declined: false }) }))
vi.mock('@/lib/build-info', () => ({ BUILD: { version: '0.0.0', commitSha: 'x', builtAt: '' }, shortSha: 'x', sourceUrl: 'https://example.invalid', formatBuiltAt: () => '' }))
vi.mock('@/lib/crypto/lock', () => ({
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
  restoreOpenLocks: async () => h.restored,
  extendLockSession: async () => {},
  getLockInfo: async (id: string) => ({ id, openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }),
  hasAppPin: async () => true,
}))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/keystore', () => ({ listWallets: async () => h.wallets, setShowBeforeSending: h.setShowBeforeSending, setTransmitterSync: h.setTransmitterSync }))

import App from '../App'
import { useAppStore } from '@/store/app-store'
import { KIND_WORDS, NOT_SYNCED, OFFLINE_SCREENS, OFFLINE_SIGN_TITLE } from '@/lib/wallet-kind-words'
import { NO_KEY, NONE, REMOVE_THE_ADDRESS, SYNC_TO_AN_ADDRESS, VALUE_UNKNOWN } from '@/lib/transmitter-words'

type Kind = 'online' | 'offline' | 'transmitter'
/** A Transmitter has its own meta shape (story 4): no Seed fields, a Synced address or null. */
const transmitterMeta = (address: string | null = null) => ({
  id: 'w1',
  seedId: 'w1',
  lockId: 'X',
  label: 'Alpha',
  address,
  createdAt: 1,
  network: 'testnet',
  openCheck: 'pin',
  kind: 'transmitter',
})
const meta = (kind: Kind) => (kind === 'transmitter' ? transmitterMeta() : {
  id: 'w1',
  seedId: 'w1',
  lockId: 'X',
  label: 'Alpha',
  address: 'rALPHAaddress',
  keyAddress: 'rALPHAaddress',
  createdAt: 1,
  network: 'testnet',
  algorithm: 'ed25519',
  seedMethod: 'stored',
  openCheck: 'pin',
  signingCheck: 'standard',
  kind,
})

/** The app with one Synced Transmitter whose lock is open. */
async function openSyncedTransmitter() {
  h.wallets = [transmitterMeta('rSYNCEDaddressXXXXXXXXXXXXXX')]
  h.restored = [{ lockId: 'X', key: {}, autoLockMinutes: 5 }]
  window.history.replaceState(null, '', '/wallets/w1')
  render(<App />)
  await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0))
}

/** The app on `path`, with one Wallet of `kind` whose lock is already open. */
async function openApp(kind: Kind, path = '/wallets/w1') {
  h.wallets = [meta(kind)]
  h.restored = [{ lockId: 'X', key: {}, autoLockMinutes: 5 }]
  window.history.replaceState(null, '', path)
  render(<App />)
  await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0))
}

const tabNames = () => screen.getAllByRole('tab').map((t) => t.textContent)
const plateTitles = () => [...document.querySelectorAll('[data-slot="config-plate"] > h2')].map((e) => e.textContent)

async function openSettings() {
  const tab = screen.getByRole('tab', { name: 'Local settings' })
  fireEvent.mouseDown(tab)
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /Local settings/ })).toBeTruthy())
}

beforeEach(() => {
  useAppStore.setState({ openLocks: {}, wallets: [], activeWalletId: null })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('an Offline Wallet (OS-FR-1)', () => {
  it('shows its own five screens, and never asks the pool for a client nor mounts a live hook', async () => {
    await openApp('offline')
    expect(tabNames()).toEqual(['New transaction', 'Sign', 'Receive', 'Signed', 'Local settings'])
    // A screen not built yet shows its approved title only.
    expect(screen.getByRole('heading', { level: 1, name: 'New transaction' })).toBeTruthy()

    for (const [name, title] of [
      ['Sign', OFFLINE_SIGN_TITLE],
      ['Signed', OFFLINE_SCREENS.signed.title],
      ['Receive', 'Receive'],
    ] as const) {
      fireEvent.mouseDown(screen.getByRole('tab', { name }))
      await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy())
    }
    // Receive is the address and its QR, from the record.
    expect(screen.getByRole('button', { name: 'Copy address' })).toBeTruthy()
    expect(document.body.textContent).toContain('rALP')

    await openSettings()
    expect(h.getXrplClient).not.toHaveBeenCalled()
    expect(h.hookArgs).not.toHaveBeenCalled()
  })

  it('Local settings: kind stamp first in the heading row, and the Offline plates in order', async () => {
    await openApp('offline')
    await openSettings()
    const h1 = screen.getByRole('heading', { level: 1, name: /Local settings/ })
    const row = h1.parentElement as HTMLElement
    expect(within(row).getByText(KIND_WORDS.offline)).toBeTruthy()
    expect(plateTitles()).toEqual(['This wallet', 'Name', 'Address Book', 'Checks', 'Seed', 'Remove this wallet'])
    expect(screen.getByRole('button', { name: 'Edit checks' })).toBeTruthy()
    expect(h.getXrplClient).not.toHaveBeenCalled()
  })
})

describe('a Transmitter Wallet (OS-FR-1, OS-FR-4)', () => {
  it('shows two screens, Transmit first, and mounts no live hook', async () => {
    await openApp('transmitter')
    expect(tabNames()).toEqual(['Transmit', 'Local settings'])
    expect(screen.getByRole('heading', { level: 1, name: 'Transmit' })).toBeTruthy()
    expect(h.hookArgs).not.toHaveBeenCalled()
  })

  it('Local settings: P-5 and no key rows, checks without the Signing Check or Edit checks, a Node, no Seed', async () => {
    await openApp('transmitter')
    await openSettings()
    expect(plateTitles()).toEqual(['This wallet', SYNC_TO_AN_ADDRESS, 'Name', 'Address Book', 'Checks', 'Node', 'Before sending', 'Remove this wallet'])
    const identity = screen.getByRole('region', { name: 'This wallet' })
    expect(identity.textContent).toBe(`This wallet${NOT_SYNCED}${NO_KEY}`)
    const checks = screen.getByRole('region', { name: 'Checks' })
    await waitFor(() => expect(within(checks).getByText('PIN', { exact: false })).toBeTruthy())
    expect(within(checks).queryByText(/sign/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit checks' })).toBeNull()
    // Nothing in a Transmitter offers to sign (OS-FR-3).
    expect(screen.queryByRole('button', { name: /sign/i })).toBeNull()
    expect(screen.getByRole('button', { name: SYNC_TO_AN_ADDRESS })).toBeTruthy()
    expect(screen.queryByRole('button', { name: REMOVE_THE_ADDRESS })).toBeNull()
  })

  it('Synced: five screens, the live hook on the Synced address, and Account says unknown on failed reads, never none (OS-FR-4, OS-FR-22)', async () => {
    h.getXrplClient.mockRejectedValue(new Error('no socket'))
    await openSyncedTransmitter()
    expect(tabNames()).toEqual(['Transmit', 'Account', 'History', 'New transaction', 'Local settings'])
    await waitFor(() => expect(h.hookArgs).toHaveBeenCalledWith('live', 'testnet', 'rSYNCEDaddressXXXXXXXXXXXXXX', undefined))
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Account' }))
    await waitFor(() => expect(screen.getByText('Balance unavailable')).toBeTruthy(), { timeout: 15_000 })
    await waitFor(() => expect(screen.getAllByText(VALUE_UNKNOWN).length).toBe(3), { timeout: 15_000 })
    expect(screen.queryByText(NONE)).toBeNull()
    expect(screen.queryByRole('button', { name: /sign/i })).toBeNull()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'New transaction' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'New transaction' })).toBeTruthy())
  }, 30_000)

  it('Synced Local settings: the address, and Remove the address goes back to two screens (OS-FR-4)', async () => {
    h.setTransmitterSync.mockImplementation(async () => {
      h.wallets = [transmitterMeta(null)]
    })
    await openSyncedTransmitter()
    await openSettings()
    const identity = screen.getByRole('region', { name: 'This wallet' })
    expect(identity.textContent).toContain('rSYN')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: REMOVE_THE_ADDRESS }))
    })
    expect(h.setTransmitterSync).toHaveBeenCalledWith('w1', null)
    await waitFor(() => expect(tabNames()).toEqual(['Transmit', 'Local settings']))
  })
})

describe('an Online Wallet keeps today\'s screens', () => {
  it('six tabs, the live hooks, and the Online plates with the kind stamp in the heading row', async () => {
    await openApp('online')
    expect(tabNames()).toEqual(['Balances', 'Send', 'Receive', 'History', 'Tokens', 'Local settings'])
    await waitFor(() => expect(h.hookArgs).toHaveBeenCalledWith('live', 'testnet', 'rALPHAaddress', undefined))
    await openSettings()
    const row = screen.getByRole('heading', { level: 1, name: /Local settings/ }).parentElement as HTMLElement
    expect(within(row).getByText(KIND_WORDS.online)).toBeTruthy()
    expect(plateTitles()).toEqual([
      'This wallet',
      'Name',
      'Address Book',
      'Checks',
      'Seed',
      'Operating another account',
      'Node',
      'Before sending',
      'Two-device signing',
      'Remove this wallet',
    ])
  })
})

describe('the Before sending plate (OS-FR-10)', () => {
  it('Online: the switch is named by the setting, described by P-44, off by default, and turns it on', async () => {
    h.setShowBeforeSending.mockImplementation(async () => {
      h.wallets = [{ ...meta('online'), showBeforeSending: true }]
    })
    await openApp('online')
    await openSettings()
    const control = screen.getByRole('switch', { name: 'Show the signed transaction before sending' })
    expect(control.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText(/This setting is off by default\. When it is on, the app shows the hash/)).toBeTruthy()
    await act(async () => {
      fireEvent.click(control)
    })
    expect(h.setShowBeforeSending).toHaveBeenCalledWith('w1', true)
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Show the signed transaction before sending' }).getAttribute('aria-checked')).toBe('true'))
  })

  it('Offline: no Before sending plate', async () => {
    await openApp('offline')
    await openSettings()
    expect(plateTitles()).not.toContain('Before sending')
    expect(screen.queryByRole('switch')).toBeNull()
  })
})

describe('an Online task screen on another kind (OS-FR-1)', () => {
  for (const kind of ['offline', 'transmitter'] as const) {
    for (const segment of kind === 'transmitter' ? ['two-device', 'control', 'checks'] : ['two-device', 'control']) {
      it(`${kind}: /wallets/w1/${segment} resets to the wallet shell and renders nothing of that screen`, async () => {
        await act(async () => {
          h.wallets = [meta(kind)]
          h.restored = [{ lockId: 'X', key: {}, autoLockMinutes: 5 }]
          window.history.replaceState(null, '', `/wallets/w1/${segment}`)
          render(<App />)
        })
        await waitFor(() => expect(window.location.pathname).toBe('/wallets/w1'))
        await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(0))
        expect(screen.getAllByRole('tab')[0].textContent).toBe(kind === 'offline' ? 'New transaction' : 'Transmit')
        expect(h.getXrplClient).not.toHaveBeenCalled()
      })
    }
  }

  it('offline: Edit checks stays reachable', async () => {
    await act(async () => {
      h.wallets = [meta('offline')]
      h.restored = [{ lockId: 'X', key: {}, autoLockMinutes: 5 }]
      window.history.replaceState(null, '', '/wallets/w1/checks')
      render(<App />)
    })
    await waitFor(() => expect(screen.getByRole('heading', { name: /checks/i })).toBeTruthy())
    expect(window.location.pathname).toBe('/wallets/w1/checks')
  })

  it('offline: Local settings, Edit checks, Back lands on Local settings with focus on Edit checks', async () => {
    await openApp('offline')
    await openSettings()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit checks' }))
    const back = await screen.findByRole('button', { name: /Back to Wallet/ })
    expect(window.location.pathname).toBe('/wallets/w1/checks')
    fireEvent.click(back)
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Local settings' }).getAttribute('aria-selected')).toBe('true'))
    const key = await screen.findByRole('button', { name: 'Edit checks' })
    await waitFor(() => expect(document.activeElement).toBe(key))
    expect(window.location.pathname).toBe('/wallets/w1')
  })
})
