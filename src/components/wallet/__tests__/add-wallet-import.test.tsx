/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'

/**
 * Chooser story 13 (AD-39, AD-40): Add wallet > Import is the creation flow in
 * import mode. The keystore and the ledger are stubbed at their edges; the policy,
 * the questions, the PIN entry, the written-Seed confirmation and the screen are
 * the real ones.
 */
const SEED = 'sEdTM1uX8pu2do5XvTnutH6HsouMaM2'
const ADDRESS = 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL'
const DUPLICATE = 'This key is already on this device. To use it on another network, open the wallet and use Configure, Other networks.'
const INVALID = 'That seed looks invalid. Double-check and try again.'

const h = vi.hoisted(() => ({
  capability: 'no' as 'yes' | 'no' | 'unknown',
  appPin: true,
  importStoredWallet: vi.fn(),
  importDuplicateReason: vi.fn(),
  checkBeforeImport: vi.fn(),
  fetchAccountStateOnce: vi.fn(),
  startLockSession: vi.fn(async () => {}),
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/webauthn', () => ({ detectPrfSupport: async () => h.capability, getRpId: () => 'localhost' }))
vi.mock('@/lib/crypto/lock', () => ({ hasAppPin: async () => h.appPin, startLockSession: (...a: unknown[]) => h.startLockSession(...(a as [])) }))
vi.mock('@/lib/crypto/pin', () => ({ triesRemaining: async () => 8 }))
vi.mock('@/lib/xrpl/client', () => ({ verifyNode: vi.fn() }))
vi.mock('@/lib/xrpl/query-reads', () => ({ fetchAccountStateOnce: (...a: unknown[]) => h.fetchAccountStateOnce(...a) }))
vi.mock('@/lib/seed-import', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/seed-import')>()
  return { ...real, checkBeforeImport: (...a: unknown[]) => h.checkBeforeImport(...a) }
})
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ fetchQuery: vi.fn() }) }))
vi.mock('@/lib/crypto/keystore', () => ({
  // The real contract: trim, then accept only the one Seed.
  parseSeedInput: (raw: string) => (raw.trim() === SEED ? SEED : null),
  addressFromSeed: () => ADDRESS,
  importDuplicateReason: (...a: unknown[]) => h.importDuplicateReason(...a),
  importStoredWallet: (...a: unknown[]) => h.importStoredWallet(...a),
  createStoredWallet: vi.fn(),
  createDerivedWallet: vi.fn(),
  listWallets: async () => [META],
  describeCheckFailure: (r: { status: string; triesRemaining?: number }) =>
    r.status === 'wrong-credential' ? `Incorrect PIN. ${r.triesRemaining} tries remaining.` : 'Locked out.',
}))

import { AddWalletScreen } from '../AddWalletScreen'
import { consumeAdded } from '@/lib/chooser-signals'
import { useAppStore } from '@/store/app-store'
import { useNoticeStore } from '@/store/notice-store'

const META = {
  id: 'w-new',
  seedId: 'seed-new',
  lockId: 'lock-new',
  label: 'Wallet',
  address: ADDRESS,
  createdAt: 1,
  network: 'testnet',
  algorithm: 'ed25519',
  openCheck: 'pin',
  signingCheck: 'standard',
  seedMethod: 'stored',
}
const KEY = { type: 'secret' } as unknown as CryptoKey
const imported = () => ({ status: 'ok', value: { meta: META, openKey: KEY } })

const click = async (el: HTMLElement) => act(async () => void fireEvent.click(el))
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const seedInput = () => document.getElementById('wseed') as HTMLInputElement
const setActiveWalletId = vi.fn()
const onClose = vi.fn()

async function openImport() {
  const view = render(<AddWalletScreen onClose={onClose} />)
  await screen.findByRole('button', { name: 'Import' })
  await click(button('Import'))
  await screen.findByLabelText('Seed')
  return view
}

/** Type the Seed (and the App PIN the default Open Check asks for) and press Import wallet. */
async function submit(value = SEED, { pin = '123456' } = {}) {
  seedInput().value = value
  const pinField = document.querySelector('input[id$="-pin"]') as HTMLInputElement | null
  if (pinField) pinField.value = pin
  await click(button(/Import wallet/))
}

const text = () => document.body.textContent ?? ''
const noticeText = () => JSON.stringify(useNoticeStore.getState().notices)

beforeEach(() => {
  window.history.replaceState(null, '', '/wallets/new')
  h.capability = 'no'
  h.appPin = true
  h.importStoredWallet.mockReset().mockResolvedValue(imported())
  h.importDuplicateReason.mockReset().mockResolvedValue(null)
  h.checkBeforeImport.mockReset().mockResolvedValue(null)
  h.fetchAccountStateOnce.mockReset()
  h.startLockSession.mockClear()
  setActiveWalletId.mockReset()
  onClose.mockReset()
  useNoticeStore.setState({ notices: [] } as never)
  useAppStore.setState({
    wallets: [{ ...META, id: 'w1', seedId: 'w1', lockId: 'lock-1', label: 'Main', address: 'rOther' }],
    activeWalletId: 'w1',
    openLocks: {},
    setActiveWalletId,
  } as never)
})
afterEach(cleanup)

describe('Import with every lock closed', () => {
  it('imports under its own lock: card announced, Wallet added., nothing selected or entered, route unchanged', async () => {
    await openImport()
    await submit()
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(h.importStoredWallet).toHaveBeenCalledTimes(1)
    const [input, ctx] = h.importStoredWallet.mock.calls[0]
    expect(input).toMatchObject({ seed: SEED, network: 'testnet', openCheck: 'pin', signing: 'standard' })
    expect(ctx).toMatchObject({ pin: '123456', appPinExpected: true })
    expect(typeof ctx.confirmWrittenSeed).toBe('function')
    expect(consumeAdded()).toBe('seed-new')
    expect(noticeText()).toContain('Wallet added.')
    // Never selects or enters the wallet.
    expect(setActiveWalletId).not.toHaveBeenCalled()
    expect(useAppStore.getState().activeWalletId).toBe('w1')
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/wallets/new')
    expect(seedInput()?.value ?? '').toBe('')
  })

  it('runs in the order parse, duplicate probe, master-key check, keystore', async () => {
    await openImport()
    await submit(`  ${SEED}\n`)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const order = [h.importDuplicateReason, h.checkBeforeImport, h.importStoredWallet].map((m) => m.mock.invocationCallOrder[0])
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(h.importDuplicateReason).toHaveBeenCalledWith(SEED)
    expect(h.checkBeforeImport.mock.calls[0][1]).toBe('testnet')
    expect(h.checkBeforeImport.mock.calls[0][2]).toBe(ADDRESS)
  })

  it.each([['Devnet', 'devnet'], ['Testnet', 'testnet']] as const)('the chosen network (%s) reaches the master-key check and the keystore', async (label, network) => {
    await openImport()
    await click(screen.getByRole('radio', { name: new RegExp(`^${label}`) }))
    await submit()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(h.checkBeforeImport.mock.calls[0][1]).toBe(network)
    expect(h.importStoredWallet.mock.calls[0][0]).toMatchObject({ network })
  })

  it('switching to Generate clears a typed Seed from the field it leaves', async () => {
    await openImport()
    const field = seedInput()
    field.value = SEED
    await click(button('Generate'))
    expect(field.value).toBe('')
  })

  it('offers Import and Generate, and asks no Seed Method and no signature type', async () => {
    await openImport()
    expect(button('Generate')).toBeTruthy()
    const legends = Array.from(document.querySelectorAll('legend')).map((l) => l.textContent)
    expect(legends).not.toContain('Seed Method')
    expect(legends).not.toContain('Signature type')
    expect(legends).toContain('Open Check')
    expect(legends).toContain('Signing Check')
    const rows = Array.from(document.querySelectorAll('dt')).map((d) => d.textContent)
    expect(rows).not.toContain('Seed Method')
    expect(rows).not.toContain('Signature type')
  })

  it('defaults the Open Check to the App PIN, or to a passkey where one is known to work', async () => {
    await openImport()
    await click(button('Customise'))
    expect((screen.getByRole('radio', { name: /^App PIN$/ }) as HTMLInputElement).checked).toBe(true)
    cleanup()
    h.capability = 'yes'
    await openImport()
    await click(button('Customise'))
    expect((screen.getByRole('radio', { name: /^Passkey$/ }) as HTMLInputElement).checked).toBe(true)
  })
})

describe('refusals come first', () => {
  it('an invalid Seed: the message is visible, and nothing is probed, read or written; the field is cleared', async () => {
    await openImport()
    await submit('garbage-not-a-seed')
    expect(await screen.findByText(INVALID)).toBeTruthy()
    expect(h.importDuplicateReason).not.toHaveBeenCalled()
    expect(h.checkBeforeImport).not.toHaveBeenCalled()
    expect(h.importStoredWallet).not.toHaveBeenCalled()
    expect(seedInput().value).toBe('')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('a duplicate: the reason stays on screen, with no ledger read, no prompt and no write; the Seed is cleared', async () => {
    h.importDuplicateReason.mockResolvedValue(DUPLICATE)
    await openImport()
    await submit()
    const reason = await screen.findByText(DUPLICATE)
    expect(reason.closest('[role="alert"]')).toBeTruthy()
    expect(h.checkBeforeImport).not.toHaveBeenCalled()
    expect(h.fetchAccountStateOnce).not.toHaveBeenCalled()
    expect(h.importStoredWallet).not.toHaveBeenCalled()
    expect(screen.queryByText('Heads up')).toBeNull()
    expect(seedInput().value).toBe('')
    expect(text()).not.toContain(SEED)
    // Still there a moment later: not a toast that dismisses itself.
    await new Promise((r) => setTimeout(r, 30))
    expect(screen.getByText(DUPLICATE)).toBeTruthy()
  })

  it('a duplicate never reaches the ledger even when the check would warn', async () => {
    h.importDuplicateReason.mockResolvedValue(DUPLICATE)
    h.checkBeforeImport.mockResolvedValue('master-key-disabled')
    await openImport()
    await submit()
    await screen.findByText(DUPLICATE)
    expect(h.checkBeforeImport).not.toHaveBeenCalled()
  })
})

describe('the master-key warning', () => {
  it('Import anyway continues to the keystore', async () => {
    h.checkBeforeImport.mockResolvedValue('master-key-disabled')
    await openImport()
    await submit()
    expect(await screen.findByText('Master key disabled')).toBeTruthy()
    expect(h.importStoredWallet).not.toHaveBeenCalled()
    await click(button('Import anyway'))
    await waitFor(() => expect(h.importStoredWallet).toHaveBeenCalledTimes(1))
    expect(h.importStoredWallet.mock.calls[0][0].seed).toBe(SEED)
  })

  it('an unreadable account warns too, and writes only on Import anyway', async () => {
    h.checkBeforeImport.mockResolvedValue('unchecked')
    await openImport()
    await submit()
    expect(await screen.findByText('Master key not checked')).toBeTruthy()
    expect(h.importStoredWallet).not.toHaveBeenCalled()
  })

  it('Cancel abandons: nothing written, the Seed and the field are cleared, and a visible note says so', async () => {
    h.checkBeforeImport.mockResolvedValue('master-key-disabled')
    await openImport()
    await submit()
    await screen.findByText('Master key disabled')
    await click(button('Cancel import'))
    await waitFor(() => expect(screen.queryByText('Master key disabled')).toBeNull())
    expect(h.importStoredWallet).not.toHaveBeenCalled()
    expect(seedInput().value).toBe('')
    expect(screen.getByText('Cancelled. Nothing was imported.')).toBeTruthy()
  })

  it('Escape is Cancel', async () => {
    h.checkBeforeImport.mockResolvedValue('master-key-disabled')
    await openImport()
    await submit()
    await screen.findByText('Master key disabled')
    await act(async () => void fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }))
    await waitFor(() => expect(screen.queryByText('Master key disabled')).toBeNull())
    expect(h.importStoredWallet).not.toHaveBeenCalled()
    expect(seedInput().value).toBe('')
  })
})

describe('Open Check none', () => {
  it.each([/^Testnet/, /^Devnet/, /^Mainnet/])('is aria-disabled with a visible reason on %s', async (network) => {
    await openImport()
    await click(screen.getByRole('radio', { name: network }))
    await click(button('Customise'))
    const none = screen.getByRole('radio', { name: /^No Open Check/ })
    expect(none.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getAllByText(/may already hold funds this device cannot see/).length).toBeGreaterThan(0)
    await click(none)
    expect((none as HTMLInputElement).checked).toBe(false)
  })
})

describe('Mainnet with a passkey as the only check', () => {
  /** The keystore as the real one behaves: asks the callback, writes only on yes. */
  function realistic() {
    h.importStoredWallet.mockImplementation(async (_input: unknown, ctx: { confirmWrittenSeed: (seed: string) => Promise<boolean> }) =>
      (await ctx.confirmWrittenSeed(SEED)) ? imported() : { status: 'cancelled' },
    )
  }

  it('asks for the written Seed before anything is written; Cancel leaves nothing written and clears the Seed', async () => {
    h.capability = 'yes'
    realistic()
    await openImport()
    await click(screen.getByRole('radio', { name: /^Mainnet/ }))
    const field = seedInput() // the element the Seed is typed into, even once it has left the DOM
    await submit()
    expect(await screen.findByText('Write down your Seed')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    await click(button('Cancel'))
    expect(await screen.findByText('Cancelled. Nothing was imported.')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    expect(h.startLockSession).not.toHaveBeenCalled()
    expect(field.value).toBe('')
  })

  it('confirming the groups lets it finish, with no second backup screen', async () => {
    h.capability = 'yes'
    realistic()
    await openImport()
    await click(screen.getByRole('radio', { name: /^Mainnet/ }))
    await submit()
    await screen.findByText('Write down your Seed')
    const groups = Array.from(document.querySelectorAll('label'))
      .map((l) => ({ m: /^Characters (\d+)–(\d+)$/.exec(l.textContent ?? ''), l }))
      .filter((x) => !!x.m)
    for (const { m, l } of groups) {
      ;(document.getElementById((l as HTMLLabelElement).htmlFor) as HTMLInputElement).value = SEED.slice(Number(m![1]) - 1, Number(m![2]))
    }
    await click(button('Check what I wrote'))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(setActiveWalletId).not.toHaveBeenCalled()
  })
})

describe('failures are visible, persistent text, and the Seed is cleared', () => {
  it.each([
    ['a wrong PIN', { status: 'wrong-credential', triesRemaining: 4 }, /Incorrect PIN\. 4 tries remaining\./],
    ['a lockout', { status: 'locked-out' }, /Locked out\./],
    ['a policy refusal', { status: 'refused', reason: 'The policy said no.' }, /The policy said no\./],
  ])('%s', async (_name, result, expected) => {
    h.importStoredWallet.mockResolvedValue(result)
    await openImport()
    await submit()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(expected)
    expect(seedInput().value).toBe('')
    expect(onClose).not.toHaveBeenCalled()
    expect(text()).not.toContain(SEED)
    expect(noticeText()).not.toContain(SEED)
  })

  it('a keystore throw is shown, with no lock opened and the Seed cleared', async () => {
    h.importStoredWallet.mockRejectedValue(new Error('disk full'))
    await openImport()
    await submit()
    expect((await screen.findByRole('alert')).textContent).toBe('Could not import the wallet. Nothing was imported.')
    expect(seedInput().value).toBe('')
    expect(h.startLockSession).not.toHaveBeenCalled()
    expect(setActiveWalletId).not.toHaveBeenCalled()
  })

  it('a duplicate probe that throws is reported without the Seed, and nothing is read or written', async () => {
    h.importDuplicateReason.mockRejectedValue(new Error('idb down'))
    await openImport()
    await submit()
    expect((await screen.findByRole('alert')).textContent).toMatch(/Nothing was imported/)
    expect(h.checkBeforeImport).not.toHaveBeenCalled()
    expect(h.importStoredWallet).not.toHaveBeenCalled()
    expect(seedInput().value).toBe('')
  })
})

describe('the Seed ref and the field are cleared on every exit', () => {
  it('on success', async () => {
    await openImport()
    const input = seedInput()
    await submit()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(input.value).toBe('')
  })

  it('on failure', async () => {
    h.importStoredWallet.mockResolvedValue({ status: 'refused', reason: 'No.' })
    await openImport()
    const input = seedInput()
    await submit()
    await screen.findByText('No.')
    expect(input.value).toBe('')
  })

  it('on unmount mid-flow (while the warning is open), and the keystore is never called', async () => {
    h.checkBeforeImport.mockResolvedValue('master-key-disabled')
    const view = await openImport()
    const input = seedInput()
    await submit()
    await screen.findByText('Master key disabled')
    expect(input.value).toBe(SEED)
    view.unmount()
    expect(input.value).toBe('')
    await new Promise((r) => setTimeout(r, 20))
    expect(h.importStoredWallet).not.toHaveBeenCalled()
  })

  it('on unmount while the master-key check is still running, nothing is written afterwards', async () => {
    let settle!: (v: null) => void
    h.checkBeforeImport.mockReturnValue(new Promise((r) => (settle = r)))
    const view = await openImport()
    const input = seedInput()
    await submit()
    view.unmount()
    expect(input.value).toBe('')
    await act(async () => settle(null))
    expect(h.importStoredWallet).not.toHaveBeenCalled()
  })
})

describe('the Seed is never in rendered text, a notice, a toast or the URL', () => {
  it('after a full import and after a failure', async () => {
    await openImport()
    await submit()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(text()).not.toContain(SEED)
    expect(noticeText()).not.toContain(SEED)
    expect(window.location.href).not.toContain(SEED)
    expect(JSON.stringify(window.history.state)).not.toContain(SEED)
  })

  it('does not keep the Seed in state: the screen sources do not hold it in useState', () => {
    const source = readFileSync('src/components/wallet/AddWalletScreen.tsx', 'utf8')
    expect(source).not.toMatch(/useState<string/)
    expect(source).not.toContain('importAndStoreWallet')
    expect(source).not.toContain('setActiveWalletId')
    expect(source).not.toContain('useWalletOpenKey')
  })
})

describe('busy guards', () => {
  it('the screen cannot be left or the mode switched while the check runs', async () => {
    h.checkBeforeImport.mockReturnValue(new Promise(() => {}))
    await openImport()
    await submit()
    expect((screen.getByRole('button', { name: 'Wallets' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Generate' }) as HTMLButtonElement).disabled).toBe(true)
    expect(seedInput().disabled).toBe(true)
  })
})
