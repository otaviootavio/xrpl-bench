/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ order: [] as string[] }))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {}, extendLockSession: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/teardown', async (orig) => {
  const real = await orig<typeof import('@/lib/teardown')>()
  return { ...real, tearDownLock: (...a: Parameters<typeof real.tearDownLock>) => (h.order.push('teardown'), real.tearDownLock(...a)) }
})
vi.mock('@/lib/route', async (orig) => {
  const real = await orig<typeof import('@/lib/route')>()
  return { ...real, leaveToChooser: () => (h.order.push('leave'), real.leaveToChooser()) }
})

import { AppHeader } from '../AppHeader'
import { useAppStore } from '@/store/app-store'
import { blockLeaving, navigate } from '@/lib/route'

const W = (id: string, lockId: string, openCheck = 'pin') =>
  ({ id, seedId: id, lockId, label: id, address: `r${id}`, createdAt: 1, network: 'testnet', algorithm: 'ed25519', openCheck, signingCheck: 'standard' }) as never
const OPEN = { key: {} as CryptoKey, autoLockMinutes: 5 }

function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppHeader />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  h.order.length = 0
  window.history.replaceState(null, '', '/')
})
afterEach(() => cleanup())

describe('the wallet header (AD-45)', () => {
  it('open lock: nameplate, Wallets key, network and Lock; no picker', () => {
    useAppStore.setState({ wallets: [W('a', 'X'), W('b', 'Y')], activeWalletId: 'a', openLocks: { X: OPEN, Y: OPEN } } as never)
    mount()
    expect(screen.getByText('XRPL Bench')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Wallets' })).toBeTruthy()
    expect(screen.getByText('Testnet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lock wallet' })).toBeTruthy()
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('open lock with no Open Check has no Lock key', () => {
    useAppStore.setState({ wallets: [W('a', 'X', 'none')], activeWalletId: 'a', openLocks: { X: OPEN } } as never)
    mount()
    expect(screen.queryByRole('button', { name: 'Lock wallet' })).toBeNull()
  })

  it('closed lock: the Wallets key alone', () => {
    useAppStore.setState({ wallets: [W('a', 'X')], activeWalletId: 'a', openLocks: {} } as never)
    mount()
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Wallets'])
    expect(screen.queryByText('Testnet')).toBeNull()
  })

  it('the Wallets key leaves to the chooser and never closes the lock', async () => {
    useAppStore.setState({ wallets: [W('a', 'X')], activeWalletId: 'a', openLocks: { X: OPEN } } as never)
    act(() => navigate('/wallets/a'))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Wallets' }))
    expect(h.order).toEqual(['leave'])
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(Object.keys(useAppStore.getState().openLocks)).toEqual(['X'])
  })

  it('a blocked key is aria-disabled with its reason visible, and does nothing', () => {
    useAppStore.setState({ wallets: [W('a', 'X')], activeWalletId: 'a', openLocks: { X: OPEN } } as never)
    act(() => navigate('/wallets/a'))
    mount()
    let release = () => {}
    act(() => {
      release = blockLeaving()
    })
    const key = screen.getByRole('button', { name: 'Wallets' })
    expect(key.getAttribute('aria-disabled')).toBe('true')
    expect(key.hasAttribute('disabled')).toBe(false)
    expect(screen.getByText('Finish or cancel what is running first.')).toBeTruthy()
    fireEvent.click(key)
    expect(h.order).toEqual([])
    expect(window.location.pathname).toBe('/wallets/a')
    act(() => release())
    expect(screen.queryByText('Finish or cancel what is running first.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Wallets' }).getAttribute('aria-disabled')).toBeNull()
  })

  it('Lock tears the lock down, then leaves, in that order', () => {
    useAppStore.setState({ wallets: [W('a', 'X')], activeWalletId: 'a', openLocks: { X: OPEN } } as never)
    act(() => navigate('/wallets/a'))
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Lock wallet' }))
    expect(h.order).toEqual(['teardown', 'leave'])
    expect(Object.keys(useAppStore.getState().openLocks)).toEqual([])
  })

  it('while a screen blocks leaving, Lock waits too: aria-disabled, and the lock stays open', () => {
    useAppStore.setState({ wallets: [W('a', 'X')], activeWalletId: 'a', openLocks: { X: OPEN } } as never)
    act(() => navigate('/wallets/a'))
    mount()
    let release = () => {}
    act(() => {
      release = blockLeaving()
    })
    try {
      const key = screen.getByRole('button', { name: 'Lock wallet' })
      expect(key.getAttribute('aria-disabled')).toBe('true')
      fireEvent.click(key)
      expect(h.order).toEqual([])
      expect(Object.keys(useAppStore.getState().openLocks)).toEqual(['X'])
    } finally {
      act(() => release())
    }
  })
})
