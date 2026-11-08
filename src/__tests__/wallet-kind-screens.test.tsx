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
vi.mock('@/lib/crypto/keystore', () => ({ listWallets: async () => h.wallets }))

import App from '../App'
import { useAppStore } from '@/store/app-store'
import { KIND_WORDS, NOT_SYNCED, OFFLINE_SCREENS, OFFLINE_SIGN_TITLE } from '@/lib/wallet-kind-words'

type Kind = 'online' | 'offline' | 'transmitter'
const meta = (kind: Kind) => ({
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
    expect(plateTitles()).toEqual(['This wallet', 'Name', 'Address Book', 'Checks', 'Node', 'Remove this wallet'])
    const identity = screen.getByRole('region', { name: 'This wallet' })
    expect(identity.textContent).toBe(`This wallet${NOT_SYNCED}`)
    const checks = screen.getByRole('region', { name: 'Checks' })
    await waitFor(() => expect(within(checks).getByText('PIN', { exact: false })).toBeTruthy())
    expect(within(checks).queryByText(/sign/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit checks' })).toBeNull()
    // The record's address is not shown for a Transmitter until Sync exists.
    expect(document.body.textContent).not.toContain('rALPHAaddress')
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
      'Two-device signing',
      'Remove this wallet',
    ])
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
