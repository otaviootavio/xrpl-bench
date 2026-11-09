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
  toastResolve: vi.fn(),
  getInfoFails: false,
  proof: true,
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
// The Transmitter proof (story 4): a Seed lock has nothing to prove; `h.proof` lets a test fail it.
vi.mock('@/lib/crypto/transmitter-unlock', () => ({ proveTransmitterUnlock: async () => h.proof }))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: async () => {} }))
vi.mock('@/lib/notify', () => ({ toast: { error: (m: string) => h.toastError(m), success: vi.fn(), resolve: (a: string) => h.toastResolve(a) } }))
vi.mock('@/lib/build-info', () => ({
  BUILD: { version: '0.0.0', commitSha: 'unknown-dev', builtAt: '' },
  shortSha: 'unknown',
  sourceUrl: 'https://example.invalid',
}))

import { Unlock } from '../Unlock'
import { useAppStore } from '@/store/app-store'
import { navigate } from '@/lib/route'

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
  h.proof = true
  h.openLock.mockReset()
  h.toastError.mockReset()
  h.toastResolve.mockReset()
  h.lockout = { hardLocked: false, lockedUntil: 0 }
  useAppStore.setState({ openLocks: {}, wallets: [] })
  window.history.replaceState(null, '', '/')
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

  it('a Transmitter whose verifier does not decrypt under the key stays closed (OS-FR-3)', async () => {
    h.proof = false
    h.openLock.mockResolvedValue({ status: 'ok', value: { key: KEY, autoLockMinutes: 7 } })
    renderUnlock()
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /unlock with pin/i }))
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Unlock failed.'))
    expect(useAppStore.getState().openLocks).toEqual({})
    h.proof = true
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

  it('a new attempt takes back what the last one said, before it reports its own', async () => {
    h.openLock.mockResolvedValueOnce({ status: 'wrong-credential', kind: 'pin', triesRemaining: 6 })
    h.openLock.mockResolvedValueOnce({ status: 'ok', value: { key: KEY, autoLockMinutes: 7 } })
    renderUnlock()
    fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: /unlock with pin/i }))
    await waitFor(() => expect(h.toastError).toHaveBeenCalledTimes(1))
    expect(h.toastResolve).toHaveBeenCalledWith('unlock')
    fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /unlock with pin/i }))
    await waitFor(() => expect(useAppStore.getState().openLocks.L1).toBeTruthy())
    // The second attempt cleared the first one's notice before it succeeded.
    expect(h.toastResolve).toHaveBeenCalledTimes(2)
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

  describe('after a successful unlock: no return to the chooser (FR-82, FR-93)', () => {
    const view = (id: string, network: string) => ({ ...(WALLET as object), id, network })
    async function unlockWithPin() {
      h.openLock.mockResolvedValue({ status: 'ok', value: { key: KEY, autoLockMinutes: 7 } })
      renderUnlock()
      fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '123456' } })
      fireEvent.click(screen.getByRole('button', { name: /unlock with pin/i }))
      await waitFor(() => expect(useAppStore.getState().openLocks.L1).toBeDefined())
    }

    it('a Seed with one view stays in its shell', async () => {
      useAppStore.setState({ wallets: [view('w1', 'mainnet')] as never })
      navigate('/wallets/w1')
      await unlockWithPin()
      await new Promise((r) => setTimeout(r, 50))
      expect(window.location.pathname).toBe('/wallets/w1')
    })

    it('a Seed with several views stays on the Wallet that was opened', async () => {
      useAppStore.setState({ wallets: [view('w1', 'mainnet'), view('w2', 'testnet')] as never, activeWalletId: 'w1' })
      navigate('/wallets/w1')
      await unlockWithPin()
      await new Promise((r) => setTimeout(r, 50))
      expect(window.location.pathname).toBe('/wallets/w1')
      expect(useAppStore.getState().openLocks.L1).toBeDefined()
    })

    it('a controlled Wallet on a shared lock stays on the controlled Wallet', async () => {
      const controlled = { ...view('w2', 'testnet'), accountAddress: 'rControlled' }
      useAppStore.setState({ wallets: [view('w1', 'testnet'), controlled] as never, activeWalletId: 'w2' })
      navigate('/wallets/w2')
      h.openLock.mockResolvedValue({ status: 'ok', value: { key: KEY, autoLockMinutes: 7 } })
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
      render(
        <QueryClientProvider client={qc}>
          <Unlock wallet={controlled as never} />
        </QueryClientProvider>,
      )
      fireEvent.change(await screen.findByLabelText('PIN'), { target: { value: '123456' } })
      fireEvent.click(screen.getByRole('button', { name: /unlock with pin/i }))
      await waitFor(() => expect(useAppStore.getState().openLocks.L1).toBeDefined())
      await new Promise((r) => setTimeout(r, 50))
      expect(window.location.pathname).toBe('/wallets/w2')
    })

    it('a lock with no Open Check auto-opens and stays on the Wallet, no return to the chooser', async () => {
      h.info = { id: 'L1', openCheck: 'none', autoLockMinutes: 5, pin: false, passkey: false }
      h.openLock.mockResolvedValue({ status: 'ok', value: { key: KEY, autoLockMinutes: 5 } })
      useAppStore.setState({ wallets: [view('w1', 'mainnet'), view('w2', 'testnet')] as never })
      navigate('/wallets/w1')
      renderUnlock()
      await waitFor(() => expect(useAppStore.getState().openLocks.L1).toBeDefined())
      await new Promise((r) => setTimeout(r, 50))
      expect(window.location.pathname).toBe('/wallets/w1')
    })
  })
})
