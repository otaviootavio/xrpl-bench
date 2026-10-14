/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The locked-Wallet view opens ONE lock — the Wallet's — with the method that
 * lock accepts, and a lock with no Open Check opens with no prompt (AD-26).
 */
const h = vi.hoisted(() => ({
  info: {} as Record<string, unknown>,
  openLock: vi.fn(),
  lockout: { hardLocked: false, lockedUntil: 0 },
  toastError: vi.fn(),
  getInfoFails: false,
}))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {}, getLockoutState: async () => h.lockout }))
vi.mock('@/lib/crypto/lock', () => ({
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
  getLockInfo: async () => {
    if (h.getInfoFails) throw new Error('read failed')
    return h.info
  },
  openLock: (...a: unknown[]) => h.openLock(...a),
}))
vi.mock('@/lib/crypto/keystore', () => ({
  describeCheckFailure: (r: { status: string; triesRemaining?: number }) =>
    r.status === 'wrong-credential' ? `Incorrect PIN. ${r.triesRemaining} tries remaining. Nothing was signed.` : 'locked',
}))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: async () => {} }))
vi.mock('@/lib/notify', () => ({ toast: { error: (m: string) => h.toastError(m), success: vi.fn() } }))
vi.mock('@/lib/build-info', () => ({
  BUILD: { version: '0.0.0', commitSha: 'unknown-dev', builtAt: '' },
  shortSha: 'unknown',
  sourceUrl: 'https://example.invalid',
}))

import { Unlock } from '../Unlock'
import { useAppStore } from '@/store/app-store'

const WALLET = { id: 'w1', seedId: 'w1', lockId: 'L1', label: 'Savings', address: 'rA', createdAt: 1, network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' } as never
const KEY = {} as CryptoKey

function renderUnlock() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <Unlock wallet={WALLET} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  h.info = { id: 'L1', openCheck: 'pin', autoLockMinutes: 7, pin: true, passkey: false }
  h.openLock.mockReset()
  h.toastError.mockReset()
  h.lockout = { hardLocked: false, lockedUntil: 0 }
  useAppStore.setState({ openLocks: {} })
})
afterEach(cleanup)

describe('the locked-Wallet view', () => {
  it('opens its own lock with the PIN and records the lock open with its own minutes', async () => {
    h.openLock.mockResolvedValue({ status: 'ok', value: { key: KEY, autoLockMinutes: 7 } })
    renderUnlock()
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /unlock with pin/i }))
    await waitFor(() => expect(useAppStore.getState().openLocks.L1).toEqual({ key: KEY, autoLockMinutes: 7 }))
    expect(h.openLock).toHaveBeenCalledWith('L1', 'pin', { pin: '123456' })
  })

  it('says how many tries remain on a wrong PIN and stays closed', async () => {
    h.openLock.mockResolvedValue({ status: 'wrong-credential', kind: 'pin', triesRemaining: 6 })
    renderUnlock()
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: /unlock with pin/i }))
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Incorrect PIN. 6 tries remaining.'))
    expect(useAppStore.getState().openLocks).toEqual({})
  })

  it('announces a failed lock read as an alert, and the wait as a status', async () => {
    h.getInfoFails = true
    renderUnlock()
    expect(screen.getByRole('status').textContent).toContain('Checking')
    expect((await screen.findByRole('alert')).textContent).toContain('could not be read')
    h.getInfoFails = false
  })

  it('a passkey-only lock shows the passkey button and no PIN field; a cancelled prompt leaves it closed', async () => {
    h.info = { id: 'L1', openCheck: 'passkey', autoLockMinutes: 5, pin: false, passkey: true }
    h.openLock.mockResolvedValue({ status: 'cancelled' })
    renderUnlock()
    fireEvent.click(await screen.findByRole('button', { name: /unlock with passkey/i }))
    await waitFor(() => expect(h.openLock).toHaveBeenCalledWith('L1', 'passkey', { pin: undefined }))
    await waitFor(() => expect(h.toastError).toHaveBeenCalled())
    expect(screen.queryByLabelText('PIN')).toBeNull()
    expect(useAppStore.getState().openLocks).toEqual({})
  })

  it('a hard lock does not hide a passkey-only lock\'s button', async () => {
    h.info = { id: 'L1', openCheck: 'passkey', autoLockMinutes: 5, pin: false, passkey: true }
    h.lockout = { hardLocked: true, lockedUntil: 0 }
    renderUnlock()
    expect(await screen.findByRole('button', { name: /unlock with passkey/i })).toBeTruthy()
    expect(screen.queryByText(/too many failed/i)).toBeNull()
  })

  it('a lock with no Open Check opens with no prompt', async () => {
    h.info = { id: 'L1', openCheck: 'none', autoLockMinutes: 5, pin: false, passkey: false }
    h.openLock.mockResolvedValue({ status: 'ok', value: { key: KEY, autoLockMinutes: 5 } })
    renderUnlock()
    await waitFor(() => expect(useAppStore.getState().openLocks.L1).toBeDefined())
    expect(h.openLock).toHaveBeenCalledWith('L1', 'none')
    expect(screen.queryByLabelText('PIN')).toBeNull()
  })

  it('a failed read of the lock is shown as an error with Retry, not as an empty form', async () => {
    h.getInfoFails = true
    renderUnlock()
    expect(await screen.findByText(/could not be read/i)).toBeTruthy()
    expect(screen.queryByLabelText('PIN')).toBeNull()
    h.getInfoFails = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByLabelText('PIN')).toBeTruthy()
  })

  it('a failed auto-open of a no-Open-Check lock is shown, with Retry, and does not throw', async () => {
    h.info = { id: 'L1', openCheck: 'none', autoLockMinutes: 5, pin: false, passkey: false }
    h.openLock.mockRejectedValueOnce(new Error('idb gone'))
    renderUnlock()
    expect(await screen.findByText(/could not be opened/i)).toBeTruthy()
    h.openLock.mockResolvedValue({ status: 'ok', value: { key: KEY, autoLockMinutes: 5 } })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(useAppStore.getState().openLocks.L1).toBeDefined())
  })
})
