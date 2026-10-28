/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Chooser Settings key, `/settings`, and the update marker (chooser story 7,
 * AD-36). Real: AppShell, SettingsScreen, AppSettings, the marker hook,
 * teardown, the app store. Faked: persistence, the vault, the socket pool, the
 * update hook, the wallet-side surfaces and the build stamp.
 */
const h = vi.hoisted(() => ({
  update: { updateReady: false, declined: false },
  getXrplClient: vi.fn(),
  wipeVault: vi.fn(async () => {}),
  walletHooks: vi.fn(),
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: () => h.wipeVault() }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {}, extendLockSession: async () => {} }))
vi.mock('@/lib/xrpl/client', () => ({ getXrplClient: h.getXrplClient, disconnectAllClients: async () => {} }))
vi.mock('@/lib/xrpl/query-reads', () => ({ fetchAccountStateOnce: async () => null }))
vi.mock('@/components/AppHeader', () => ({ AppHeader: () => <header>wallet-header</header> }))
vi.mock('@/pages/Main', () => ({ Main: () => <p>wallet-content</p> }))
vi.mock('@/store/app-store', async (orig) => {
  const real = await orig<typeof import('@/store/app-store')>()
  return {
    ...real,
    useActiveWallet: () => (h.walletHooks('useActiveWallet'), real.useActiveWallet()),
    useActiveNetwork: () => (h.walletHooks('useActiveNetwork'), real.useActiveNetwork()),
    useActiveNode: () => (h.walletHooks('useActiveNode'), real.useActiveNode()),
  }
})
vi.mock('@/hooks/useAppUpdate', () => ({
  useAppUpdate: () => ({
    ...h.update,
    applying: false,
    applyUpdate: () => {},
    checking: false,
    checkError: false,
    checkForUpdate: () => {},
    pendingRelease: null,
    blockedReason: null,
    declineCurrent: () => {},
  }),
}))
vi.mock('@/lib/build-info', () => ({
  BUILD: { version: '0.0.0', commitSha: 'x', builtAt: '' },
  shortSha: 'x',
  sourceUrl: 'https://example.invalid',
  formatBuiltAt: () => '',
}))

import { AppShell } from '../AppShell'
import { Main } from '@/pages/Main'
import { useAppStore } from '@/store/app-store'
import { useNoticeStore } from '@/store/notice-store'
import { navigate } from '@/lib/route'
import { useUpdateMarker } from '@/hooks/useUpdateMarker'

const W = (id: string, lockId: string, openCheck = 'pin') =>
  ({ id, seedId: id, lockId, label: id, address: `r${id}`, createdAt: 1, network: 'testnet', algorithm: 'ed25519', openCheck, signingCheck: 'standard' }) as never

let qc = new QueryClient()
const flush = () => new Promise((r) => setTimeout(r, 0))
function mount() {
  return render(
    <QueryClientProvider client={qc}>
      <AppShell />
    </QueryClientProvider>,
  )
}
const reload = vi.fn()

beforeEach(() => {
  h.update = { updateReady: false, declined: false }
  h.getXrplClient.mockReset()
  h.wipeVault.mockReset().mockResolvedValue(undefined)
  h.walletHooks.mockReset()
  reload.mockReset()
  const real = window.location
  vi.stubGlobal('location', { get pathname() { return real.pathname }, get search() { return real.search }, get hash() { return real.hash }, reload })
  qc = new QueryClient()
  window.history.replaceState(null, '', '/')
  useNoticeStore.setState({ notices: [] } as never)
  useAppStore.setState({ wallets: [W('a', 'X')], activeWalletId: 'a', openLocks: {} } as never)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useAppStore.getState().closeAllLocks()
})

describe('the Chooser header Settings key', () => {
  it('shows the nameplate and a Settings key', () => {
    mount()
    expect(screen.getByText('XRPL Bench')).toBeTruthy()
    const key = screen.getByRole('button', { name: 'Settings' })
    expect(key.textContent).toBe('Settings')
  })

  it('reads "Settings, update available" as text and name when an update waits', () => {
    h.update = { updateReady: true, declined: false }
    mount()
    const key = screen.getByRole('button', { name: 'Settings, update available' })
    expect(key.textContent).toBe('Settings, update available')
  })

  it('a declined release does not relight it', () => {
    h.update = { updateReady: true, declined: true }
    mount()
    expect(screen.getByRole('button', { name: 'Settings' }).textContent).toBe('Settings')
  })

  it('opens /settings: h1 Settings, the app-level plates, a Wallets back key; Back returns to the chooser', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(window.location.pathname).toBe('/settings')
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    await waitFor(() => expect(document.activeElement?.id).toBe('settings-heading')) // the pressed key unmounted
    for (const t of ['Address book', 'Version']) expect(screen.getByRole('heading', { name: t })).toBeTruthy()
    expect(screen.getByRole('button', { name: /remove all wallets from this device/i })).toBeTruthy()
    // The key is the chooser's; the settings screen offers the Wallets back key instead.
    expect(screen.queryByRole('button', { name: 'Settings' })).toBeNull()
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Wallets' })))
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(screen.getByRole('heading', { level: 1, name: 'Wallets' })).toBeTruthy()
    await waitFor(() => expect(document.activeElement?.id).toBe('chooser-heading'))
  })
})

describe('one marker predicate', () => {
  function Probe() {
    return <span>{useUpdateMarker() ? 'lit' : 'dark'}</span>
  }
  it.each([
    [{ updateReady: false, declined: false }, 'dark'],
    [{ updateReady: true, declined: false }, 'lit'],
    [{ updateReady: true, declined: true }, 'dark'],
  ])('%j is %s', (state, word) => {
    h.update = state
    render(<Probe />)
    expect(screen.getByText(word)).toBeTruthy()
  })

  it('the in-wallet Settings tab marker and the chooser key agree', async () => {
    // Main reads the same hook: the real Main is not loaded here, so its source is pinned instead.
    const { readFileSync } = await import('node:fs')
    const main = readFileSync(`${process.cwd()}/src/pages/Main.tsx`, 'utf8')
    expect(main).toContain("useUpdateMarker } from '@/hooks/useUpdateMarker'")
    expect(main).not.toMatch(/updateReady\s*&&\s*!declined/)
    expect(typeof Main).toBe('function')
  })
})

describe('/settings reads no wallet and no ledger (AD-36)', () => {
  it('with open locks: query cache empty, no client, no NetworkPlate, no useActive*, no per-wallet content', () => {
    useAppStore.getState().openLock('X', {} as CryptoKey, 5)
    window.history.replaceState(null, '', '/')
    mount()
    h.walletHooks.mockClear()
    act(() => navigate('/settings'))
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    expect(qc.getQueryCache().getAll()).toHaveLength(0)
    expect(h.getXrplClient).not.toHaveBeenCalled()
    expect(h.walletHooks).not.toHaveBeenCalled()
    expect(screen.queryByText('wallet-content')).toBeNull()
    expect(screen.queryByText(/auto-lock/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /lock now/i })).toBeNull()
    expect(screen.queryByText(/^testnet$/i)).toBeNull()
  })

  it('the in-wallet tab and /settings are never mounted together', () => {
    mount()
    act(() => navigate('/settings'))
    // `Main` (the tab's owner) is chooser-side absent: one copy of the component, the one /settings mounts.
    expect(screen.queryByText('wallet-content')).toBeNull()
    expect(screen.getAllByRole('heading', { name: 'Version' })).toHaveLength(1)
  })
})

describe('Remove all wallets from this device from /settings', () => {
  async function erase() {
    fireEvent.click(await screen.findByRole('button', { name: /remove all wallets from this device/i }))
    fireEvent.click(await screen.findByRole('button', { name: /erase everything/i }))
  }

  it('completes with no lock open', async () => {
    mount()
    act(() => navigate('/settings'))
    await erase()
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(h.wipeVault).toHaveBeenCalledTimes(1)
  })

  it('completes with a PIN wallet and no lock open: it needs no lock and no PIN', async () => {
    useAppStore.setState({ wallets: [W('a', 'X', 'pin')], activeWalletId: 'a', openLocks: {} } as never)
    mount()
    act(() => navigate('/settings'))
    await erase()
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    await flush()
    expect(useAppStore.getState().wallets).toEqual([])
  })

  it('says the reset is incomplete and does not reload when a clear fails', async () => {
    h.wipeVault.mockRejectedValueOnce(new Error('IDB blocked'))
    mount()
    act(() => navigate('/settings'))
    await erase()
    await waitFor(() => expect(useNoticeStore.getState().notices.length).toBeGreaterThan(0))
    expect(JSON.stringify(useNoticeStore.getState().notices)).toMatch(/reset did not finish/i)
    expect(reload).not.toHaveBeenCalled()
  })
})
