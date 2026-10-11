/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

/**
 * Epic 11 (G-24): importing a Seed is the same operation on both screens.
 *
 * Both screens are driven through their real flow here, with the keystore and
 * the ledger stubbed at their edges: the warning comes before the vault write,
 * a padded Seed is accepted, and a malformed one is reported in one set of
 * words. The pre-flight check itself (`lib/seed-import.ts`) is the real one, so
 * a test here that reaches "warn" is going through the code the app runs.
 */

/** A real Seed (the xrpl.js docs example). The keystore is stubbed below —
 * xrpl's key derivation does not run under jsdom — so its value only matters
 * as the one string the stub accepts. */
const SEED = 'sEdTM1uX8pu2do5XvTnutH6HsouMaM2'
const ADDRESS = 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL'
const INVALID = 'That seed looks invalid. Double-check and try again.'

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('@/lib/notify', () => ({
  toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) },
}))

const importAndStoreWallet = vi.fn()
const generateAndStoreWallet = vi.fn()
const addressFromSeed = vi.fn()
vi.mock('@/lib/crypto/keystore', () => ({
  // The stub keeps the real contract: trim, then accept only a Seed.
  parseSeedInput: (raw: string) => (raw.trim() === SEED ? SEED : null),
  addressFromSeed: (seed: string) => addressFromSeed(seed),
  importAndStoreWallet: (...args: unknown[]) => importAndStoreWallet(...args),
  generateAndStoreWallet: (...args: unknown[]) => generateAndStoreWallet(...args),
  listWallets: async () => [{ id: 'w-new', label: 'Wallet', address: ADDRESS, createdAt: 0 }],
  removeWallet: vi.fn(),
  revealSeed: vi.fn(),
}))
vi.mock('@/lib/crypto/auth', () => ({ setUpVaultAuth: async () => ({}) as CryptoKey, hasPasskeyRegistered: async () => false }))

/** The ledger, as the pre-flight check sees it: `fetchQuery` is the only call
 * `fetchAccountStateOnce` makes. */
const fetchQuery = vi.fn()
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ fetchQuery, invalidateQueries: vi.fn() }) }))

vi.mock('@/lib/build-info', () => ({ BUILD: { version: '0.0.0' }, shortSha: 'abc1234', sourceUrl: '#', formatBuiltAt: () => 'now' }))
vi.mock('@/hooks/useAppUpdate', () => ({
  useAppUpdate: () => ({
    updateReady: false,
    applying: false,
    applyUpdate: vi.fn(),
    checking: false,
    checkError: false,
    checkForUpdate: vi.fn(),
    pendingRelease: null,
    blockedReason: null,
    declined: false,
    declineCurrent: vi.fn(),
  }),
}))
vi.mock('@/components/wallet/AddressLink', () => ({ AddressLink: ({ address }: { address: string }) => <span>{address}</span> }))
vi.mock('@/lib/teardown', () => ({ tearDownAllLocalState: vi.fn(), clearCachedAccountData: vi.fn() }))

const setActiveWalletId = vi.fn()
vi.mock('@/store/app-store', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      network: 'testnet',
      wallets: [],
      setWallets: vi.fn(),
      activeWalletId: null,
      setActiveWalletId,
      autoLockMinutes: 5,
      setAutoLockMinutes: vi.fn(),
      addressBook: [],
      // A real key: with `null` both handlers return at their first line.
      vaultKey: {},
      lock: vi.fn(),
      unlock: vi.fn(),
    }),
  useActiveNetwork: () => 'testnet',
  useActiveNode: () => undefined,
}))

import { Onboarding } from '../Onboarding'
import { SettingsTab } from '../tabs/SettingsTab'

function accountState(over: Record<string, unknown> = {}) {
  return { exists: true, address: ADDRESS, balanceDrops: '10000000', ownerCount: 0, sequence: 1, requireDestTag: false, disableMasterKey: false, ...over }
}

const ledger = {
  masterKeyEnabled: () => fetchQuery.mockResolvedValue(accountState()),
  masterKeyDisabled: () => fetchQuery.mockResolvedValue(accountState({ disableMasterKey: true })),
  unreachable: () => fetchQuery.mockRejectedValue(new Error('WebSocket is closed')),
}

beforeEach(() => {
  toastError.mockReset()
  toastSuccess.mockReset()
  importAndStoreWallet.mockReset().mockResolvedValue({ id: 'w-new', label: 'Wallet', address: ADDRESS, createdAt: 0 })
  addressFromSeed.mockReset().mockReturnValue(ADDRESS)
  generateAndStoreWallet.mockReset().mockResolvedValue({ meta: { id: 'w-new' }, seed: SEED })
  fetchQuery.mockReset()
  setActiveWalletId.mockReset()
})

afterEach(cleanup)

const click = async (name: string | RegExp) => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
}

// ---------------------------------------------------------------------------
// The two screens, driven to the point of "import this value".
// ---------------------------------------------------------------------------

/** Onboarding: choose import, type the value, Continue, set a PIN, Continue. */
async function onboardingImport(value: string) {
  render(<Onboarding />)
  await click('Import an existing wallet')
  ;(document.getElementById('seed') as HTMLInputElement).value = value
  await click('Continue')
  // Not a Seed: the screen stays on the import step and reports it.
  if (!document.getElementById('pin')) return
  fireEvent.change(document.getElementById('pin')!, { target: { value: '123456' } })
  fireEvent.change(document.getElementById('pin-confirm')!, { target: { value: '123456' } })
  await click('Continue')
}

/** Settings: Add wallet, Import, type the value, Add. */
async function settingsImport(value: string) {
  render(<SettingsTab />)
  await click('Add wallet')
  await click('Import')
  ;(document.getElementById('wseed') as HTMLInputElement).value = value
  await click('Add')
}

const screens = [
  { name: 'Onboarding', importValue: onboardingImport },
  { name: 'Settings', importValue: settingsImport },
] as const

describe.each(screens)('$name: Seed import (Epic 11)', ({ importValue }) => {
  it('writes straight away when the master key is enabled — no extra step', async () => {
    ledger.masterKeyEnabled()
    await importValue(SEED)
    expect(addressFromSeed).toHaveBeenCalledWith(SEED)
    expect(fetchQuery).toHaveBeenCalledTimes(1)
    expect(importAndStoreWallet).toHaveBeenCalledTimes(1)
    expect(importAndStoreWallet.mock.calls[0][1]).toBe(SEED)
    expect(screen.queryByRole('button', { name: 'Import anyway' })).toBeNull()
  })

  it('warns BEFORE the write when the master key is disabled, and writes only on "Import anyway"', async () => {
    ledger.masterKeyDisabled()
    await importValue(SEED)
    expect(screen.getByText('Master key disabled')).toBeTruthy()
    expect(importAndStoreWallet).not.toHaveBeenCalled()

    await click('Import anyway')
    expect(importAndStoreWallet).toHaveBeenCalledTimes(1)
    expect(importAndStoreWallet.mock.calls[0][1]).toBe(SEED)
  })

  it('writes nothing when the operator cancels the warning', async () => {
    ledger.masterKeyDisabled()
    await importValue(SEED)
    await click('Cancel import')
    expect(importAndStoreWallet).not.toHaveBeenCalled()
    expect(screen.queryByText('Master key disabled')).toBeNull()
  })

  it('does not treat an unreadable account as a working master key: it warns, and writes only on "Import anyway"', async () => {
    ledger.unreachable()
    await importValue(SEED)
    expect(screen.getByText('Master key not checked')).toBeTruthy()
    expect(importAndStoreWallet).not.toHaveBeenCalled()
    // Not the raw transport error.
    expect(toastError).not.toHaveBeenCalled()

    await click('Import anyway')
    expect(importAndStoreWallet).toHaveBeenCalledTimes(1)
  })

  it('accepts a pasted Seed with a trailing newline and spaces, and stores it trimmed', async () => {
    ledger.masterKeyEnabled()
    await importValue(`  ${SEED}\n`)
    expect(toastError).not.toHaveBeenCalled()
    expect(addressFromSeed).toHaveBeenCalledWith(SEED)
    expect(importAndStoreWallet.mock.calls[0][1]).toBe(SEED)
  })

  it('reports a malformed Seed in the shared words, and neither probes nor writes', async () => {
    await importValue('sNotARealSeed')
    expect(toastError).toHaveBeenCalledWith(INVALID)
    expect(fetchQuery).not.toHaveBeenCalled()
    expect(importAndStoreWallet).not.toHaveBeenCalled()
  })

  it('reports a whitespace-only Seed as malformed, not as empty-and-ignored', async () => {
    await importValue(' \n\t ')
    expect(toastError).toHaveBeenCalledWith(INVALID)
    expect(importAndStoreWallet).not.toHaveBeenCalled()
  })
})

describe('Settings: dismissing the warning is cancelling it', () => {
  it('Escape closes the warning and writes nothing — later or ever', async () => {
    ledger.masterKeyDisabled()
    await settingsImport(SEED)
    expect(screen.getByText('Master key disabled')).toBeTruthy()
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    })
    expect(screen.queryByText('Master key disabled')).toBeNull()
    expect(importAndStoreWallet).not.toHaveBeenCalled()
  })

  it('clears the input after a completed import', async () => {
    ledger.masterKeyEnabled()
    render(<SettingsTab />)
    await click('Add wallet')
    await click('Import')
    const input = document.getElementById('wseed') as HTMLInputElement
    input.value = SEED
    await click('Add')
    expect(importAndStoreWallet).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('')
  })
})

describe('Settings: the busy guards hold while the check or the write runs', () => {
  it('the Add dialog cannot be closed, re-submitted or switched to Generate while the check is in flight', async () => {
    let settle!: (v: unknown) => void
    fetchQuery.mockReturnValue(new Promise((r) => (settle = r)))
    await settingsImport(SEED)
    expect(screen.getByRole('button', { name: 'Checking…' })).toBeTruthy()

    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    })
    expect(screen.getByText('Add another wallet')).toBeTruthy()

    await click('Checking…')
    expect(fetchQuery).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(true)
    expect((document.getElementById('wlabel') as HTMLInputElement).disabled).toBe(true)

    await act(async () => {
      settle(accountState())
    })
    expect(importAndStoreWallet).toHaveBeenCalledTimes(1)
  })

  it('a double-click on "Import anyway" writes once', async () => {
    ledger.masterKeyDisabled()
    let settle!: (v: unknown) => void
    importAndStoreWallet.mockReturnValue(new Promise((r) => (settle = r)))
    await settingsImport(SEED)
    // Two clicks as a browser delivers them: separate events, with React's
    // commit for the first (busy, button disabled) landing before the second.
    const button = screen.getByRole('button', { name: 'Import anyway' })
    await act(async () => {
      fireEvent.click(button)
    })
    await act(async () => {
      fireEvent.click(button)
    })
    expect(importAndStoreWallet).toHaveBeenCalledTimes(1)
    await act(async () => {
      settle({ id: 'w-new', label: 'Wallet', address: ADDRESS, createdAt: 0 })
    })
    expect(importAndStoreWallet).toHaveBeenCalledTimes(1)
  })
})

describe('Onboarding: the Seed survives the move from the import step to the PIN step', () => {
  it('probes and writes the Seed that was typed, not the empty value an unmounted input leaves', async () => {
    ledger.masterKeyEnabled()
    await onboardingImport(SEED)
    // Before Epic 11 this read the input after it had unmounted, got '', and
    // failed in the derivation with whatever xrpl.js says about an empty seed.
    expect(addressFromSeed).toHaveBeenCalledWith(SEED)
    expect(addressFromSeed).not.toHaveBeenCalledWith('')
    expect(toastSuccess).toHaveBeenCalledWith('Wallet imported.')
  })
})

// ---------------------------------------------------------------------------
// The Network choice reaches the pre-check and the write, on both screens.
// ---------------------------------------------------------------------------

const radio = (name: RegExp) => fireEvent.click(screen.getByRole('radio', { name }))
const NETWORK_LABEL = { mainnet: /^Mainnet/, devnet: /^Devnet/ } as const

describe.each(['mainnet', 'devnet'] as const)('choosing %s', (network) => {
  it('Onboarding import: the pre-check and the write use it', async () => {
    ledger.masterKeyEnabled()
    render(<Onboarding />)
    radio(NETWORK_LABEL[network])
    await click('Import an existing wallet')
    ;(document.getElementById('seed') as HTMLInputElement).value = SEED
    await click('Continue')
    fireEvent.change(document.getElementById('pin')!, { target: { value: '123456' } })
    fireEvent.change(document.getElementById('pin-confirm')!, { target: { value: '123456' } })
    await click('Continue')
    expect(fetchQuery.mock.calls[0][0].queryKey).toEqual(['accountState', network, ADDRESS])
    expect(importAndStoreWallet.mock.calls[0][3]).toBe(network)
  })

  it('Onboarding generate: the new Wallet is created on it', async () => {
    render(<Onboarding />)
    radio(NETWORK_LABEL[network])
    await click('Create a new wallet')
    fireEvent.change(document.getElementById('pin')!, { target: { value: '123456' } })
    fireEvent.change(document.getElementById('pin-confirm')!, { target: { value: '123456' } })
    await click('Continue')
    expect(generateAndStoreWallet.mock.calls[0][2]).toBe(network)
  })

  it('Settings import: the pre-check and the write use it, and "Import anyway" keeps it', async () => {
    ledger.masterKeyDisabled()
    render(<SettingsTab />)
    await click('Add wallet')
    radio(NETWORK_LABEL[network])
    await click('Import')
    ;(document.getElementById('wseed') as HTMLInputElement).value = SEED
    await click('Add')
    expect(fetchQuery.mock.calls[0][0].queryKey).toEqual(['accountState', network, ADDRESS])
    await click('Import anyway')
    expect(importAndStoreWallet.mock.calls[0][3]).toBe(network)
  })

  it('Settings generate: the new Wallet is created on it', async () => {
    render(<SettingsTab />)
    await click('Add wallet')
    radio(NETWORK_LABEL[network])
    await click('Add')
    expect(generateAndStoreWallet.mock.calls[0][2]).toBe(network)
  })
})

describe('Settings: the Network choice is reset for the next Add', () => {
  it('returns to Testnet after an add completes', async () => {
    render(<SettingsTab />)
    await click('Add wallet')
    radio(/^Mainnet/)
    await click('Add')
    await click('Add wallet')
    expect((screen.getByRole('radio', { name: /^Testnet/ }) as HTMLInputElement).checked).toBe(true)
  })
})
