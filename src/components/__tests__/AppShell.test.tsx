/** @vitest-environment jsdom */
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  mounts: { auto: 0, clear: 0 },
  unmounts: { auto: 0, clear: 0 },
  ended: [] as string[],
  endedAll: 0,
}))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({
  endLockSession: async (id: string) => void h.ended.push(id),
  endAllLockSessions: async () => void h.endedAll++,
  extendLockSession: async () => {},
}))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/components/AppHeader', () => ({ AppHeader: () => <header>wallet-header</header> }))
vi.mock('@/pages/Main', () => ({ Main: () => <p>content</p> }))
// Real hooks, wrapped so each mount and unmount is counted.
vi.mock('@/hooks/useAutoLock', async (orig) => {
  const real = await orig<typeof import('@/hooks/useAutoLock')>()
  return {
    useAutoLock: (id: string | null) => {
      useEffect(() => {
        h.mounts.auto++
        return () => void h.unmounts.auto++
      }, [])
      return real.useAutoLock(id)
    },
  }
})
vi.mock('@/hooks/useClearCacheOnLock', async (orig) => {
  const real = await orig<typeof import('@/hooks/useClearCacheOnLock')>()
  return {
    useClearCacheOnLock: () => {
      useEffect(() => {
        h.mounts.clear++
        return () => void h.unmounts.clear++
      }, [])
      return real.useClearCacheOnLock()
    },
  }
})

import { AppShell, walletInView } from '../AppShell'
import { useAppStore, lockRemainingMs } from '@/store/app-store'
import { navigate, resetToHome, leaveToChooser } from '@/lib/route'
import { queryKeys } from '@/lib/xrpl/query-keys'

const W = (id: string, lockId: string) =>
  ({ id, seedId: id, lockId, label: id, address: `r${id}`, createdAt: 1, network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' }) as never
const KEY = {} as CryptoKey
const ids = () => Object.keys(useAppStore.getState().openLocks).sort()

let qc = new QueryClient()
function mount() {
  return render(
    <QueryClientProvider client={qc}>
      <AppShell />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  h.mounts.auto = h.mounts.clear = h.unmounts.auto = h.unmounts.clear = 0
  h.ended.length = 0
  h.endedAll = 0
  qc = new QueryClient()
  window.history.replaceState(null, '', '/')
  useAppStore.setState({ wallets: [W('a', 'X')], activeWalletId: 'a', openLocks: {} } as never)
})
afterEach(() => {
  cleanup()
  useAppStore.getState().closeAllLocks()
  vi.useRealTimers()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

describe('AppShell mounts the lifecycle once, above the route switch (AD-31)', () => {
  it('both hooks stay mounted exactly once across chooser-side and wallet routes', () => {
    mount()
    expect(h.mounts).toEqual({ auto: 1, clear: 1 })
    act(() => navigate('/settings'))
    act(() => navigate('/wallets/a'))
    act(() => navigate('/wallets/a/configure'))
    act(() => resetToHome())
    expect(h.mounts).toEqual({ auto: 1, clear: 1 })
    expect(h.unmounts).toEqual({ auto: 0, clear: 0 })
  })

  it('a lock expires and backgrounding closes every lock while a chooser-side route shows', () => {
    useAppStore.getState().openLock('X', KEY, 1)
    mount()
    act(() => navigate('/settings'))
    act(() => void vi.advanceTimersByTime(61_000))
    expect(ids()).toEqual([])
    expect(h.ended).toEqual(['X'])

    act(() => useAppStore.getState().openLock('X', KEY, 5))
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    act(() => void vi.advanceTimersByTime(31_000))
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(ids()).toEqual([])
    expect(h.endedAll).toBe(1)
  })

  it('activity extends only the wallet entered: none on the chooser or settings, the active one in a wallet', () => {
    expect(walletInView({ screen: 'chooser' }, 'a')).toBeNull()
    expect(walletInView({ screen: 'settings' }, 'a')).toBeNull()
    expect(walletInView({ screen: 'wallet', walletId: 'a' }, 'a')).toBe('a')
    // INTERIM (Story 11): Add wallet is still launched from inside a wallet.
    expect(walletInView({ screen: 'add-wallet' }, 'a')).toBe('a')
    useAppStore.getState().openLock('X', KEY, 1)
    mount()
    act(() => void vi.advanceTimersByTime(40_000))
    act(() => void window.dispatchEvent(new Event('mousedown')))
    expect(lockRemainingMs('X')).toBe(20_000)
    act(() => navigate('/wallets/a'))
    act(() => void vi.advanceTimersByTime(10_000))
    act(() => void window.dispatchEvent(new Event('mousedown')))
    expect(lockRemainingMs('X')).toBe(60_000)
  })
})

describe('AppShell route switch and guards (AD-32, AD-36)', () => {
  it('chooser and settings render the Chooser with no wallet header; the skip link is first', () => {
    const { container } = mount()
    expect(screen.getByRole('heading', { level: 1, name: 'Wallets' })).toBeTruthy()
    expect(screen.queryByText('content')).toBeNull()
    expect(screen.queryByText('wallet-header')).toBeNull()
    expect(container.querySelector('a, button')?.textContent).toBe('Skip to content')
    expect(screen.getByText('XRPL Bench')).toBeTruthy()
    act(() => navigate('/settings'))
    expect(screen.getByRole('heading', { level: 1, name: 'Wallets' })).toBeTruthy()
  })

  it('a wallet route for the active, existing wallet renders the wallet content and header', () => {
    mount()
    act(() => navigate('/wallets/a'))
    expect(screen.getByText('content')).toBeTruthy()
    expect(screen.getByText('wallet-header')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Wallets' })).toBeNull()
  })

  it.each(['/wallets/zzz', '/wallets/b', '/wallets/zzz/configure', '/wallets/b/configure'])(
    'a mismatched deep link %s is reset to the chooser',
    (path) => {
      useAppStore.setState({ wallets: [W('a', 'X'), W('b', 'Y')] } as never)
      mount()
      act(() => navigate(path))
      expect(window.location.pathname).toBe('/')
      expect(screen.getByRole('heading', { level: 1, name: 'Wallets' })).toBeTruthy()
      expect(screen.queryByText('content')).toBeNull()
    },
  )

  it('an active id that is not a wallet is reset too', () => {
    useAppStore.setState({ activeWalletId: 'gone' } as never)
    mount()
    act(() => navigate('/wallets/gone'))
    expect(window.location.pathname).toBe('/')
  })

  it('add-wallet and task screens keep the wallet content and header', () => {
    mount()
    act(() => navigate('/wallets/new'))
    expect(screen.getByText('content')).toBeTruthy()
    expect(screen.getByText('wallet-header')).toBeTruthy()
    act(() => navigate('/wallets/a/checks'))
    expect(screen.getByText('content')).toBeTruthy()
  })
})

describe('leaving a wallet for the chooser (AD-38, UX-DR10)', () => {
  const seed = () => qc.setQueryData(queryKeys.accountState('testnet', 'ra'), { v: 1 })
  const cached = () => qc.getQueryData(queryKeys.accountState('testnet', 'ra'))

  it('removes the left wallet\'s account data, keeps its lock open, and focuses the Wallets h1', () => {
    useAppStore.getState().openLock('X', KEY, 5)
    mount()
    act(() => navigate('/wallets/a'))
    seed()
    act(() => leaveToChooser())
    act(() => void vi.advanceTimersByTime(50))
    expect(cached()).toBeUndefined()
    expect(ids()).toEqual(['X'])
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1, name: 'Wallets' }))
  })

  it('Back (history.go) does the same', async () => {
    useAppStore.getState().openLock('X', KEY, 5)
    mount()
    act(() => navigate('/wallets/a'))
    seed()
    vi.useRealTimers()
    act(() => window.history.back())
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(cached()).toBeUndefined()
  })

  it('keeps the entries another open lock\'s wallet still holds for the same account', () => {
    useAppStore.setState({ wallets: [W('a', 'X'), { ...(W('b', 'Y') as object), address: 'ra' }] } as never)
    useAppStore.getState().openLock('X', KEY, 5)
    useAppStore.getState().openLock('Y', KEY, 5)
    mount()
    act(() => navigate('/wallets/a'))
    seed()
    act(() => leaveToChooser())
    act(() => void vi.advanceTimersByTime(50))
    expect(window.location.pathname).toBe('/')
    expect(cached()).toEqual({ v: 1 })
  })

  it('a cold start at the chooser moves no focus and removes nothing', () => {
    seed()
    mount()
    expect(document.activeElement).toBe(document.body)
    expect(cached()).toEqual({ v: 1 })
  })
})
