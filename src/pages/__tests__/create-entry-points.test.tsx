/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
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
  appPinResidue: vi.fn(async () => false),
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
  appPinResidue: () => h.appPinResidue(),
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
import { AddWalletScreen } from '@/components/wallet/AddWalletScreen'
import { useRoute } from '@/hooks/useRoute'
import { isTaskRoute, leaveScreen } from '@/lib/route'
import { consumeAdded } from '@/lib/chooser-signals'
import { toast } from '@/lib/notify'
import { useAppStore } from '@/store/app-store'

/** Settings, or the routed screen its buttons navigate to (what `Main` and the app shell do). */
function Host() {
  const route = useRoute()
  if (route.screen === 'add-wallet') return <AddWalletScreen onClose={leaveScreen} />
  return isTaskRoute(route) ? <WalletScreens route={route} /> : <SettingsTab />
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

describe('first run after a removal whose App PIN discard failed (AD-46)', () => {
  const offer = () => screen.queryByRole('button', { name: 'Remove all wallets from this device' })
  afterEach(() => h.appPinResidue.mockResolvedValue(false))

  it('offers Remove all while a PIN or a failure count remains, read through the keystore', async () => {
    h.appPinResidue.mockResolvedValue(true)
    render(<Onboarding />)
    await waitFor(() => expect(offer()).not.toBeNull())
    expect(h.appPinResidue).toHaveBeenCalled()
    fireEvent.click(offer() as HTMLElement)
    expect(screen.getByRole('button', { name: 'Erase everything' })).toBeTruthy()
  })

  it('offers nothing on a clean device', async () => {
    render(<Onboarding />)
    await waitFor(() => expect(h.appPinResidue).toHaveBeenCalled())
    expect(offer()).toBeNull()
  })

  it('reads no vault meta itself', () => {
    expect(readFileSync('src/pages/Onboarding.tsx', 'utf8')).not.toMatch(/getVaultMeta|pinSaltB64|failedAttempts/)
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
    const props = h.flowProps.at(-1) as { onInProgressChange: (b: boolean) => void; onDone: (meta: { seedId: string }) => void }
    await act(async () => props.onInProgressChange(true))
    expect((screen.getByRole('button', { name: 'Wallets' }) as HTMLButtonElement).disabled).toBe(true)
    // The browser's Back is put back too.
    await act(async () => {
      window.history.back()
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(window.location.pathname).toBe('/wallets/new')
    expect(screen.getByText('the creation flow')).toBeTruthy()
    await act(async () => {
      props.onInProgressChange(false)
      props.onDone({ seedId: 'w-new' })
    })
    await waitFor(() => expect(screen.queryByText('the creation flow')).toBeNull())
    expect(window.location.pathname).toBe('/')
  })
})

describe('Add wallet at the app shell (chooser story 11)', () => {
  it('works with every lock closed: Generate is offered, Import is not, and nothing says why', async () => {
    useAppStore.setState({ openLocks: {} } as never)
    window.history.replaceState(null, '', '/wallets/new')
    render(<AddWalletScreen onClose={() => {}} />)
    expect(screen.getByText('the creation flow')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull()
    expect(screen.queryByText(/import/i)).toBeNull()
  })

  it('on success: announces the new card, says Wallet added., returns, and selects nothing', async () => {
    useAppStore.setState({ openLocks: {} } as never)
    const onClose = vi.fn()
    render(<AddWalletScreen onClose={onClose} />)
    const props = h.flowProps.at(-1) as { onDone: (meta: { seedId: string }) => void }
    act(() => props.onDone({ seedId: 'seed-9' }))
    expect(consumeAdded()).toBe('seed-9')
    expect(consumeAdded()).toBeNull() // one-shot
    expect(toast.success).toHaveBeenCalledWith('Wallet added.')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().activeWalletId).toBe('w1')
  })

  it('the route carries only the screen name', async () => {
    render(<Host />)
    await click('Add wallet')
    expect(window.location.pathname).toBe('/wallets/new')
    expect(window.location.search + window.location.hash).toBe('')
  })
})

describe('first run: the one allowed writer of the first selection', () => {
  it('Onboarding selects the wallet its flow made; the flow itself selects nothing', async () => {
    useAppStore.setState({ wallets: [], activeWalletId: null, openLocks: {} } as never)
    render(<Onboarding />)
    await click('Create a new wallet')
    const props = h.flowProps.at(-1) as { onDone: (meta: { id: string }) => void }
    expect(useAppStore.getState().activeWalletId).toBeNull()
    act(() => props.onDone({ id: 'first' }))
    expect(useAppStore.getState().activeWalletId).toBe('first')
  })
})
