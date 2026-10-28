/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * "Erase everything" in Settings — the second caller of
 * `tearDownAllLocalState` (AD-16). It must leave no wallet label, address or
 * Address Book entry behind after its reload, and must not reload as though it
 * had when a clear failed. Unlike the Unlock reset, it locks on both outcomes.
 *
 * Real: `AppSettings`, `lib/teardown.ts`, the app store. Faked: the
 * persistence sink, the vault and keystore modules, the socket pool, the
 * update hook and the build stamp (compile-time globals this runner does not
 * define).
 */

const h = vi.hoisted(() => ({
  idb: new Map<string, string>(),
  wipeVault: vi.fn(async () => {}),
  listWallets: vi.fn(async (): Promise<unknown[]> => []),
  removeWallet: vi.fn(async (_id: string) => {}),
}))

vi.mock('idb-keyval', () => ({
  get: async (k: string) => h.idb.get(k),
  set: async (k: string, v: string) => void h.idb.set(k, v),
  del: async (k: string) => void h.idb.delete(k),
}))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: () => h.wipeVault() }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {}, getLockInfo: async () => ({ id: 'legacy', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }) }))
vi.mock('@/lib/crypto/keystore', () => ({
  addressFromSeed: () => '',
  generateAndStoreWallet: async () => {},
  importAndStoreWallet: async () => {},
  listWallets: () => h.listWallets(),
  removeWallet: (id: string) => h.removeWallet(id),
  revealSeed: async () => '',
}))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: async () => {} }))
vi.mock('@/lib/xrpl/query-reads', () => ({ fetchAccountStateOnce: async () => null }))
vi.mock('@/hooks/useAppUpdate', () => ({
  useAppUpdate: () => ({
    updateReady: false,
    applying: false,
    applyUpdate: () => {},
    checking: false,
    checkError: null,
    checkForUpdate: () => {},
    pendingRelease: null,
    blockedReason: null,
    declined: false,
    declineCurrent: () => {},
  }),
}))
vi.mock('@/lib/build-info', () => ({
  BUILD: { version: '0.0.0', commitSha: 'unknown-dev', builtAt: '' },
  shortSha: 'unknown',
  sourceUrl: 'https://example.invalid',
  formatBuiltAt: () => '',
}))

import { AppSettings } from '@/pages/AppSettings'
import { TooltipProvider } from '@/components/ui/tooltip'
import { APP_STATE_STORAGE_KEY, useAppStore } from '@/store/app-store'
import { useNoticeStore } from '@/store/notice-store'

const reload = vi.fn()
const flush = () => new Promise((r) => setTimeout(r, 0))
const PRECACHE = 'workbox-precache-v2-https://wallet.example/'

/** The shell: a Cache Storage holding the precache, and one service-worker
 * registration (jsdom has neither). */
function installShell() {
  const live = new Set([PRECACHE])
  const cacheStorage = {
    keys: vi.fn(async () => [...live]),
    delete: vi.fn(async (k: string) => live.delete(k)),
  }
  vi.stubGlobal('caches', cacheStorage)
  const registration = { unregister: vi.fn(async () => true) }
  const sw = { getRegistrations: vi.fn(async () => [registration]) }
  Object.defineProperty(window.navigator, 'serviceWorker', { value: sw, configurable: true })
  return { cacheStorage, live, sw, registration }
}

async function seedResidue() {
  const s = useAppStore.getState()
  s.setWallets([{ id: 'w1', seedId: 'w1', lockId: 'legacy', network: 'testnet', label: 'Savings', address: 'rAliceAddressLabelThatMustNotSurvive' } as never])
  s.setActiveWalletId('w1')
  s.addAddressBookEntry({ address: 'rBobCounterpartyThatMustNotSurvive', label: 'Bob — landlord' })
  useAppStore.setState({ openLocks: { legacy: { key: {} as CryptoKey, autoLockMinutes: 5 } } } as never)
  await flush()
  expect(h.idb.get(APP_STATE_STORAGE_KEY)).toContain('Bob — landlord')
}

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <AppSettings />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

async function confirmErase() {
  fireEvent.click(await screen.findByRole('button', { name: /remove all wallets from this device/i }))
  fireEvent.click(await screen.findByRole('button', { name: /erase everything/i }))
}

beforeEach(() => {
  h.idb.clear()
  h.wipeVault.mockReset().mockResolvedValue(undefined)
  h.listWallets.mockReset().mockResolvedValue([])
  h.removeWallet.mockReset().mockResolvedValue(undefined)
  reload.mockReset()
  vi.stubGlobal('location', { ...window.location, reload })
  useNoticeStore.setState({ notices: [] } as never)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (window.navigator as { serviceWorker?: unknown }).serviceWorker
})

describe('Settings — Erase everything', () => {
  it('locks and reloads with no wallet label, address or Address Book entry left in the persisted store', async () => {
    await seedResidue()
    renderSettings()

    await confirmErase()
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    await flush()

    const onDisk = h.idb.get(APP_STATE_STORAGE_KEY) ?? ''
    for (const residue of ['Savings', 'rAliceAddressLabelThatMustNotSurvive', 'rBobCounterpartyThatMustNotSurvive', 'Bob — landlord']) {
      expect(onDisk).not.toContain(residue)
    }
    expect(h.wipeVault).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().openLocks).toEqual({})
  })

  it('locks but does not reload as though the device were clean when a clear fails, and says so', async () => {
    await seedResidue()
    h.wipeVault.mockRejectedValueOnce(new Error('IDB blocked'))
    renderSettings()

    await confirmErase()
    await waitFor(() => expect(useNoticeStore.getState().notices.length).toBeGreaterThan(0))
    expect(JSON.stringify(useNoticeStore.getState().notices)).toMatch(/reset did not finish/i)
    expect(reload).not.toHaveBeenCalled()
    expect(useAppStore.getState().openLocks).toEqual({})
  })

  it('calls unregister on every service-worker registration and deletes every cache key', async () => {
    const { live, registration } = installShell()
    await seedResidue()
    renderSettings()

    await confirmErase()
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(registration.unregister).toHaveBeenCalledTimes(1)
    expect(live.size).toBe(0)
  })
})
