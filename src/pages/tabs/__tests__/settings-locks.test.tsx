/** @vitest-environment jsdom */
import { createContext, useContext, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * AD-26 in Settings: a Wallet on a closed lock is a name, Remove and Reveal
 * need ITS lock open, "Lock now" and the auto-lock edit act on the active
 * Wallet's lock only, and a refused edit shows the policy's reason.
 */
const h = vi.hoisted(() => ({
  minutes: { X: 5, Y: 5 } as Record<string, number>,
  setLockAutoLock: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
  getLockInfo: async (id: string) => ({ id, openCheck: 'pin', autoLockMinutes: h.minutes[id], pin: true, passkey: false }),
}))
vi.mock('@/lib/crypto/keystore', () => ({
  addressFromSeed: () => '',
  generateAndStoreWallet: async () => {},
  importAndStoreWallet: async () => {},
  listWallets: async () => [],
  removeWallet: async () => {},
  revealSeed: async () => ({ status: 'cancelled' }),
  addNetworkView: async () => ({}),
  unavailablePrompts: { pin: async () => null },
  describeCheckFailure: () => 'x',
  setLockAutoLock: (id: string, m: number) => h.setLockAutoLock(id, m),
}))
vi.mock('@/lib/notify', () => ({ toast: { success: vi.fn(), error: (m: string) => h.toastError(m), warning: vi.fn() } }))
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
// Radix Select needs pointer APIs jsdom lacks: a plain stand-in with the same contract.
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
import { useAppStore } from '@/store/app-store'

const base = { createdAt: 1, algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard', network: 'testnet' }
const A = { ...base, id: 'a', seedId: 'a', lockId: 'X', label: 'Alpha', address: 'rAlphaAddr' }
const B = { ...base, id: 'b', seedId: 'b', lockId: 'Y', label: 'Beta', address: 'rBetaAddr' }
const OPEN = { key: {} as CryptoKey, autoLockMinutes: 5 }

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <SettingsTab />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  h.minutes = { X: 5, Y: 5 }
  h.setLockAutoLock.mockReset().mockResolvedValue({ ok: true })
  h.toastError.mockReset()
  useAppStore.setState({ wallets: [A, B], activeWalletId: 'a', openLocks: { X: OPEN } } as never)
})
afterEach(cleanup)

describe('Settings with two locks', () => {
  it('shows a closed Wallet as its name only: no address, no Reveal, no Remove', () => {
    renderSettings()
    expect(screen.getByText('Beta')).toBeTruthy()
    expect(screen.queryByText('rBetaAddr')).toBeNull()
    expect(screen.getByText('rAlphaAddr')).toBeTruthy()
    // Alpha (open) has Reveal and Remove; Beta (closed) does not: exactly one of each.
    expect(screen.getAllByRole('button', { name: 'Reveal seed' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Use this wallet' })).toBeTruthy()
  })

  it('"Lock now" closes only the active Wallet\'s lock', () => {
    useAppStore.setState({ openLocks: { X: OPEN, Y: OPEN } } as never)
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: 'Lock now' }))
    expect(Object.keys(useAppStore.getState().openLocks)).toEqual(['Y'])
  })
})

describe('Settings auto-lock', () => {
  it('a refusal shows the policy\'s reason and changes nothing', async () => {
    h.setLockAutoLock.mockResolvedValue({ ok: false, reason: 'A Mainnet wallet must auto-lock after at least 1 minute of inactivity.' })
    renderSettings()
    fireEvent.click(await screen.findByRole('button', { name: '15 minutes' }))
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith(expect.stringMatching(/at least 1 minute/)))
    expect(useAppStore.getState().openLocks.X.autoLockMinutes).toBe(5)
  })

  it('a success edits the active lock only and updates the store', async () => {
    useAppStore.setState({ openLocks: { X: OPEN, Y: { ...OPEN } } } as never)
    h.setLockAutoLock.mockImplementation(async (id: string, m: number) => {
      h.minutes[id] = m
      return { ok: true }
    })
    renderSettings()
    fireEvent.click(await screen.findByRole('button', { name: '15 minutes' }))
    await waitFor(() => expect(useAppStore.getState().openLocks.X.autoLockMinutes).toBe(15))
    expect(h.setLockAutoLock).toHaveBeenCalledWith('X', 15)
    expect(useAppStore.getState().openLocks.Y.autoLockMinutes).toBe(5)
  })
})
