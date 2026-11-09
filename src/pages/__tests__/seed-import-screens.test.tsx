/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'

/**
 * First-run Import (spec-no-legacy-lock, story 1): Onboarding's Import is the
 * creation quiz in import mode, the same one Add wallet runs, so the first Wallet
 * is written under its own new lock. The keystore and the ledger are stubbed at
 * their edges; the quiz, the Seed wiring (`useSeedImport`) and the pre-flight
 * check (`lib/seed-import.ts`) are the real ones.
 */
const SEED = 'sEdTM1uX8pu2do5XvTnutH6HsouMaM2'
const ADDRESS = 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL'
const INVALID = 'That seed looks invalid. Double-check and try again.'

const h = vi.hoisted(() => ({
  importStoredWallet: vi.fn(),
  importDuplicateReason: vi.fn(),
  addressFromSeed: vi.fn(),
  fetchQuery: vi.fn(),
  startLockSession: vi.fn(async () => {}),
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/webauthn', () => ({ detectPrfSupport: async () => 'no', getRpId: () => 'localhost' }))
vi.mock('@/lib/crypto/lock', () => ({
  DEFAULT_AUTO_LOCK_MINUTES: 5,
  hasAppPin: async () => true,
  startLockSession: (...a: unknown[]) => h.startLockSession(...(a as [])),
}))
vi.mock('@/lib/crypto/pin', () => ({ triesRemaining: async () => 8 }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/xrpl/client', () => ({ verifyNode: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ fetchQuery: h.fetchQuery, invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: undefined, refetch: vi.fn() }),
}))
vi.mock('@/lib/crypto/keystore', () => ({
  // The stub keeps the real contract: trim, then accept only a Seed.
  parseSeedInput: (raw: string) => (raw.trim() === SEED ? SEED : null),
  addressFromSeed: (seed: string) => h.addressFromSeed(seed),
  importDuplicateReason: (...a: unknown[]) => h.importDuplicateReason(...a),
  importStoredWallet: (...a: unknown[]) => h.importStoredWallet(...a),
  createStoredWallet: vi.fn(),
  createDerivedWallet: vi.fn(),
  listWallets: async () => [META],
  appPinResidue: async () => false,
  describeCheckFailure: () => '',
}))
vi.mock('@/lib/build-info', () => ({ BUILD: { version: '0.0.0' }, shortSha: 'abc1234', sourceUrl: '#', formatBuiltAt: () => 'now' }))
const toastSuccess = vi.fn()
vi.mock('@/lib/notify', () => ({ toast: { error: vi.fn(), success: (m: string) => toastSuccess(m), warning: vi.fn() } }))
vi.mock('@/lib/teardown', () => ({ tearDownAllLocalState: vi.fn(), clearCachedAccountData: vi.fn(), tearDownLock: vi.fn() }))
vi.mock('@/components/wallet/AddressLink', () => ({ AddressLink: ({ address }: { address: string }) => <span>{address}</span> }))

import { Onboarding } from '../Onboarding'
import { useAppStore } from '@/store/app-store'

const META = {
  id: 'w-new',
  seedId: 'seed-new',
  lockId: 'lock-new',
  label: 'My Wallet',
  address: ADDRESS,
  createdAt: 1,
  network: 'testnet',
  algorithm: 'ed25519',
  openCheck: 'pin',
  signingCheck: 'standard',
  seedMethod: 'stored',
}
const KEY = { type: 'secret' } as unknown as CryptoKey

function accountState(over: Record<string, unknown> = {}) {
  return { exists: true, address: ADDRESS, balanceDrops: '10000000', ownerCount: 0, sequence: 1, requireDestTag: false, disableMasterKey: false, ...over }
}
const ledger = {
  masterKeyEnabled: () => h.fetchQuery.mockResolvedValue(accountState()),
  masterKeyDisabled: () => h.fetchQuery.mockResolvedValue(accountState({ disableMasterKey: true })),
  unreachable: () => h.fetchQuery.mockRejectedValue(new Error('WebSocket is closed')),
}

beforeEach(() => {
  h.importStoredWallet.mockReset().mockResolvedValue({ status: 'ok', value: { meta: META, openKey: KEY } })
  h.importDuplicateReason.mockReset().mockResolvedValue(null)
  h.addressFromSeed.mockReset().mockReturnValue(ADDRESS)
  h.fetchQuery.mockReset()
  h.startLockSession.mockClear()
  toastSuccess.mockReset()
  useAppStore.setState({ wallets: [], activeWalletId: null, openLocks: {} } as never)
})
afterEach(cleanup)

const click = async (name: string | RegExp) => act(async () => void fireEvent.click(screen.getByRole('button', { name })))
const seedInput = () => document.getElementById('wseed') as HTMLInputElement | null

/** Onboarding > Import: type the Seed on step 1, answer every question with its default, press Import wallet. */
async function onboardingImport(value: string, { network }: { network?: RegExp } = {}) {
  render(<Onboarding />)
  await click('Import an existing wallet')
  await act(async () => void fireEvent.click(await screen.findByRole('radio', { name: 'Online' })))
  if (network) fireEvent.click(screen.getByRole('radio', { name: network }))
  fireEvent.change(seedInput()!, { target: { value } })
  await click('Next')
  // A refused Seed keeps step 1 on screen.
  if (screen.queryByText(/^Step 1 of \d+$/)) return
  for (let guard = 0; guard < 6; guard++) {
    const next = screen.queryByRole('button', { name: 'Next' })
    if (!next) break
    await act(async () => void fireEvent.click(next))
  }
  const pinField = document.querySelector('input[id$="-pin"]') as HTMLInputElement | null
  if (pinField) pinField.value = '123456'
  await click(/Import wallet/)
}

describe('Onboarding: first-run Import is the quiz in import mode', () => {
  it('writes the Wallet under its own lock when the master key is enabled: no warning, no shared lock, no vault setup', async () => {
    ledger.masterKeyEnabled()
    await onboardingImport(SEED)
    await waitFor(() => expect(useAppStore.getState().activeWalletId).toBe('w-new'))
    expect(h.addressFromSeed).toHaveBeenCalledWith(SEED)
    expect(h.fetchQuery).toHaveBeenCalledTimes(1)
    expect(h.importStoredWallet).toHaveBeenCalledTimes(1)
    expect(h.importStoredWallet.mock.calls[0][0]).toMatchObject({ seed: SEED, network: 'testnet', label: 'My Wallet' })
    expect(screen.queryByRole('button', { name: 'Import anyway' })).toBeNull()
    // CAP-1: the lock is the Wallet's own, never `legacy`, and no PIN vault was set up.
    const lockIds = Object.keys(useAppStore.getState().openLocks)
    expect(lockIds).toEqual(['lock-new'])
    expect(lockIds).not.toContain('legacy')
    expect(h.startLockSession).toHaveBeenCalledWith('lock-new', KEY, 5)
    expect(toastSuccess).toHaveBeenCalledWith('Wallet imported.')
  })

  it('opens the Wallet\'s lock no later than the first state with a wallet, so the Gate never shows it locked', async () => {
    ledger.masterKeyEnabled()
    const seen: Array<{ locks: string[]; wallets: number }> = []
    const unsubscribe = useAppStore.subscribe((st) => seen.push({ locks: Object.keys(st.openLocks), wallets: st.wallets.length }))
    await onboardingImport(SEED)
    await waitFor(() => expect(useAppStore.getState().activeWalletId).toBe('w-new'))
    unsubscribe()
    const first = seen.find((x) => x.wallets > 0)
    expect(first).toBeTruthy()
    expect(first!.locks).toContain('lock-new')
  })

  it('empties the Seed field and writes nothing when Onboarding unmounts at the warning sheet', async () => {
    ledger.masterKeyDisabled()
    const view = render(<Onboarding />)
    await click('Import an existing wallet')
    await act(async () => void fireEvent.click(await screen.findByRole('radio', { name: 'Online' })))
    const field = seedInput()!
    fireEvent.change(field, { target: { value: SEED } })
    await click('Next')
    for (let guard = 0; guard < 6; guard++) {
      const next = screen.queryByRole('button', { name: 'Next' })
      if (!next) break
      await act(async () => void fireEvent.click(next))
    }
    const pinField = document.querySelector('input[id$="-pin"]') as HTMLInputElement | null
    if (pinField) pinField.value = '123456'
    await click(/Import wallet/)
    expect(screen.getByText('Master key disabled')).toBeTruthy()
    view.unmount()
    expect(h.importStoredWallet).not.toHaveBeenCalled()
    expect(field.value).toBe('')
  })

  it('warns BEFORE the write when the master key is disabled, and writes only on "Import anyway"', async () => {
    ledger.masterKeyDisabled()
    await onboardingImport(SEED)
    expect(screen.getByText('Master key disabled')).toBeTruthy()
    expect(h.importStoredWallet).not.toHaveBeenCalled()

    await click('Import anyway')
    await waitFor(() => expect(h.importStoredWallet).toHaveBeenCalledTimes(1))
    expect(h.importStoredWallet.mock.calls[0][0]).toMatchObject({ seed: SEED })
    await waitFor(() => expect(Object.keys(useAppStore.getState().openLocks)).toEqual(['lock-new']))
  })

  it('writes nothing, and empties the Seed field, when the operator cancels the warning', async () => {
    ledger.masterKeyDisabled()
    await onboardingImport(SEED)
    await click('Cancel import')
    expect(h.importStoredWallet).not.toHaveBeenCalled()
    expect(screen.queryByText('Master key disabled')).toBeNull()
    expect(useAppStore.getState().openLocks).toEqual({})
    expect(useAppStore.getState().wallets).toEqual([])
    expect(seedInput()?.value ?? '').toBe('')
  })

  it('does not treat an unreadable account as a working master key: it warns, and writes only on "Import anyway"', async () => {
    ledger.unreachable()
    await onboardingImport(SEED)
    expect(screen.getByText('Master key not checked')).toBeTruthy()
    expect(h.importStoredWallet).not.toHaveBeenCalled()

    await click('Import anyway')
    await waitFor(() => expect(h.importStoredWallet).toHaveBeenCalledTimes(1))
  })

  it('accepts a pasted Seed with a trailing newline and spaces, and stores it trimmed', async () => {
    ledger.masterKeyEnabled()
    await onboardingImport(`  ${SEED}\n`)
    await waitFor(() => expect(h.importStoredWallet).toHaveBeenCalledTimes(1))
    expect(h.addressFromSeed).toHaveBeenCalledWith(SEED)
    expect(h.importStoredWallet.mock.calls[0][0]).toMatchObject({ seed: SEED })
  })

  it('refuses a malformed Seed on step 1 in the shared words, and neither probes nor writes', async () => {
    await onboardingImport('sNotARealSeed')
    expect(screen.getByText(INVALID)).toBeTruthy()
    expect(h.importDuplicateReason).not.toHaveBeenCalled()
    expect(h.fetchQuery).not.toHaveBeenCalled()
    expect(h.importStoredWallet).not.toHaveBeenCalled()
  })

  it('refuses a whitespace-only Seed: Next never gets past step 1 and nothing is written', async () => {
    render(<Onboarding />)
    await click('Import an existing wallet')
    await act(async () => void fireEvent.click(await screen.findByRole('radio', { name: 'Online' })))
    fireEvent.change(seedInput()!, { target: { value: ' \n\t ' } })
    expect(screen.getByRole('button', { name: 'Next' }).getAttribute('aria-disabled')).toBe('true')
    await click('Next')
    expect(screen.getByText(/^Step 1 of \d+$/)).toBeTruthy()
    expect(h.importStoredWallet).not.toHaveBeenCalled()
  })

  it('refuses a duplicate before any ledger read', async () => {
    h.importDuplicateReason.mockResolvedValue('This key is already on this device on Testnet.')
    await onboardingImport(SEED)
    expect(screen.getByText('This key is already on this device on Testnet.')).toBeTruthy()
    expect(h.fetchQuery).not.toHaveBeenCalled()
    expect(h.importStoredWallet).not.toHaveBeenCalled()
  })

  it('empties the Seed field when the step is left with "Back to start"', async () => {
    render(<Onboarding />)
    await click('Import an existing wallet')
    await act(async () => void fireEvent.click(await screen.findByRole('radio', { name: 'Online' })))
    const field = seedInput()!
    fireEvent.change(field, { target: { value: SEED } })
    await click('Back to start')
    expect(field.value).toBe('')
    expect(screen.getByRole('button', { name: 'Import an existing wallet' })).toBeTruthy()
  })
})

describe.each(['mainnet', 'devnet'] as const)('Onboarding import: choosing %s on step 1', (network) => {
  it('the duplicate probe, the pre-check and the write use it', async () => {
    ledger.masterKeyEnabled()
    await onboardingImport(SEED, { network: network === 'mainnet' ? /^Mainnet/ : /^Devnet/ })
    await waitFor(() => expect(h.importStoredWallet).toHaveBeenCalled())
    expect(h.importDuplicateReason).toHaveBeenCalledWith(SEED, network)
    expect(h.fetchQuery.mock.calls[0][0].queryKey).toEqual(['accountState', network, ADDRESS])
    expect(h.importStoredWallet.mock.calls[0][0]).toMatchObject({ network })
  })
})

describe('one import path', () => {
  it('Onboarding writes through no legacy import, vault setup or legacy lock', () => {
    const source = readFileSync('src/pages/Onboarding.tsx', 'utf8')
    expect(source).not.toMatch(/importAndStoreWallet|setUpVaultAuth|LEGACY_LOCK_ID|openLock\(|importDuplicateReason|parseSeedInput/)
    expect(source).toMatch(/useSeedImport\(/)
    expect(readFileSync('src/components/wallet/AddWalletScreen.tsx', 'utf8')).toMatch(/useSeedImport\(/)
  })
})
