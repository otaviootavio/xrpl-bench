/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

/** AD-37: Gate resolves to exactly one of error / empty / ready. */
const h = vi.hoisted(() => ({
  idb: new Map<string, string>(),
  getImpl: null as null | ((k: string) => Promise<string | undefined>),
  list: vi.fn(async (_n?: string): Promise<unknown[]> => []),
  restore: vi.fn(async (): Promise<unknown[]> => []),
  onboarding: vi.fn(),
  main: vi.fn(),
  reset: vi.fn(),
}))

vi.mock('idb-keyval', () => ({
  get: (k: string) => (h.getImpl ? h.getImpl(k) : Promise.resolve(h.idb.get(k))),
  set: async (k: string, v: string) => void h.idb.set(k, v),
  del: async (k: string) => void h.idb.delete(k),
}))
vi.mock('@/lib/crypto/keystore', () => ({
  migrateLegacyVault: async () => true,
  listWallets: (n?: string) => h.list(n),
}))
vi.mock('@/lib/crypto/lock', () => ({
  restoreOpenLocks: () => h.restore(),
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
}))
vi.mock('@/lib/route', async (orig) => ({ ...(await orig<object>()), resetToHome: () => h.reset() }))
vi.mock('@/pages/Onboarding', () => ({
  Onboarding: () => {
    h.onboarding()
    return <p>ONBOARDING</p>
  },
}))
vi.mock('@/pages/Main', () => ({
  Main: () => {
    h.main()
    return <p>MAIN</p>
  },
}))

const MESSAGE = 'The wallets on this device could not be read. Nothing was changed.'
const wallet = { id: 'w1', label: 'One', address: 'rX', seedId: 's1', lockId: 'l1', network: 'testnet', createdAt: 1 }

let store: typeof import('@/store/app-store')
const SETTERS = ['setWallets', 'setActiveWalletId', 'openLock'] as const
const setters = {} as Record<(typeof SETTERS)[number], ReturnType<typeof vi.fn>>

async function mountApp() {
  vi.resetModules()
  store = await import('@/store/app-store')
  // Spy on the real setters so "no setter ran" is an assertion, not an assumption.
  const state = store.useAppStore.getState()
  for (const k of SETTERS) {
    const real = state[k] as (...a: unknown[]) => void
    setters[k] = vi.fn(real)
  }
  store.useAppStore.setState({ ...setters } as never)
  const { default: App } = await import('@/App')
  render(<App />)
}

function expectNothingRan() {
  expect(screen.queryByText('ONBOARDING')).toBeNull()
  expect(screen.queryByText('MAIN')).toBeNull()
  expect(h.onboarding).not.toHaveBeenCalled()
  expect(h.main).not.toHaveBeenCalled()
  for (const k of SETTERS) expect(setters[k]).not.toHaveBeenCalled()
}

beforeEach(() => {
  h.idb.clear()
  h.getImpl = null
  h.list.mockReset().mockResolvedValue([])
  h.restore.mockReset().mockResolvedValue([])
  h.onboarding.mockClear()
  h.main.mockClear()
  h.reset.mockClear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Gate — error, empty, ready', () => {
  it('ready: wallets listed, Main mounts', async () => {
    h.list.mockResolvedValue([wallet])
    await mountApp()
    await screen.findByText('MAIN')
    expect(h.onboarding).not.toHaveBeenCalled()
  })

  it('empty: Onboarding mounts and resetToHome runs', async () => {
    await mountApp()
    await screen.findByText('ONBOARDING')
    expect(h.reset).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('vault read fails: error with Retry, no Onboarding, no Main, no setter', async () => {
    h.list.mockRejectedValue(new Error('idb exploded'))
    await mountApp()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(MESSAGE)
    expect(document.body.textContent).not.toContain('idb exploded')
    screen.getByRole('button', { name: 'Retry' })
    expectNothingRan()
    expect(h.reset).not.toHaveBeenCalled()
  })

  it('vault read fails, Retry succeeds with wallets: Main mounts', async () => {
    h.list.mockRejectedValueOnce(new Error('x')).mockResolvedValue([wallet])
    await mountApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    await screen.findByText('MAIN')
    expect(h.onboarding).not.toHaveBeenCalled()
    expect(h.list).toHaveBeenCalledTimes(2)
  })

  it('vault read fails, Retry succeeds with zero wallets: Onboarding mounts only then', async () => {
    h.list.mockRejectedValueOnce(new Error('x')).mockResolvedValue([])
    await mountApp()
    await screen.findByRole('alert')
    expect(h.onboarding).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('ONBOARDING')
  })

  it('hydration fails: same error, list never called, no setter, Retry reloads', async () => {
    h.getImpl = async () => {
      throw new Error('storage unavailable')
    }
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    await mountApp()
    expect((await screen.findByRole('alert')).textContent).toBe(MESSAGE)
    expect(h.list).not.toHaveBeenCalled()
    expectNothingRan()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(reload).toHaveBeenCalledTimes(1)
    expect(h.list).not.toHaveBeenCalled()
  })

  it('restore fails: Main mounts, every lock stays closed', async () => {
    h.list.mockResolvedValue([wallet])
    h.restore.mockRejectedValue(new Error('session store'))
    await mountApp()
    await screen.findByText('MAIN')
    expect(setters.openLock).not.toHaveBeenCalled()
    expect(store.useAppStore.getState().openLocks).toEqual({})
  })
})
