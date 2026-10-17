/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * G-13's strongest path: the hard-lock reset on the locked-Wallet view —
 * `wallet-security.md`'s only way forward after eight failed attempts — must
 * leave no wallet label, address or Address Book entry behind after its
 * reload, and must not reload as though it had when a clear failed.
 *
 * Real: the Unlock page, `lib/teardown.ts`, the app store. Faked: the
 * persistence sink, the vault module, the socket pool, and the build stamp
 * (compile-time globals this runner does not define).
 */

const h = vi.hoisted(() => ({
  idb: new Map<string, string>(),
  wipeVault: vi.fn(async () => {}),
  info: { id: 'legacy', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false } as Record<string, unknown>,
}))

vi.mock('idb-keyval', () => ({
  get: async (k: string) => h.idb.get(k),
  set: async (k: string, v: string) => void h.idb.set(k, v),
  del: async (k: string) => void h.idb.delete(k),
}))
vi.mock('@/lib/crypto/auth', () => ({
  wipeVault: () => h.wipeVault(),
  getLockoutState: async () => ({ hardLocked: true, lockedUntil: 0 }),
}))
vi.mock('@/lib/crypto/lock', () => ({
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
  getLockInfo: async () => h.info,
  openLock: async () => {
    throw new Error('not under test')
  },
}))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: async () => {} }))
vi.mock('@/lib/build-info', () => ({
  BUILD: { version: '0.0.0', commitSha: 'unknown-dev', builtAt: '' },
  shortSha: 'unknown',
  sourceUrl: 'https://example.invalid',
}))

import { Unlock } from '../Unlock'
import { APP_STATE_STORAGE_KEY, useAppStore } from '@/store/app-store'
import { useNoticeStore } from '@/store/notice-store'

const WALLET = { id: 'w1', seedId: 'w1', lockId: 'legacy', label: 'Savings', address: 'rA', createdAt: 1, network: 'mainnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' } as never
const reload = vi.fn()
const flush = () => new Promise((r) => setTimeout(r, 0))

async function seedResidue() {
  const s = useAppStore.getState()
  s.setWallets([{ id: 'w1', label: 'Savings', address: 'rAliceAddressLabelThatMustNotSurvive' } as never])
  s.setActiveWalletId('w1')
  s.addAddressBookEntry({ address: 'rBobCounterpartyThatMustNotSurvive', label: 'Bob — landlord' })
  await flush()
  expect(h.idb.get(APP_STATE_STORAGE_KEY)).toContain('Bob — landlord')
}

function renderUnlock() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <Unlock wallet={WALLET} />
    </QueryClientProvider>,
  )
}

async function confirmReset() {
  fireEvent.click(await screen.findByRole('button', { name: /reset this device and re-import/i }))
  fireEvent.click(await screen.findByRole('button', { name: /erase and reset/i }))
}

beforeEach(() => {
  h.idb.clear()
  h.wipeVault.mockReset().mockResolvedValue(undefined)
  reload.mockReset()
  vi.stubGlobal('location', { ...window.location, reload })
  useNoticeStore.setState({ notices: [] } as never)
  h.info = { id: 'legacy', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (window.navigator as { serviceWorker?: unknown }).serviceWorker
})

describe('Unlock — hard-lock reset', () => {
  it('reloads with no wallet label, address or Address Book entry left in the persisted store', async () => {
    await seedResidue()
    renderUnlock()
    await screen.findByText(/too many failed/i)

    await confirmReset()
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    await flush()

    const onDisk = h.idb.get(APP_STATE_STORAGE_KEY) ?? ''
    for (const residue of ['Savings', 'rAliceAddressLabelThatMustNotSurvive', 'rBobCounterpartyThatMustNotSurvive', 'Bob — landlord']) {
      expect(onDisk).not.toContain(residue)
    }
    expect(h.wipeVault).toHaveBeenCalledTimes(1)
  })

  it('calls unregister on every service-worker registration and deletes every cache key', async () => {
    const live = new Set(['workbox-precache-v2-https://wallet.example/'])
    vi.stubGlobal('caches', { keys: vi.fn(async () => [...live]), delete: vi.fn(async (k: string) => live.delete(k)) })
    const registration = { unregister: vi.fn(async () => true) }
    Object.defineProperty(window.navigator, 'serviceWorker', { value: { getRegistrations: vi.fn(async () => [registration]) }, configurable: true })
    renderUnlock()
    await screen.findByText(/too many failed/i)

    await confirmReset()
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(registration.unregister).toHaveBeenCalledTimes(1)
    expect(live.size).toBe(0)
  })

  it('does not reload as though the device were clean when a clear fails, and says so', async () => {
    h.wipeVault.mockRejectedValueOnce(new Error('IDB blocked'))
    renderUnlock()
    await screen.findByText(/too many failed/i)

    await confirmReset()
    await waitFor(() => expect(useNoticeStore.getState().notices.length).toBeGreaterThan(0))
    expect(JSON.stringify(useNoticeStore.getState().notices)).toMatch(/reset did not finish/i)
    expect(reload).not.toHaveBeenCalled()
  })

  it('a hard lock deletes nothing by itself, and a lock a passkey opens still offers the passkey', async () => {
    h.info = { id: 'legacy', openCheck: 'either', autoLockMinutes: 5, pin: true, passkey: true }
    renderUnlock()
    const message = await screen.findByText(/too many failed/i)
    expect(message.textContent).toMatch(/nothing has been erased/i)
    expect(message.textContent).not.toMatch(/delet|wipe|automatic/i)
    expect(await screen.findByRole('button', { name: /unlock with passkey/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /unlock with pin/i })).toBeNull()
    expect(h.wipeVault).not.toHaveBeenCalled()
  })

  it('shows only the wallet name — no address, balance or network — while locked', async () => {
    renderUnlock()
    await screen.findByText(/too many failed/i)
    expect(screen.getByRole('heading', { name: 'Savings' })).toBeTruthy()
    expect(screen.queryByText('rA')).toBeNull()
    expect(screen.queryByText(/mainnet/i)).toBeNull()
  })
})
