/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  ({ id, seedId: id, lockId, label: id, address: `r${id}`, createdAt: 1, network: 'testnet', algorithm: 'ed25519', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard', ...extra }) as never
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
  it('h1 holds the fixed label Local settings and the name as its own span, with the Network words; then the ten headings (Account and nine plates) in the fixed order', async () => {
    mount()
    const h1 = screen.getByRole('heading', { level: 1, name: 'Local settings a' })
    expect(h1.querySelectorAll('span')).toHaveLength(2)
    expect(h1.querySelectorAll('span')[0].textContent).toBe('Local settings')
    // The name is its own element, not upper-cased by the heading's style.
    expect(h1.querySelectorAll('span')[1].textContent).toBe('a')
    expect(h1.className).not.toMatch(/uppercase/)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getAllByText('Testnet').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('heading', { level: 2 }).map((n) => n.textContent)).toEqual(PLATE_ORDER)
    // No jump list: no in-page links.
    expect(document.querySelector('a[href^="#"]')).toBeNull()
    // The identity plate: name, network in words, the full address.
    const identity = screen.getByRole('region', { name: 'This wallet' })
    // The name and the Network are in the heading, so the plate does not repeat them.
    expect(within(identity).queryByText('Name')).toBeNull()
    expect(within(identity).queryByText('Network')).toBeNull()
    expect(identity.textContent?.replace(/\s/g, '')).toContain('ra')
    expect(await screen.findByRole('button', { name: 'Edit checks' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reveal seed' })).toBeTruthy()
  })

  it('the identity plate shows only what no plate can change, read-only, in the quiz words', () => {
    useAppStore.setState({ wallets: [W('a', 'X', { algorithm: 'secp256k1', openCheck: 'pin', signingCheck: 'standard', seedMethod: 'stored' })], activeWalletId: 'a' } as never)
    mount()
    const identity = screen.getByRole('region', { name: 'This wallet' })
    const text = identity.textContent ?? ''
    for (const w of ['Signature type', 'secp256k1', 'Seed Method', 'Stored Seed']) expect(text).toContain(w)
    expect(within(identity).getAllByText('Fixed at creation')).toHaveLength(2)
    // The Node and the two checks are shown once, by their own plates, not again here.
    for (const w of ['Built-in Nodes', 'Authentication required to open the wallet', 'Authentication required to sign a transaction']) expect(text).not.toContain(w)
    // Only the address keys remain: no key that moves focus to another plate.
    expect(within(identity).queryByRole('button', { name: /^(Node|Checks)/ })).toBeNull()
  })

  it('says unknown for an unresolved curve', () => {
    useAppStore.setState({ wallets: [W('a', 'X', { algorithm: 'unresolved', node: 'wss://node.example' })], activeWalletId: 'a' } as never)
    mount()
    const text = screen.getByRole('region', { name: 'This wallet' }).textContent ?? ''
    expect(text).toContain('Unknown')
    expect(text).not.toContain('wss://node.example')
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
    await waitFor(() => expect(screen.getByRole('region', { name: 'Checks' }).querySelector('dl')).not.toBeNull())
    return screen.getByRole('region', { name: 'Checks' }).querySelector('dl')?.textContent ?? ''
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
    const checks = screen.getByRole('region', { name: 'Checks' })
    expect(within(checks).queryByText('Authentication required to open the wallet')).toBeNull()
    expect(within(checks).queryByText('No authentication required to open the wallet')).toBeNull()
    h.lockInfo.mockResolvedValue({ id: 'X', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await within(checks).findByText('App PIN')).toBeTruthy()
  })
})
