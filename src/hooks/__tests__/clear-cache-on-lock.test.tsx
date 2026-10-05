/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// `lock()` ends the persisted session; the vault is not under test here.
vi.mock('@/lib/crypto/auth', () => ({ endSession: async () => {}, wipeVault: async () => {} }))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))

import { useClearCacheOnLock } from '../useClearCacheOnLock'
import { useAppStore } from '@/store/app-store'
import { queryKeys } from '@/lib/xrpl/query-keys'

const KEY = queryKeys.accountState('testnet', 'rBoGUS9uiK9m3Kk6qnGRvWWCwAeN8hF3wR')

/**
 * G-14 / AD-16 at the hook: a lock clears the TanStack Query cache, where
 * account data lives, and leaves Cache Storage — the precached shell — alone,
 * so the app still opens offline and the update flow keeps its precache.
 */

afterEach(() => {
  vi.unstubAllGlobals()
  delete (window.navigator as { serviceWorker?: unknown }).serviceWorker
})

describe('useClearCacheOnLock', () => {
  it('clears the query cache on lock and never touches Cache Storage or the service-worker registration', async () => {
    const cacheStorage = { keys: vi.fn(async () => ['workbox-precache']), delete: vi.fn(async () => true), open: vi.fn() }
    vi.stubGlobal('caches', cacheStorage)
    const registration = { unregister: vi.fn(async () => true) }
    const sw = { getRegistrations: vi.fn(async () => [registration]) }
    Object.defineProperty(window.navigator, 'serviceWorker', { value: sw, configurable: true })
    useAppStore.setState({ unlocked: true } as never)

    const qc = new QueryClient()
    qc.setQueryData(KEY, { balanceDrops: '25000000' })
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    renderHook(() => useClearCacheOnLock(), { wrapper })
    expect(qc.getQueryData(KEY)).toBeDefined()

    await act(async () => {
      useAppStore.getState().lock()
    })

    expect(qc.getQueryData(KEY)).toBeUndefined()
    expect(cacheStorage.delete).not.toHaveBeenCalled()
    expect(cacheStorage.keys).not.toHaveBeenCalled()
    // The registration stays too: only a full reset unregisters it.
    expect(sw.getRegistrations).not.toHaveBeenCalled()
    expect(registration.unregister).not.toHaveBeenCalled()
  })
})
