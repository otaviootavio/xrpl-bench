/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, waitFor, cleanup, fireEvent, render, screen } from '@testing-library/react'

/**
 * Story 5: both ways to make a new Wallet open the creation flow, and neither
 * writes a Wallet itself. Onboarding's Import keeps its own path.
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
import { WalletScreens } from '../WalletScreens'
import { AddWalletScreen } from '@/components/wallet/AddWalletScreen'
import { useRoute } from '@/hooks/useRoute'
import { ADD_WALLET_PATH, isTaskRoute, leaveScreen, navigate } from '@/lib/route'
import { consumeAdded } from '@/lib/chooser-signals'
import { toast } from '@/lib/notify'
import { useAppStore } from '@/store/app-store'

/** The routed screen the chooser's Add wallet key navigates to, else a stand-in for the chooser (what the app shell does). */
function Host() {
  const route = useRoute()
  if (route.screen === 'add-wallet') return <AddWalletScreen onClose={leaveScreen} />
  return isTaskRoute(route) ? <WalletScreens route={route} /> : <p>the chooser</p>
}

/** The chooser's Add wallet key is covered in `chooser.test.tsx`; here the route is entered the way that key does. */
const addWallet = async () => act(async () => void navigate(ADD_WALLET_PATH))

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
    expect((h.flowProps.at(-1) as { pathChoice?: unknown }).pathChoice).toBeUndefined() // Onboarding's buttons choose the path
    expect(h.setUpVaultAuth).not.toHaveBeenCalled()
    expect(h.generateAndStoreWallet).not.toHaveBeenCalled()
  })

  it('names its own leave action "Back to start", disabled while a wallet is being written, and it returns to the choice', async () => {
    render(<Onboarding />)
    await click('Create a new wallet')
    expect(screen.queryByRole('button', { name: /^Back$/ })).toBeNull() // the quiz owns the only "Back"
    const leave = screen.getByRole('button', { name: 'Back to start' }) as HTMLButtonElement
    expect(leave.disabled).toBe(false)
    const inProgress = h.flowProps.at(-1) as { onInProgressChange: (v: boolean) => void }
    await act(async () => inProgress.onInProgressChange(true))
    expect((screen.getByRole('button', { name: 'Back to start' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => inProgress.onInProgressChange(false))
    await click('Back to start')
    expect(screen.getByRole('button', { name: 'Create a new wallet' })).toBeTruthy()
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

  it('the plate reads "All wallets on this device", the screen\'s line, "No wallet is stored here." and the PIN sentence; never "removes 0"', async () => {
    h.appPinResidue.mockResolvedValue(true)
    useAppStore.setState({ wallets: [] } as never) // first run has no wallet
    render(<Onboarding />)
    await waitFor(() => expect(offer()).not.toBeNull())
    expect(screen.getByText('All wallets on this device')).toBeTruthy()
    expect(screen.getByText(/left over from a wallet that was removed/)).toBeTruthy()
    expect(screen.getByText('No wallet is stored here.')).toBeTruthy()
    expect(screen.getByText('It also removes the App PIN, if you set one.')).toBeTruthy()
    expect(screen.queryByText(/removes 0/)).toBeNull()
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

describe('Add wallet from the chooser: the routed screen', () => {
  it('Generate shows the flow; it commits itself, so the screen has no Add button for it', async () => {
    render(<Host />)
    await addWallet()
    expect(screen.getByText('the creation flow')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
    expect(h.generateAndStoreWallet).not.toHaveBeenCalled()
    expect(h.createStoredWallet).not.toHaveBeenCalled()
  })

  it('Import is the same flow in import mode, with the Seed field supplied by the screen', async () => {
    render(<Host />)
    await addWallet()
    expect(window.location.pathname).toBe('/wallets/new')
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull()
    await act(async () => (h.flowProps.at(-1) as { pathChoice: { onChange: (v: string) => void } }).pathChoice.onChange('import'))
    expect(screen.getByText('the creation flow')).toBeTruthy()
    const props = h.flowProps.at(-1) as { importSource?: unknown }
    expect(props.importSource).toBeTruthy()
  })

  it('the screen cannot be left while a Wallet is being written or backed up, then returns to the chooser when done', async () => {
    render(<Host />)
    await addWallet()
    const props = h.flowProps.at(-1) as { onInProgressChange: (b: boolean) => void; onDone: (meta: { id: string }) => void }
    await act(async () => props.onInProgressChange(true))
    expect((screen.getByRole('button', { name: 'Wallets' }) as HTMLButtonElement).disabled).toBe(true)
    expect((h.flowProps.at(-1) as { pathChoice: { disabled: boolean } }).pathChoice.disabled).toBe(true)
    // The browser's Back is put back too.
    await act(async () => {
      window.history.back()
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(window.location.pathname).toBe('/wallets/new')
    expect(screen.getByText('the creation flow')).toBeTruthy()
    await act(async () => {
      props.onInProgressChange(false)
      props.onDone({ id: 'w-new' })
    })
    await waitFor(() => expect(screen.queryByText('the creation flow')).toBeNull())
    expect(window.location.pathname).toBe('/')
  })
})

describe('Add wallet at the app shell (chooser story 11)', () => {
  it('works with every lock closed: Generate and Import are both offered', async () => {
    useAppStore.setState({ openLocks: {} } as never)
    window.history.replaceState(null, '', '/wallets/new')
    render(<AddWalletScreen onClose={() => {}} />)
    expect(screen.getByText('the creation flow')).toBeTruthy()
    // The flow itself asks Create or Import: the screen has no Generate or Import button.
    const props = h.flowProps.at(-1) as { pathChoice: { value: string } }
    expect(props.pathChoice.value).toBe('create')
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull()
  })

  it('on success: announces the new card, says Wallet added., returns, and selects nothing', async () => {
    useAppStore.setState({ openLocks: {} } as never)
    const onClose = vi.fn()
    render(<AddWalletScreen onClose={onClose} />)
    const props = h.flowProps.at(-1) as { onDone: (meta: { id: string }) => void }
    act(() => props.onDone({ id: 'w-9' }))
    expect(consumeAdded()).toBe('w-9')
    expect(consumeAdded()).toBeNull() // one-shot
    expect(toast.success).toHaveBeenCalledWith('Wallet added.')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(useAppStore.getState().activeWalletId).toBe('w1')
  })

  it('the route carries only the screen name', async () => {
    render(<Host />)
    await addWallet()
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
