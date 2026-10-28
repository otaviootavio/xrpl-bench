/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
vi.mock('@/components/AppHeader', () => ({ AppHeader: () => <header>wallet-header</header> }))
vi.mock('@/hooks/useAppUpdate', () => ({ useAppUpdate: () => ({ updateReady: false, declined: false }) }))
vi.mock('@/lib/build-info', () => ({ BUILD: { version: '0.0.0', commitSha: 'x', builtAt: '' }, shortSha: 'x', sourceUrl: 'https://example.invalid', formatBuiltAt: () => '' }))
vi.mock('@/pages/Main', () => ({ Main: () => <p>wallet shell</p> }))
vi.mock('@/components/wallet/AddWalletScreen', () => ({ AddWalletScreen: () => <p>add wallet screen</p> }))
vi.mock('@/components/wallet/RevealSeedControl', () => ({ RevealSeedControl: () => <button>Reveal seed</button> }))

import { AppShell } from '../AppShell'
import { useAppStore } from '@/store/app-store'
import { navigate } from '@/lib/route'

/** The fixed plate order of the Configure screen (EXPERIENCE: Exact strings).. */
const PLATE_ORDER = ['Checks', 'Seed', 'Operating another account', 'Other networks', 'Node', 'Two-device signing']

const W = (id: string, lockId: string, extra = {}) =>
  ({ id, seedId: id, lockId, label: id, address: `r${id}`, createdAt: 1, network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard', ...extra }) as never
const KEY = {} as CryptoKey

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AppShell />
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
  cleanup()
  useAppStore.getState().closeAllLocks()
})

describe('the Configure route (AD-32)', () => {
  it('open lock: h1 Configure wallet and the plates as h2s in the fixed order, under the wallet header', async () => {
    act(() => navigate('/wallets/a/configure'))
    mount()
    expect(screen.getByRole('heading', { level: 1, name: 'Configure wallet' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 2 }).map((n) => n.textContent)).toEqual(PLATE_ORDER)
    expect(screen.getByText('wallet-header')).toBeTruthy()
    expect(screen.queryByText('wallet shell')).toBeNull()
    expect(await screen.findByRole('button', { name: 'Edit checks' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reveal seed' })).toBeTruthy()
  })

  it.each([
    ['a closed lock', () => useAppStore.setState({ openLocks: {} } as never), '/wallets/a/configure'],
    ['a wallet that is not the active one', () => {}, '/wallets/b/configure'],
    ['a wallet that does not exist', () => {}, '/wallets/zzz/configure'],
  ])('%s: resets to the chooser and renders nothing wallet-scoped', async (_name, arrange, path) => {
    arrange()
    act(() => navigate(path))
    mount()
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(screen.getByRole('heading', { level: 1, name: 'Wallets' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Configure wallet' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reveal seed' })).toBeNull()
    expect(h.lockInfo).not.toHaveBeenCalled()
  })

  it('a lock that closes while Configure shows returns to the chooser', async () => {
    act(() => navigate('/wallets/a/configure'))
    mount()
    expect(screen.getByRole('heading', { name: 'Configure wallet' })).toBeTruthy()
    act(() => useAppStore.getState().closeLock('X'))
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(screen.queryByRole('heading', { name: 'Configure wallet' })).toBeNull()
  })

  it('Edit checks opens the shipped path', async () => {
    act(() => navigate('/wallets/a/configure'))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit checks' }))
    expect(window.location.pathname).toBe('/wallets/a/checks')
  })
})

describe('the Checks plate wording', () => {
  const read = async (lock: Record<string, unknown>, wallet: Record<string, unknown> = {}) => {
    h.lockInfo.mockResolvedValue({ id: 'X', autoLockMinutes: 5, pin: true, passkey: false, ...lock })
    useAppStore.setState({ wallets: [W('a', 'X', wallet)] } as never)
    act(() => navigate('/wallets/a/configure'))
    mount()
    await screen.findByText('Open Check')
    return document.querySelector('[data-slot="config-plate"] dl')?.textContent ?? ''
  }

  it('uses the words the Edit checks screen uses', async () => {
    expect(await read({ openCheck: 'pin' })).toBe('Open CheckApp PINSigning CheckStandardNothing is asked for signing.')
  })

  it('No Open Check carries its sentence; a Signing Check names itself', async () => {
    expect(await read({ openCheck: 'none' }, { signingCheck: 'passkey' })).toBe(
      'Open CheckNo Open CheckNothing is asked to open the wallet. Testnet and Devnet only.Signing CheckPasskey only',
    )
  })

  it('a Passkey-Derived Seed reads Passkey only', async () => {
    expect(await read({ openCheck: 'passkey' }, { seedMethod: 'passkey-derived' })).toBe('Open CheckPasskeySigning CheckPasskey only')
  })

  it('a failed read is not shown as a check: it says so and offers Retry', async () => {
    h.lockInfo.mockRejectedValue(new Error('idb down'))
    act(() => navigate('/wallets/a/configure'))
    mount()
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.queryByText('Open Check')).toBeNull()
    expect(screen.queryByText('No Open Check')).toBeNull()
    h.lockInfo.mockResolvedValue({ id: 'X', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('App PIN')).toBeTruthy()
  })
})
