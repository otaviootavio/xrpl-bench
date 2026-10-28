/** @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react'
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
vi.mock('@/components/AppHeader', () => ({ AppHeader: () => <header /> }))
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
import { navigate, resetToHome } from '@/lib/route'

const W = (id: string, lockId: string) =>
  ({ id, seedId: id, lockId, label: id, address: `r${id}`, createdAt: 1, network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' }) as never
const KEY = {} as CryptoKey
const ids = () => Object.keys(useAppStore.getState().openLocks).sort()

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppShell />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  h.mounts.auto = h.mounts.clear = h.unmounts.auto = h.unmounts.clear = 0
  h.ended.length = 0
  h.endedAll = 0
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

  it('interim: activity extends the wallet in view, which is the active one on every route', () => {
    expect(walletInView({ screen: 'chooser' }, 'a')).toBe('a')
    useAppStore.getState().openLock('X', KEY, 1)
    mount()
    act(() => navigate('/settings'))
    act(() => void vi.advanceTimersByTime(40_000))
    act(() => void window.dispatchEvent(new Event('mousedown')))
    expect(lockRemainingMs('X')).toBe(60_000)
  })
})
