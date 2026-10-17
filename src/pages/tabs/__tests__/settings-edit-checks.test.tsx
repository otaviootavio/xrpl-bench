/** @vitest-environment jsdom */
import { createContext, useContext, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Story 8 in Settings: "Edit checks" is offered only for a Wallet whose lock is
 * open; the auto-lock edit goes through the keystore with the prompts (so the
 * Open Check is re-passed); and after a committed edit that moved the Wallet to a
 * new lock, Settings closes the old lock, opens the new one and starts its session.
 */
const h = vi.hoisted(() => ({
  setLockAutoLock: vi.fn(),
  startLockSession: vi.fn(async () => {}),
  listed: [] as unknown[],
  edited: null as unknown,
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
  getLockInfo: async (id: string) => ({ id, openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }),
  startLockSession: (...a: unknown[]) => h.startLockSession(...(a as [])),
}))
vi.mock('@/lib/crypto/keystore', () => ({
  addressFromSeed: () => '',
  importAndStoreWallet: async () => {},
  listWallets: async () => h.listed,
  removeWallet: async () => {},
  revealSeed: async () => ({ status: 'cancelled' }),
  addNetworkView: async () => ({}),
  unavailablePrompts: { pin: async () => null },
  describeCheckFailure: () => 'x',
  setLockAutoLock: (...a: unknown[]) => h.setLockAutoLock(...a),
}))
// The dialog has its own test: here it is a stand-in that reports the committed edit.
vi.mock('@/components/wallet/EditChecksDialog', () => ({
  EditChecksDialog: ({ wallet, onEdited }: { wallet: { id: string } | null; onEdited: (e: unknown) => void }) =>
    wallet ? <button onClick={() => void Promise.resolve(onEdited(h.edited)).catch(() => {})}>commit edit for {wallet.id}</button> : null,
}))
vi.mock('@/lib/notify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: async () => {} }))
vi.mock('@/lib/xrpl/query-reads', () => ({ fetchAccountStateOnce: async () => null }))
vi.mock('@/hooks/useAppUpdate', () => ({
  useAppUpdate: () => ({
    updateReady: false, applying: false, applyUpdate: () => {}, checking: false, checkError: null,
    checkForUpdate: () => {}, pendingRelease: null, blockedReason: null, declined: false, declineCurrent: () => {},
  }),
}))
vi.mock('@/lib/build-info', () => ({
  BUILD: { version: '0.0.0', commitSha: 'unknown-dev', builtAt: '' },
  shortSha: 'unknown',
  sourceUrl: 'https://example.invalid',
  formatBuiltAt: () => '',
}))
const Ctx = createContext<(v: string) => void>(() => {})
vi.mock('@/components/ui/select', () => ({
  Select: ({ onValueChange, children }: { onValueChange?: (v: string) => void; children: ReactNode }) => (
    <Ctx.Provider value={onValueChange ?? (() => {})}>{children}</Ctx.Provider>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => {
    const on = useContext(Ctx)
    return <button onClick={() => on(value)}>{children}</button>
  },
}))

import { SettingsTab } from '../SettingsTab'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PromptsContext } from '@/hooks/usePrompts'
import { useAppStore } from '@/store/app-store'

const base = { createdAt: 1, algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard', network: 'testnet' }
const A = { ...base, id: 'a', seedId: 'a', lockId: 'X', label: 'Alpha', address: 'rAlphaAddr' }
const B = { ...base, id: 'b', seedId: 'b', lockId: 'Y', label: 'Beta', address: 'rBetaAddr' }
const OPEN = { key: {} as CryptoKey, autoLockMinutes: 5 }
const PROMPTS = { pin: async () => '123456' }

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <PromptsContext.Provider value={PROMPTS}>
        <TooltipProvider>
          <SettingsTab />
        </TooltipProvider>
      </PromptsContext.Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  h.setLockAutoLock.mockReset().mockResolvedValue({ ok: true })
  h.startLockSession.mockClear()
  h.listed = []
  h.edited = null
  useAppStore.setState({ wallets: [A, B], activeWalletId: 'a', openLocks: { X: OPEN } } as never)
})
afterEach(cleanup)

describe('Settings: Edit checks', () => {
  it('is offered only for a Wallet whose lock is open', () => {
    renderSettings()
    expect(screen.getAllByRole('button', { name: 'Edit checks' })).toHaveLength(1)
  })

  it('the auto-lock edit passes the prompts, so the Open Check can be re-passed', async () => {
    renderSettings()
    fireEvent.click(await screen.findByRole('button', { name: '15 minutes' }))
    await waitFor(() => expect(h.setLockAutoLock).toHaveBeenCalled())
    expect(h.setLockAutoLock.mock.calls[0].slice(0, 2)).toEqual(['X', 15])
    expect(h.setLockAutoLock.mock.calls[0][2]).toEqual({ prompts: PROMPTS })
  })

  it('after a lock change: the new lock opens with its session, the old one closes', async () => {
    const KEY = { type: 'new-key' } as unknown as CryptoKey
    const moved = { ...A, lockId: 'Z', openCheck: 'passkey' }
    h.listed = [moved, B]
    h.edited = { meta: moved, changed: true, previousLockId: 'X', openKey: KEY, autoLockMinutes: 5, previousLockRemoved: true }
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Edit checks' }))
    fireEvent.click(await screen.findByRole('button', { name: /commit edit for a/ }))
    await waitFor(() => expect(Object.keys(useAppStore.getState().openLocks)).toEqual(['Z']))
    expect(h.startLockSession).toHaveBeenCalledWith('Z', KEY, 5)
    expect(useAppStore.getState().openLocks.Z.key).toBe(KEY)
    expect(useAppStore.getState().wallets.find((w) => w.id === 'a')?.lockId).toBe('Z')
  })

  it('leaving the shared legacy lock does not close it', async () => {
    const KEY = { type: 'new-key' } as unknown as CryptoKey
    const legacyA = { ...A, lockId: 'legacy' }
    const moved = { ...A, lockId: 'Z' }
    useAppStore.setState({ wallets: [legacyA, B], openLocks: { legacy: OPEN } } as never)
    h.listed = [moved, B]
    h.edited = { meta: moved, changed: true, previousLockId: 'legacy', openKey: KEY, autoLockMinutes: 5, previousLockRemoved: false }
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Edit checks' }))
    fireEvent.click(await screen.findByRole('button', { name: /commit edit for a/ }))
    await waitFor(() => expect(Object.keys(useAppStore.getState().openLocks).sort()).toEqual(['Z', 'legacy']))
  })

  it('an auto-lock-only edit updates that lock\'s window and starts no session and closes no lock', async () => {
    useAppStore.setState({ openLocks: { X: OPEN, Y: OPEN } } as never)
    h.edited = { meta: A, changed: true, previousLockId: 'X', autoLockMinutes: 15, previousLockRemoved: false }
    h.listed = [A, B]
    renderSettings()
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit checks' })[0])
    fireEvent.click(await screen.findByRole('button', { name: /commit edit for a/ }))
    await waitFor(() => expect(useAppStore.getState().openLocks.X.autoLockMinutes).toBe(15))
    expect(h.startLockSession).not.toHaveBeenCalled()
    expect(Object.keys(useAppStore.getState().openLocks).sort()).toEqual(['X', 'Y'])
  })

  it('closes the removed old lock even when a later step fails', async () => {
    const KEY = { type: 'new-key' } as unknown as CryptoKey
    h.startLockSession.mockRejectedValueOnce(new Error('idb down'))
    h.edited = { meta: { ...A, lockId: 'Z' }, changed: true, previousLockId: 'X', openKey: KEY, autoLockMinutes: 5, previousLockRemoved: true }
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Edit checks' }))
    fireEvent.click(await screen.findByRole('button', { name: /commit edit for a/ }))
    await waitFor(() => expect(useAppStore.getState().openLocks.X).toBeUndefined())
  })
})
