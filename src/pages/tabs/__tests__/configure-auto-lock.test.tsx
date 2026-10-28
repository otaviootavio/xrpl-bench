/** @vitest-environment jsdom */
import { createContext, useContext, type ReactNode } from 'react'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The Configure counterpart of the Settings auto-lock tests in `settings-locks.test.tsx`
 * (test design R12, Story 16, AD-44): the Checks plate's Auto-lock row changes ONE
 * lock's minutes through `setLockAutoLock`, shows the policy's refusal as persistent
 * text, says when the lock is shared, and shares its success handler with Edit checks.
 * The floor itself is proven against the real keystore in `lib/crypto/__tests__/edit-checks.test.ts`.
 */
const h = vi.hoisted(() => ({
  minutes: { X: 5, Y: 5 } as Record<string, number>,
  setLockAutoLock: vi.fn(),
  lockInfo: vi.fn(),
  listed: [] as unknown[],
  edited: null as unknown,
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
  getLockInfo: (id: string) => h.lockInfo(id),
  startLockSession: async () => {},
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
  setLockAutoLock: (id: string, m: number, ctx: unknown) => h.setLockAutoLock(id, m, ctx),
}))
vi.mock('@/components/wallet/EditChecksScreen', async () => {
  const { TaskScreen } = await import('@/components/wallet/TaskScreen')
  return {
    EditChecksScreen: ({ wallet, onEdited, onClose }: { wallet: { id: string }; onEdited: (e: unknown) => void; onClose: () => void }) => (
      <TaskScreen title="Edit checks" onBack={onClose}>
        <button onClick={() => void Promise.resolve(onEdited(h.edited)).catch(() => {})}>commit edit for {wallet.id}</button>
      </TaskScreen>
    ),
  }
})
vi.mock('@/lib/notify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: async () => {} }))
vi.mock('@/lib/xrpl/query-reads', () => ({ fetchAccountStateOnce: async () => null }))
// Radix Select needs pointer APIs jsdom lacks: a plain stand-in with the same contract.
const Ctx = createContext<(v: string) => void>(() => {})
vi.mock('@/components/ui/select', () => ({
  Select: ({ onValueChange, disabled, value, children }: { onValueChange?: (v: string) => void; disabled?: boolean; value?: string; children: ReactNode }) => (
    <Ctx.Provider value={onValueChange ?? (() => {})}>
      <div data-testid="auto-lock-select" data-disabled={disabled ? 'true' : 'false'} data-value={value ?? ''}>
        {children}
      </div>
    </Ctx.Provider>
  ),
  SelectTrigger: ({ children, ...p }: { children: ReactNode }) => <div role="combobox" {...p}>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => {
    const on = useContext(Ctx)
    return <button onClick={() => on(value)}>{children}</button>
  },
}))

import { ConfigureScreen } from '@/components/wallet/ConfigureScreen'
import { WalletScreens } from '../../WalletScreens'
import { useRoute } from '@/hooks/useRoute'
import { isTaskRoute, navigate } from '@/lib/route'
import { PromptsContext } from '@/hooks/usePrompts'
import { useAppStore } from '@/store/app-store'

const base = { createdAt: 1, algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard', network: 'testnet' }
const A = { ...base, id: 'a', seedId: 'a', lockId: 'X', label: 'Alpha', address: 'rAlphaAddr' }
const B = { ...base, id: 'b', seedId: 'b', lockId: 'Y', label: 'Beta', address: 'rBetaAddr' }
const OPEN = { key: {} as CryptoKey, autoLockMinutes: 5 }
const PROMPTS = { pin: async () => '123456' }
const REFUSAL = 'A Mainnet wallet must auto-lock after at least 1 minute of inactivity.'

let qc: QueryClient
function Host() {
  const route = useRoute()
  if (isTaskRoute(route)) return <WalletScreens route={route} />
  return <ConfigureScreen wallet={useAppStore.getState().wallets.find((w) => w.id === 'a') as never} />
}
function renderConfigure() {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <PromptsContext.Provider value={PROMPTS}>
        <Host />
      </PromptsContext.Provider>
    </QueryClientProvider>,
  )
}

// The store's own action, restored before every test: one test spies on it.
const REAL_SET_LOCK_MINUTES = useAppStore.getState().setLockMinutes

beforeEach(() => {
  useAppStore.setState({ setLockMinutes: REAL_SET_LOCK_MINUTES } as never)
  window.history.replaceState(null, '', '/')
  h.minutes = { X: 5, Y: 5 }
  h.setLockAutoLock.mockReset().mockResolvedValue({ ok: true })
  h.lockInfo.mockReset().mockImplementation(async (id: string) => ({ id, openCheck: 'pin', autoLockMinutes: h.minutes[id], pin: true, passkey: false }))
  h.listed = []
  h.edited = null
  useAppStore.setState({ wallets: [A, B], activeWalletId: 'a', openLocks: { X: OPEN, Y: { ...OPEN } } } as never)
})
afterEach(cleanup)

const select = () => screen.getByTestId('auto-lock-select')

describe('Configure auto-lock', () => {
  it('shows the lock\'s current minutes from the lockInfo read', async () => {
    h.minutes.X = 15
    renderConfigure()
    await waitFor(() => expect(select().dataset.value).toBe('15'))
    expect(select().dataset.disabled).toBe('false')
  })

  it('a refusal shows the policy\'s reason as persistent alert text, reverts, and writes nothing', async () => {
    h.setLockAutoLock.mockResolvedValue({ ok: false, reason: REFUSAL })
    renderConfigure()
    await waitFor(() => expect(select().dataset.value).toBe('5'))
    fireEvent.click(screen.getByRole('button', { name: '15 minutes' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(REFUSAL)
    expect(screen.getByRole('combobox').getAttribute('aria-describedby')).toBe(alert.id)
    expect(useAppStore.getState().openLocks.X.autoLockMinutes).toBe(5)
    expect(select().dataset.value).toBe('5')
  })

  it('a cancelled or wrong check shows the keystore\'s reason and writes nothing', async () => {
    h.setLockAutoLock.mockResolvedValue({ ok: false, reason: 'Cancelled. The auto-lock was not changed.' })
    renderConfigure()
    await waitFor(() => expect(select().dataset.value).toBe('5'))
    fireEvent.click(screen.getByRole('button', { name: '30 minutes' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/not changed/)
    expect(useAppStore.getState().openLocks.X.autoLockMinutes).toBe(5)
  })

  it('a thrown failure is shown too', async () => {
    h.setLockAutoLock.mockRejectedValue(new Error('idb down'))
    renderConfigure()
    await waitFor(() => expect(select().dataset.value).toBe('5'))
    fireEvent.click(screen.getByRole('button', { name: '30 minutes' }))
    expect((await screen.findByRole('alert')).textContent).toBe('idb down')
  })

  it('the next attempt clears the refusal; a success shows the new minutes and edits that lock only', async () => {
    h.setLockAutoLock.mockResolvedValueOnce({ ok: false, reason: REFUSAL })
    renderConfigure()
    await waitFor(() => expect(select().dataset.value).toBe('5'))
    fireEvent.click(screen.getByRole('button', { name: '1 minute' }))
    await screen.findByRole('alert')
    h.setLockAutoLock.mockImplementation(async (id: string, m: number) => {
      h.minutes[id] = m
      return { ok: true }
    })
    fireEvent.click(screen.getByRole('button', { name: '15 minutes' }))
    await waitFor(() => expect(select().dataset.value).toBe('15'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(h.setLockAutoLock).toHaveBeenLastCalledWith('X', 15, { prompts: PROMPTS })
    expect(useAppStore.getState().openLocks.X.autoLockMinutes).toBe(15)
    expect(useAppStore.getState().openLocks.Y.autoLockMinutes).toBe(5)
  })

  it('offers every policy choice, with the shipped words', async () => {
    renderConfigure()
    await waitFor(() => expect(select().dataset.value).toBe('5'))
    for (const label of ['30 seconds', '1 minute', '5 minutes', '15 minutes', '30 minutes']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
  })

  it('while the read is pending: disabled, with text, and no value shown as current', async () => {
    h.lockInfo.mockImplementation(() => new Promise(() => {}))
    renderConfigure()
    expect(select().dataset.disabled).toBe('true')
    expect(select().dataset.value).toBe('')
    expect(screen.getByText(/Available once this wallet's checks are read/)).toBeTruthy()
  })

  it('when the read failed: disabled, no value, the plate\'s error and Retry stay', async () => {
    h.lockInfo.mockRejectedValue(new Error('down'))
    renderConfigure()
    expect(await screen.findByText("Could not read this wallet's checks.")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(select().dataset.disabled).toBe('true')
    expect(select().dataset.value).toBe('')
  })
})

describe('Configure auto-lock on a shared lock', () => {
  it('says so with the count of distinct Seeds on the lock', async () => {
    const wallets = ['a', 'b', 'c'].map((id) => ({ ...A, id, seedId: id, lockId: 'legacy' }))
    // A second view of the same Seed does not add to the count.
    useAppStore.setState({ wallets: [...wallets, { ...A, id: 'a-main', seedId: 'a', lockId: 'legacy' }], openLocks: { legacy: OPEN } } as never)
    h.minutes.legacy = 5
    renderConfigure()
    expect(await screen.findByText('This lock is shared by 3 wallets. A change applies to all of them.')).toBeTruthy()
  })

  it('says nothing for one Seed', async () => {
    renderConfigure()
    await waitFor(() => expect(select().dataset.value).toBe('5'))
    expect(screen.queryByText(/This lock is shared by/)).toBeNull()
  })
})

describe('One success handler for the minutes', () => {
  it('Configure control and an Edit checks minutes-only commit each set the window once and invalidate lockInfo once', async () => {
    const set = vi.spyOn(useAppStore.getState(), 'setLockMinutes')
    useAppStore.setState({ setLockMinutes: set } as never)
    renderConfigure()
    await waitFor(() => expect(select().dataset.value).toBe('5'))
    const invalidate = vi.spyOn(qc, 'invalidateQueries')

    h.setLockAutoLock.mockImplementation(async (id: string, m: number) => ((h.minutes[id] = m), { ok: true }))
    fireEvent.click(screen.getByRole('button', { name: '15 minutes' }))
    await waitFor(() => expect(select().dataset.value).toBe('15'))
    expect(set).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith('X', 15)
    expect(invalidate.mock.calls.filter(([f]) => JSON.stringify(f?.queryKey) === '["lockInfo","X"]')).toHaveLength(1)

    set.mockClear()
    invalidate.mockClear()
    h.listed = [A, B]
    h.edited = { meta: A, changed: true, previousLockId: 'X', autoLockMinutes: 30, previousLockRemoved: false }
    navigate('/wallets/a/checks')
    fireEvent.click(await screen.findByRole('button', { name: /commit edit for a/ }))
    await waitFor(() => expect(set).toHaveBeenCalledWith('X', 30))
    expect(set).toHaveBeenCalledTimes(1)
    expect(invalidate.mock.calls.filter(([f]) => JSON.stringify(f?.queryKey) === '["lockInfo","X"]')).toHaveLength(1)
  })
})

describe('Edit checks refreshes the lockInfo read on every committed edit', () => {
  async function commit(edited: unknown) {
    renderConfigure()
    await waitFor(() => expect(select().dataset.value).toBe('5'))
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    h.listed = [A, B]
    h.edited = edited
    navigate('/wallets/a/checks')
    fireEvent.click(await screen.findByRole('button', { name: /commit edit for a/ }))
    return invalidate
  }

  it('a commit that moved the wallet to a new lock invalidates the new lock\'s read', async () => {
    const invalidate = await commit({ meta: { ...A, lockId: 'Y' }, openKey: {} as CryptoKey, changed: true, previousLockId: 'X', autoLockMinutes: 15, previousLockRemoved: false })
    await waitFor(() => expect(invalidate.mock.calls.some(([f]) => JSON.stringify(f?.queryKey) === '["lockInfo","Y"]')).toBe(true))
  })

  it('a commit that changed nothing still refreshes the read, once', async () => {
    const invalidate = await commit({ meta: A, changed: false, previousLockId: 'X', autoLockMinutes: 5, previousLockRemoved: false })
    await waitFor(() => expect(invalidate.mock.calls.filter(([f]) => JSON.stringify(f?.queryKey) === '["lockInfo","X"]')).toHaveLength(1))
  })
})

describe('the legacy app-store minutes', () => {
  it('no Configure file reads or writes autoLockMinutes of the app store', () => {
    for (const f of ['src/components/wallet/ConfigureScreen.tsx', 'src/hooks/useLockMinutesChanged.ts']) {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/s\.autoLockMinutes|setAutoLockMinutes|state\.autoLockMinutes/)
    }
  })
})
