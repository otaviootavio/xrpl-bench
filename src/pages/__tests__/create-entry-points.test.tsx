/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, waitFor, cleanup, fireEvent, render, screen } from '@testing-library/react'

/**
 * Story 5: both ways to make a new Wallet open the creation flow, and neither
 * writes a Wallet itself. Import keeps its own paths.
 */
const h = vi.hoisted(() => ({
  setUpVaultAuth: vi.fn(async () => ({}) as CryptoKey),
  generateAndStoreWallet: vi.fn(),
  createStoredWallet: vi.fn(),
  flowProps: [] as Array<Record<string, unknown>>,
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/notify', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock('@/lib/crypto/keystore', () => ({
  parseSeedInput: (raw: string) => raw.trim() || null,
  addressFromSeed: () => 'rAddr',
  importAndStoreWallet: vi.fn(),
  generateAndStoreWallet: (...a: unknown[]) => h.generateAndStoreWallet(...a),
  createStoredWallet: (...a: unknown[]) => h.createStoredWallet(...a),
  listWallets: async () => [],
  removeWallet: vi.fn(),
  revealSeed: vi.fn(),
  addNetworkView: vi.fn(),
  setLockAutoLock: vi.fn(),
  describeCheckFailure: () => '',
}))
vi.mock('@/lib/crypto/auth', () => ({ setUpVaultAuth: (...a: unknown[]) => h.setUpVaultAuth(...(a as [])), hasPasskeyRegistered: async () => false, wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({
  DEFAULT_AUTO_LOCK_MINUTES: 5,
  endLockSession: async () => {},
  endAllLockSessions: async () => {},
  getLockInfo: async () => ({ id: 'legacy', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }),
}))
vi.mock('@/components/wallet/CreateWalletFlow', () => ({
  CreateWalletFlow: (props: Record<string, unknown>) => {
    h.flowProps.push(props)
    return <p>the creation flow</p>
  },
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ fetchQuery: vi.fn(), invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: undefined, refetch: vi.fn() }),
}))
vi.mock('@/lib/build-info', () => ({ BUILD: { version: '0.0.0' }, shortSha: 'abc', sourceUrl: '#', formatBuiltAt: () => 'now' }))
vi.mock('@/hooks/useAppUpdate', () => ({
  useAppUpdate: () => ({
    updateReady: false, applying: false, applyUpdate: vi.fn(), checking: false, checkError: false, checkForUpdate: vi.fn(),
    pendingRelease: null, blockedReason: null, declined: false, declineCurrent: vi.fn(),
  }),
}))
vi.mock('@/lib/teardown', () => ({ tearDownAllLocalState: vi.fn(), clearCachedAccountData: vi.fn(), tearDownLock: vi.fn() }))
vi.mock('@/components/wallet/AddressLink', () => ({ AddressLink: () => <span /> }))

import { Onboarding } from '../Onboarding'
import { SettingsTab } from '../tabs/SettingsTab'
import { WalletScreens } from '../WalletScreens'
import { useRoute } from '@/hooks/useRoute'
import { useAppStore } from '@/store/app-store'

/** Settings, or the routed screen its buttons navigate to (what `Main` does). */
function Host() {
  const route = useRoute()
  return route.screen === 'home' ? <SettingsTab /> : <WalletScreens route={route} />
}

const click = async (name: string | RegExp) => act(async () => void fireEvent.click(screen.getByRole('button', { name })))

beforeEach(() => {
  window.history.replaceState(null, '', '/')
  h.setUpVaultAuth.mockClear()
  h.generateAndStoreWallet.mockClear()
  h.createStoredWallet.mockClear()
  h.flowProps.length = 0
  useAppStore.setState({
    wallets: [{ id: 'w1', seedId: 'w1', lockId: 'legacy', label: 'Main', address: 'rAddr', createdAt: 1, network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' }],
    activeWalletId: 'w1',
    openLocks: { legacy: { key: {} as CryptoKey, autoLockMinutes: 5 } },
  } as never)
})
afterEach(cleanup)

describe('first run', () => {
  it('"Create a new wallet" opens the flow and sets up no vault by itself', async () => {
    render(<Onboarding />)
    await click('Create a new wallet')
    expect(screen.getByText('the creation flow')).toBeTruthy()
    expect(h.setUpVaultAuth).not.toHaveBeenCalled()
    expect(h.generateAndStoreWallet).not.toHaveBeenCalled()
  })

  it('Import keeps its path: seed, then the PIN step that sets up the vault', async () => {
    render(<Onboarding />)
    await click('Import an existing wallet')
    expect(screen.getByLabelText('Seed')).toBeTruthy()
    expect(screen.queryByText('the creation flow')).toBeNull()
    ;(document.getElementById('seed') as HTMLInputElement).value = 'sSeed'
    await click('Continue')
    expect(screen.getByLabelText(/PIN \(min 6 digits\)/)).toBeTruthy()
  })
})

describe('Settings > Add wallet', () => {
  it('Generate shows the flow; it commits itself, so the screen has no Add button for it', async () => {
    render(<Host />)
    await click('Add wallet')
    expect(screen.getByText('the creation flow')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
    expect(h.generateAndStoreWallet).not.toHaveBeenCalled()
    expect(h.createStoredWallet).not.toHaveBeenCalled()
  })

  it('Import is untouched: label, network, seed and Add', async () => {
    render(<Host />)
    await click('Add wallet')
    expect(window.location.pathname).toBe('/wallets/new')
    await click('Import')
    expect(screen.queryByText('the creation flow')).toBeNull()
    expect(document.getElementById('wseed')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
  })

  it('the screen cannot be left while a Wallet is being written or backed up, then returns to Settings when done', async () => {
    render(<Host />)
    await click('Add wallet')
    const props = h.flowProps.at(-1) as { onInProgressChange: (b: boolean) => void; onDone: () => void }
    await act(async () => props.onInProgressChange(true))
    expect((screen.getByRole('button', { name: 'Settings' }) as HTMLButtonElement).disabled).toBe(true)
    // The browser's Back is put back too.
    await act(async () => {
      window.history.back()
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(window.location.pathname).toBe('/wallets/new')
    expect(screen.getByText('the creation flow')).toBeTruthy()
    await act(async () => {
      props.onInProgressChange(false)
      props.onDone()
    })
    await waitFor(() => expect(screen.queryByText('the creation flow')).toBeNull())
    expect(window.location.pathname).toBe('/')
  })
})
