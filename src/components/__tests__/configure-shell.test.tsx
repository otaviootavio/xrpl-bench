/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ lockInfo: vi.fn() }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
  extendLockSession: async () => {},
  getLockInfo: (id: string) => h.lockInfo(id),
}))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/hooks/useAppUpdate', () => ({ useAppUpdate: () => ({ updateReady: true, declined: false, applying: false }) }))
vi.mock('@/lib/build-info', () => ({ BUILD: { version: '0.0.0', commitSha: 'x', builtAt: '' }, shortSha: 'x', sourceUrl: 'https://example.invalid', formatBuiltAt: () => '' }))
vi.mock('@/components/wallet/RevealSeedControl', () => ({ RevealSeedControl: () => <button>Reveal seed</button> }))

import { WalletTab } from '@/pages/tabs/WalletTab'
import { clearConfigureFocusReturn } from '@/lib/configure-launch'
import { useAppStore } from '@/store/app-store'

/** The fixed plate order of the Wallet tab. `Account` is the h2 inside the identity plate's address plate. */
const PLATE_ORDER = ['This wallet', 'Account', 'Name', 'Address Book', 'Checks', 'Seed', 'Operating another account', 'Node', 'Two-device signing', 'Remove this wallet']

const W = (id: string, lockId: string, extra = {}) =>
  ({ id, seedId: id, lockId, label: id, address: `r${id}`, createdAt: 1, network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard', ...extra }) as never
const KEY = {} as CryptoKey

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <WalletTab wallet={useAppStore.getState().wallets.find((w) => w.id === 'a') as never} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  h.lockInfo.mockReset().mockResolvedValue({ id: 'X', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false })
  window.history.replaceState(null, '', '/')
  useAppStore.setState({ wallets: [W('a', 'X'), W('b', 'Y')], activeWalletId: 'a', openLocks: {} } as never)
  // Through openLock, so the lock has an expiry: a lock without one fails closed as expired.
  useAppStore.getState().openLock('X', KEY, 5)
})
afterEach(() => {
  clearConfigureFocusReturn()
  cleanup()
  useAppStore.getState().closeAllLocks()
})

describe('the Wallet tab', () => {
  it('h1 reads Settings for <name> with the Network words; then the ten headings (Account and nine plates) in the fixed order', async () => {
    mount()
    expect(screen.getByRole('heading', { level: 1, name: 'Settings for a' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByText('Testnet').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('heading', { level: 2 }).map((n) => n.textContent)).toEqual(PLATE_ORDER)
    // No jump list: no in-page links.
    expect(document.querySelector('a[href^="#"]')).toBeNull()
    // The identity plate: name, network in words, the full address.
    const identity = screen.getByRole('region', { name: 'This wallet' })
    expect(identity.textContent).toContain('NameaNetworkTestnet')
    expect(identity.textContent?.replace(/\s/g, '')).toContain('ra')
    expect(await screen.findByRole('button', { name: 'Edit checks' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reveal seed' })).toBeTruthy()
  })

  it.each([
    ['mainnet', 'Mainnet', 'Real funds'],
    ['devnet', 'Devnet', 'Not stable'],
  ])('%s says its Network in words beside the heading', (network, label, badge) => {
    useAppStore.setState({ wallets: [W('a', 'X', { network })], activeWalletId: 'a' } as never)
    mount()
    expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    expect(screen.getByText(badge)).toBeTruthy()
  })

  it('holds no app-level plate: no Remove all wallets, no Version, no update marker', () => {
    mount()
    expect(screen.queryByText(/Remove all wallets/)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Version' })).toBeNull()
    expect(screen.queryByText(/update available/i)).toBeNull()
    // Its own Address Book plate is not an app-level plate: it is this wallet's (AD-50), and sits after Name.
    expect(screen.getByRole('heading', { name: 'Address Book' })).toBeTruthy()
  })

  it('Edit checks opens the shipped path', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit checks' }))
    expect(window.location.pathname).toBe('/wallets/a/checks')
  })

  it('a plain mount does not move focus off where it was', () => {
    mount()
    expect(document.activeElement).toBe(document.body)
  })

  it('after a task round trip focus is on the opener once; a later mount does not force it', async () => {
    const { launchFromConfigure } = await import('@/lib/configure-launch')
    launchFromConfigure('/wallets/a/checks', 'edit-checks')
    const first = mount()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit checks' })))
    // The pending return clears on the next tick.
    await new Promise((r) => setTimeout(r, 5))
    first.unmount()
    mount()
    expect(document.activeElement).toBe(document.body)
  })
})

describe('the Checks plate wording', () => {
  const read = async (lock: Record<string, unknown>, wallet: Record<string, unknown> = {}) => {
    h.lockInfo.mockResolvedValue({ id: 'X', autoLockMinutes: 5, pin: true, passkey: false, ...lock })
    useAppStore.setState({ wallets: [W('a', 'X', wallet)] } as never)
    mount()
    await screen.findByText('Authentication required to open the wallet')
    return document.querySelectorAll('[data-slot="config-plate"] dl')[1]?.textContent ?? ''
  }

  it('uses the words the Edit checks screen uses', async () => {
    expect(await read({ openCheck: 'pin' })).toBe('Authentication required to open the walletApp PINAuthentication required to sign a transactionNothing is asked for signing.')
  })

  it('No Open Check carries its sentence; a Signing Check names itself', async () => {
    expect(await read({ openCheck: 'none' }, { signingCheck: 'passkey' })).toBe(
      'Authentication required to open the walletNo authentication required to open the walletTestnet and Devnet only.Authentication required to sign a transactionPasskey only',
    )
  })

  it('a Passkey-Derived Seed reads Passkey only', async () => {
    expect(await read({ openCheck: 'passkey' }, { seedMethod: 'passkey-derived' })).toBe('Authentication required to open the walletPasskeyAuthentication required to sign a transactionPasskey only')
  })

  it('a failed read is not shown as a check: it says so and offers Retry', async () => {
    h.lockInfo.mockRejectedValue(new Error('idb down'))
    mount()
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('Authentication required to open the wallet')).toBeNull()
    expect(screen.queryByText('No authentication required to open the wallet')).toBeNull()
    h.lockInfo.mockResolvedValue({ id: 'X', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('App PIN')).toBeTruthy()
  })
})
