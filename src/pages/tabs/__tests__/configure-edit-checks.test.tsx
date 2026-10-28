/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The Configure counterpart of `settings-edit-checks.test.tsx` (test design R12):
 * Edit checks is offered by the Checks plate, the committed edit swaps the lock the
 * same way, and Back from the task screen says `Back to Configure` and returns to
 * Configure; opened from the Settings tab the label stays `Settings`.
 * The auto-lock Select scenario of that file moves with auto-lock itself (Story 16).
 */
const h = vi.hoisted(() => ({
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
  setLockAutoLock: async () => ({ ok: true }),
}))
// The screen has its own test: here it is a stand-in on the real TaskScreen that reports the committed edit.
vi.mock('@/components/wallet/EditChecksScreen', async () => {
  const { TaskScreen } = await import('@/components/wallet/TaskScreen')
  return {
    EditChecksScreen: ({ wallet, onEdited, onClose, backLabel }: { wallet: { id: string }; onEdited: (e: unknown) => void; onClose: () => void; backLabel?: string }) => (
      <TaskScreen title="Edit checks" backLabel={backLabel} onBack={onClose}>
        <button onClick={() => void Promise.resolve(onEdited(h.edited)).catch(() => {})}>commit edit for {wallet.id}</button>
      </TaskScreen>
    ),
  }
})
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

import { SettingsTab } from '../SettingsTab'
import { WalletScreens } from '../../WalletScreens'
import { ConfigureScreen } from '@/components/wallet/ConfigureScreen'
import { useRoute } from '@/hooks/useRoute'
import { isTaskRoute, navigate } from '@/lib/route'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PromptsContext } from '@/hooks/usePrompts'
import { useAppStore } from '@/store/app-store'

const base = { createdAt: 1, algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard', network: 'testnet' }
const A = { ...base, id: 'a', seedId: 'a', lockId: 'X', label: 'Alpha', address: 'rAlphaAddr' }
const B = { ...base, id: 'b', seedId: 'b', lockId: 'Y', label: 'Beta', address: 'rBetaAddr' }
const OPEN = { key: {} as CryptoKey, autoLockMinutes: 5 }
const PROMPTS = { pin: async () => '123456' }

/** Configure, the Settings tab, or the routed task screen their keys navigate to (what the shell and `Main` do). */
function Host({ at }: { at: 'configure' | 'settings' }) {
  const route = useRoute()
  if (isTaskRoute(route)) return <WalletScreens route={route} />
  const wallet = useAppStore.getState().wallets.find((w) => w.id === 'a')
  return at === 'configure' ? <ConfigureScreen wallet={wallet as never} /> : <SettingsTab />
}

function renderAt(at: 'configure' | 'settings') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <PromptsContext.Provider value={PROMPTS}>
        <TooltipProvider>
          <Host at={at} />
        </TooltipProvider>
      </PromptsContext.Provider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  h.startLockSession.mockClear()
  h.listed = []
  h.edited = null
  useAppStore.setState({ wallets: [A, B], activeWalletId: 'a', openLocks: { X: OPEN } } as never)
})
afterEach(cleanup)

const openEditChecks = () => fireEvent.click(screen.getByRole('button', { name: 'Edit checks' }))

describe('Configure: Edit checks', () => {
  it('the Checks plate has one Edit checks key, for this wallet only', () => {
    renderAt('configure')
    expect(screen.getAllByRole('button', { name: 'Edit checks' })).toHaveLength(1)
  })

  it('opens the shipped screen at its path, with the label `Back to Configure`', async () => {
    navigate('/wallets/a/configure')
    renderAt('configure')
    openEditChecks()
    expect(window.location.pathname).toBe('/wallets/a/checks')
    const back = await screen.findByRole('button', { name: /Back to Configure/ })
    expect(back.textContent).toBe('Back to Configure')
  })

  it('Back returns to Configure and focus lands on the Edit checks key', async () => {
    navigate('/wallets/a/configure')
    renderAt('configure')
    openEditChecks()
    fireEvent.click(await screen.findByRole('button', { name: /Back to Configure/ }))
    await waitFor(() => expect(window.location.pathname).toBe('/wallets/a/configure'))
    const key = await screen.findByRole('button', { name: 'Edit checks' })
    await waitFor(() => expect(document.activeElement).toBe(key))
  })

  it('after a lock change: the new lock opens with its session, the old one closes', async () => {
    const KEY = { type: 'new-key' } as unknown as CryptoKey
    const moved = { ...A, lockId: 'Z', openCheck: 'passkey' }
    h.listed = [moved, B]
    h.edited = { meta: moved, changed: true, previousLockId: 'X', openKey: KEY, autoLockMinutes: 5, previousLockRemoved: true }
    renderAt('configure')
    openEditChecks()
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
    renderAt('configure')
    openEditChecks()
    fireEvent.click(await screen.findByRole('button', { name: /commit edit for a/ }))
    await waitFor(() => expect(Object.keys(useAppStore.getState().openLocks).sort()).toEqual(['Z', 'legacy']))
  })

  it('an auto-lock-only edit updates that lock\'s window and starts no session and closes no lock', async () => {
    useAppStore.setState({ openLocks: { X: OPEN, Y: OPEN } } as never)
    h.edited = { meta: A, changed: true, previousLockId: 'X', autoLockMinutes: 15, previousLockRemoved: false }
    h.listed = [A, B]
    renderAt('configure')
    openEditChecks()
    fireEvent.click(await screen.findByRole('button', { name: /commit edit for a/ }))
    await waitFor(() => expect(useAppStore.getState().openLocks.X.autoLockMinutes).toBe(15))
    expect(h.startLockSession).not.toHaveBeenCalled()
    expect(Object.keys(useAppStore.getState().openLocks).sort()).toEqual(['X', 'Y'])
  })

  it('closes the removed old lock even when a later step fails', async () => {
    const KEY = { type: 'new-key' } as unknown as CryptoKey
    h.startLockSession.mockRejectedValueOnce(new Error('idb down'))
    h.edited = { meta: { ...A, lockId: 'Z' }, changed: true, previousLockId: 'X', openKey: KEY, autoLockMinutes: 5, previousLockRemoved: true }
    renderAt('configure')
    openEditChecks()
    fireEvent.click(await screen.findByRole('button', { name: /commit edit for a/ }))
    await waitFor(() => expect(useAppStore.getState().openLocks.X).toBeUndefined())
  })
})

describe('Edit checks opened from the Settings tab (still possible until Story 19.4)', () => {
  it('keeps the label `Settings` and Back returns to the tab', async () => {
    navigate('/')
    renderAt('settings')
    fireEvent.click(screen.getByRole('button', { name: /^Edit checks for / }))
    const back = await screen.findByRole('button', { name: /Settings/ })
    expect(back.textContent).toBe('Settings')
    expect(screen.queryByText('Back to Configure')).toBeNull()
    fireEvent.click(back)
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(await screen.findAllByRole('button', { name: /^Edit checks for / })).toHaveLength(1)
  })

  it('a Configure launch does not leak into a later Settings launch', async () => {
    navigate('/wallets/a/configure')
    renderAt('configure')
    openEditChecks()
    fireEvent.click(await screen.findByRole('button', { name: /Back to Configure/ }))
    await waitFor(() => expect(window.location.pathname).toBe('/wallets/a/configure'))
    cleanup()
    navigate('/')
    renderAt('settings')
    fireEvent.click(screen.getByRole('button', { name: /^Edit checks for / }))
    expect((await screen.findByRole('button', { name: /Settings/ })).textContent).toBe('Settings')
  })
})
