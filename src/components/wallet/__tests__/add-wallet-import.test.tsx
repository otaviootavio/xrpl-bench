/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'

/**
 * Chooser story 13 (AD-39, AD-40): Add wallet > Import is the creation flow in
 * import mode. The keystore and the ledger are stubbed at their edges; the policy,
 * the questions, the PIN entry, the written-Seed confirmation and the screen are
 * the real ones.
 */
const SEED = 'sEdTM1uX8pu2do5XvTnutH6HsouMaM2'
const ADDRESS = 'rG31cLyErnqeVj2eomEjBZtq7PYaupGYzL'
const DUPLICATE = 'This key is already on this device on Testnet.'
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
vi.mock('@/lib/build-info', () => ({ BUILD: { version: '0.0.0' }, shortSha: 'abc', sourceUrl: '#', formatBuiltAt: () => 'now' }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
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
  appPinResidue: async () => false,
  listWallets: async () => [META],
  describeCheckFailure: (r: { status: string; triesRemaining?: number }) =>
    r.status === 'wrong-credential' ? `Incorrect PIN. ${r.triesRemaining} tries remaining.` : 'Locked out.',
}))

import { AddWalletScreen } from '../AddWalletScreen'
import { CreateWalletFlow } from '../CreateWalletFlow'
import { Onboarding } from '@/pages/Onboarding'
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
/** Type into the Seed field the way a person does, so the host learns that something is typed. */
const typeSeed = (value: string) => fireEvent.change(seedInput(), { target: { value } })
const setActiveWalletId = vi.fn()
const onClose = vi.fn()

async function openImport() {
  const view = render(<AddWalletScreen onClose={onClose} />)
  await click(await screen.findByRole('radio', { name: 'Import a wallet' }))
  await screen.findByLabelText('Seed')
  return view
}

/** Type the Seed (and the App PIN the default Open Check asks for) and press Import wallet. */
async function submit(value = SEED, { pin = '123456' } = {}) {
  typeSeed(value)
  // The Seed is typed on step 1; Import wallet is on the last step.
  for (let guard = 0; guard < 6; guard++) {
    const next = screen.queryByRole('button', { name: 'Next' })
    if (!next) break
    await click(next)
  }
  const pinField = document.querySelector('input[id$="-pin"]') as HTMLInputElement | null
  if (pinField) pinField.value = pin
  await click(button(/Import wallet/))
}

/** Step 1 to step 2: the Node, the first question of the walk. */
async function walk() {
  typeSeed(SEED)
  await click(button('Next'))
}

/** Step 1 to step 3: Open Check and auto-lock. */
async function walkToOpenCheck() {
  await walk()
  await click(button('Next'))
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
    expect(consumeAdded()).toBe('w-new')
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
    expect(h.importDuplicateReason).toHaveBeenCalledWith(SEED, 'testnet')
    expect(h.checkBeforeImport.mock.calls[0][1]).toBe('testnet')
    expect(h.checkBeforeImport.mock.calls[0][2]).toBe(ADDRESS)
  })

  it('the duplicate probe gets the Network chosen on step 1', async () => {
    await openImport()
    await click(screen.getByRole('radio', { name: /^Devnet/ }))
    await submit()
    await waitFor(() => expect(h.importDuplicateReason).toHaveBeenCalled())
    expect(h.importDuplicateReason).toHaveBeenCalledWith(SEED, 'devnet')
  })

  it.each([['Devnet', 'devnet'], ['Testnet', 'testnet']] as const)('the chosen network (%s) reaches the master-key check and the keystore', async (label, network) => {
    await openImport()
    await click(screen.getByRole('radio', { name: new RegExp(`^${label}`) }))
    await submit()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(h.checkBeforeImport.mock.calls[0][1]).toBe(network)
    expect(h.importStoredWallet.mock.calls[0][0]).toMatchObject({ network })
  })

  it('switching to Create clears a typed Seed from the field it leaves', async () => {
    await openImport()
    const field = seedInput()
    field.value = SEED
    await click(screen.getByRole('radio', { name: 'Create a new wallet' }))
    expect(field.value).toBe('')
  })

  it('offers Create and Import as radios, and asks no Seed Method and no signature type', async () => {
    await openImport()
    expect(screen.getByRole('radio', { name: 'Create a new wallet' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^(Generate|Import)$/ })).toBeNull()
    const legends = () => Array.from(document.querySelectorAll('legend')).map((l) => l.textContent)
    expect(screen.getByText('Step 1 of 5')).toBeTruthy()
    typeSeed(SEED)
    await click(button('Next'))
    expect(document.querySelectorAll('dt').length).toBe(0)
    expect(screen.queryByRole('button', { name: 'Walk me through it' })).toBeNull()
    const seen: string[] = []
    for (const n of [2, 3, 4, 5]) {
      expect(screen.getByText(`Step ${n} of 5`)).toBeTruthy()
      seen.push(screen.getByRole('heading', { level: 2 }).textContent ?? '', ...legends())
      if (n < 5) {
        expect(screen.queryByRole('button', { name: 'Import wallet' })).toBeNull()
        await click(button('Next'))
      }
    }
    expect(seen).toEqual(['Node', 'Node', 'Authentication to open the wallet, and auto-lock', 'Authentication required to open the wallet', 'Auto-lock after inactivity', 'Authentication to sign a transaction', 'Authentication required to sign a transaction', 'Review'])
    // The Review for an import: no Seed Method, Passkey or Signature type row, and no Seed.
    const terms = Array.from(document.querySelectorAll('dt')).map((dt) => dt.textContent)
    expect(terms).toEqual(['Create or import', 'Label', 'Network', 'Node', 'Authentication required to open the wallet', 'Auto-lock', 'Authentication required to sign a transaction'])
    expect(document.body.textContent).not.toContain(SEED)
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
    expect(button('Import wallet')).toBeTruthy()
  })

  it('Import wallet is on the last step only, and a Seed typed on step 1 is still imported from it', async () => {
    await openImport()
    expect(seedInput().closest('[hidden]')).toBeNull() // visible on step 1
    typeSeed(SEED)
    await click(button('Next'))
    expect(seedInput().value).toBe(SEED) // still mounted, hidden
    expect(seedInput().closest('[hidden]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /Import wallet|Create wallet/ })).toBeNull()
    await click(button('Next'))
    await click(button('Next'))
    await click(button('Next'))
    expect(screen.queryByRole('button', { name: /Create wallet/ })).toBeNull()
    const pinField = document.querySelector('input[id$="-pin"]') as HTMLInputElement
    pinField.value = '123456'
    await click(button('Import wallet'))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(h.importStoredWallet.mock.calls[0][0]).toMatchObject({ seed: SEED, network: 'testnet' })
  })

  it('defaults the Open Check to the App PIN, or to a passkey where one is known to work', async () => {
    await openImport()
    await walkToOpenCheck()
    expect((screen.getByRole('radio', { name: /^App PIN$/ }) as HTMLInputElement).checked).toBe(true)
    cleanup()
    h.capability = 'yes'
    await openImport()
    await walkToOpenCheck()
    expect((screen.getByRole('radio', { name: /^Passkey$/ }) as HTMLInputElement).checked).toBe(true)
  })
})

describe('the Seed field and step 1', () => {
  it('Next is aria-disabled with its reason as text until a Seed is typed, and does nothing', async () => {
    await openImport()
    const next = button('Next')
    expect(next.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('Type your Seed to continue.')).toBeTruthy()
    await click(next)
    expect(screen.getByText('Step 1 of 5')).toBeTruthy()
    typeSeed(SEED)
    expect(button('Next').getAttribute('aria-disabled')).toBeNull()
    await click(button('Next'))
    expect(screen.getByText('Step 2 of 5')).toBeTruthy()
  })

  it('a Seed cleared by hand blocks Next again', async () => {
    await openImport()
    typeSeed(SEED)
    typeSeed('')
    expect(button('Next').getAttribute('aria-disabled')).toBe('true')
  })

  it('a whitespace-only Seed leaves Next disabled with its reason', async () => {
    await openImport()
    typeSeed('   ')
    expect(button('Next').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('Type your Seed to continue.')).toBeTruthy()
  })

  it('typing a new Seed clears the refusal reason', async () => {
    await openImport()
    await submit('garbage-not-a-seed')
    await screen.findByText(INVALID)
    typeSeed(SEED)
    expect(screen.queryByText(INVALID)).toBeNull()
    expect(seedInput().getAttribute('aria-invalid')).not.toBe('true')
  })

  it('an invalid Seed returns to step 1 with the reason beside the field', async () => {
    await openImport()
    await submit('garbage-not-a-seed')
    const reason = await screen.findByText(INVALID)
    expect(screen.getByText('Step 1 of 5')).toBeTruthy()
    expect(reason.closest('[hidden]')).toBeNull()
    expect(seedInput().getAttribute('aria-describedby')).toBe(reason.id)
    expect(button('Next').getAttribute('aria-disabled')).toBe('true') // the field was cleared
    expect(h.importStoredWallet).not.toHaveBeenCalled()
  })

  it('a duplicate Seed returns to step 1 with the reason beside the field', async () => {
    h.importDuplicateReason.mockResolvedValue(DUPLICATE)
    await openImport()
    await submit()
    const reason = await screen.findByText(DUPLICATE)
    expect(screen.getByText('Step 1 of 5')).toBeTruthy()
    expect(reason.closest('[hidden]')).toBeNull()
  })

  it('a refusal that is not about the Seed stays on the last step', async () => {
    h.importStoredWallet.mockResolvedValue({ status: 'refused', reason: 'The policy said no.' })
    await openImport()
    await submit()
    await screen.findByText('The policy said no.')
    expect(screen.getByText('Step 5 of 5')).toBeTruthy()
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

describe('the walk, to its last step', () => {
  it('keeps the PIN and the Seed across Next and Back, and imports from the Review with a changed answer', async () => {
    await openImport()
    typeSeed(SEED)
    await click(button('Next'))
    const pinField = () => document.querySelector('input[id$="-pin"]') as HTMLInputElement
    const pinHidden = () => pinField().closest('[hidden]') !== null
    expect(screen.getByText('Step 2 of 5')).toBeTruthy()
    expect(pinHidden()).toBe(true)
    await click(button('Next'))
    expect(screen.getByText('Step 3 of 5')).toBeTruthy()
    expect(pinHidden()).toBe(true)
    await click(button('Next'))
    expect(screen.getByText('Step 4 of 5')).toBeTruthy()
    await click(screen.getByRole('radio', { name: /^App PIN only/ }))
    await click(button('Next'))
    expect(screen.getByText('Step 5 of 5')).toBeTruthy()
    expect(pinHidden()).toBe(false)
    pinField().value = '123456'
    expect(seedInput().value).toBe(SEED)
    // Back to step 2 and forward again: nothing typed is lost.
    await click(button('Back'))
    await click(button('Back'))
    await click(button('Back'))
    expect(screen.getByText('Step 2 of 5')).toBeTruthy()
    expect(pinHidden()).toBe(true)
    await click(button('Next'))
    await click(button('Next'))
    await click(button('Next'))
    expect(screen.getByText('Step 5 of 5')).toBeTruthy()
    expect(pinField().value).toBe('123456')
    expect(seedInput().value).toBe(SEED)
    await click(button('Import wallet'))
    await waitFor(() => expect(h.importStoredWallet).toHaveBeenCalledTimes(1))
    expect(h.importDuplicateReason).toHaveBeenCalledWith(SEED, 'testnet')
    expect(h.checkBeforeImport).toHaveBeenCalledTimes(1)
    expect(h.importStoredWallet.mock.calls[0][0]).toMatchObject({ seed: SEED, network: 'testnet', signing: 'pin' })
  })
})

describe('Open Check none', () => {
  it.each([/^Testnet/, /^Devnet/, /^Mainnet/])('is aria-disabled with a visible reason on %s', async (network) => {
    await openImport()
    await click(screen.getByRole('radio', { name: network }))
    await walkToOpenCheck()
    const none = screen.getByRole('radio', { name: /^No authentication required to open the wallet/ })
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
    expect((await screen.findByRole('alert')).textContent).toContain('Could not import the wallet. Nothing was imported.')
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

describe('Create or Import is the first question', () => {
  const radio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement
  const noPath = () => {
    expect(screen.queryByRole('radio', { name: /Create a new wallet|Import a wallet/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^(Generate|Import)$/ })).toBeNull()
  }

  it('step 1 titles the question, selects Create, and shows no Seed field', async () => {
    render(<AddWalletScreen onClose={onClose} />)
    await screen.findByRole('radio', { name: 'Create a new wallet' })
    expect(screen.getByText('Step 1 of 7')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Create or import')
    expect(screen.getAllByText('Create or import').filter((el) => !el.className.includes('sr-only')).length).toBe(1)
    expect(radio('Create a new wallet').checked).toBe(true)
    expect(radio('Import a wallet').checked).toBe(false)
    expect(seedInput()).toBeNull()
    expect(screen.getByLabelText('Label')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^(Generate|Import)$/ })).toBeNull()
  })

  it('choosing Import shows the Seed field above the Label, as Step 1 of 5, with focus on the radio', async () => {
    await openImport()
    expect(screen.getByText('Step 1 of 5')).toBeTruthy()
    expect(radio('Import a wallet').checked).toBe(true)
    expect(document.activeElement).toBe(radio('Import a wallet'))
    expect(seedInput().compareDocumentPosition(screen.getByLabelText('Label')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('Type your Seed to continue.')).toBeTruthy()
  })

  it('changing Network on step 1 of Import keeps the Seed, shows the line, and the Review has the default rows', async () => {
    await openImport()
    typeSeed(SEED)
    await click(button('Next'))
    await click(button('Next'))
    await click(screen.getByRole('radio', { name: /^No authentication required to open the wallet/ }))
    await click(button('Back'))
    await click(button('Back'))
    await click(screen.getByRole('radio', { name: /^Devnet/ }))
    expect(seedInput().value).toBe(SEED)
    expect(screen.getByRole('status').textContent).toBe('The later questions start again.')
    for (let guard = 0; guard < 6 && screen.queryByRole('button', { name: 'Next' }); guard++) await click(button('Next'))
    const row = (term: string) => screen.getByText(term, { selector: 'dt' }).parentElement?.textContent ?? ''
    expect(row('Node')).toContain('Built-in Nodes')
    expect(row('Network')).toContain('Devnet')
    expect(text()).not.toContain('No authentication required to open the wallet')
  })

  it('the Review says what the imported wallet holds: test funds on Testnet, real funds and a stamp on Mainnet', async () => {
    await openImport()
    typeSeed(SEED)
    for (let guard = 0; guard < 6 && screen.queryByRole('button', { name: 'Next' }); guard++) await click(button('Next'))
    expect(text()).toContain('This wallet holds test funds only.')
    expect(screen.queryByText('Real funds')).toBeNull()
    await click(button('Back'))
    await click(button('Back'))
    await click(button('Back'))
    await click(button('Back'))
    await click(screen.getByRole('radio', { name: /^Mainnet/ }))
    for (let guard = 0; guard < 6 && screen.queryByRole('button', { name: 'Next' }); guard++) await click(button('Next'))
    expect(text()).toContain('This wallet holds real funds. Nobody can recover its Seed for you.')
    expect(screen.getByText('Real funds')).toBeTruthy()
  })

  it('the Review states the Mainnet fact beside Real funds on Mainnet only, and Import wallet still imports', async () => {
    const FACT = 'A Seed you used on another Network is the same key on Mainnet.'
    for (const label of ['Testnet', 'Devnet']) {
      cleanup()
      await openImport()
      await click(screen.getByRole('radio', { name: new RegExp(`^${label}`) }))
      typeSeed(SEED)
      for (let guard = 0; guard < 6 && screen.queryByRole('button', { name: 'Next' }); guard++) await click(button('Next'))
      expect(button('Import wallet'), label).toBeTruthy()
      expect(text(), label).not.toContain(FACT)
    }
    cleanup()
    await openImport()
    await click(screen.getByRole('radio', { name: /^Mainnet/ }))
    await submit()
    await waitFor(() => expect(h.importStoredWallet).toHaveBeenCalledTimes(1))
    expect(h.importStoredWallet.mock.calls[0][0]).toMatchObject({ network: 'mainnet' })
    cleanup()
    await openImport()
    await click(screen.getByRole('radio', { name: /^Mainnet/ }))
    typeSeed(SEED)
    for (let guard = 0; guard < 6 && screen.queryByRole('button', { name: 'Next' }); guard++) await click(button('Next'))
    const fact = screen.getByText(FACT)
    expect(fact.closest('section')).toBe(screen.getByText('Real funds').closest('section'))
    expect(fact.getAttribute('role')).toBeNull()
  })

  it('choosing Create again puts focus on the Create radio', async () => {
    await openImport()
    await click(radio('Create a new wallet'))
    expect(document.activeElement).toBe(radio('Create a new wallet'))
  })

  it('no path control on any later step, on either path', async () => {
    await openImport()
    typeSeed(SEED)
    for (let n = 2; n <= 5; n++) {
      await click(button('Next'))
      noPath()
    }
    cleanup()
    render(<AddWalletScreen onClose={onClose} />)
    await screen.findByRole('radio', { name: 'Create a new wallet' })
    for (let n = 2; n <= 7; n++) {
      await click(button('Next'))
      noPath()
    }
  })

  it('Back then a changed path starts the answers again', async () => {
    await openImport()
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Savings' } })
    await click(screen.getByRole('radio', { name: /^Mainnet/ }))
    typeSeed(SEED)
    await click(button('Next'))
    await click(button('Back'))
    expect(seedInput().value).toBe(SEED)
    await click(radio('Create a new wallet'))
    expect(screen.getByText('Step 1 of 7')).toBeTruthy()
    expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('')
    expect((screen.getByRole('radio', { name: /^Testnet/ }) as HTMLInputElement).checked).toBe(true)
    await click(radio('Import a wallet'))
    expect(seedInput().value).toBe('')
  })

  it('Back without a change keeps the Label, Network and Seed', async () => {
    await openImport()
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Savings' } })
    await click(screen.getByRole('radio', { name: /^Devnet/ }))
    typeSeed(SEED)
    await click(button('Next'))
    await click(button('Back'))
    expect((screen.getByLabelText('Label') as HTMLInputElement).value).toBe('Savings')
    expect((screen.getByRole('radio', { name: /^Devnet/ }) as HTMLInputElement).checked).toBe(true)
    expect(seedInput().value).toBe(SEED)
    expect(radio('Import a wallet').checked).toBe(true)
  })
})

describe('busy guards', () => {
  it('the screen cannot be left or the mode switched while the check runs', async () => {
    h.checkBeforeImport.mockReturnValue(new Promise(() => {}))
    await openImport()
    await submit()
    expect((screen.getByRole('button', { name: 'Wallets' }) as HTMLButtonElement).disabled).toBe(true)
    // The path is asked on step 1 only, and Back is inert while busy: no way to change it mid-run.
    expect(screen.queryByRole('radio', { name: /Create a new wallet|Import a wallet/ })).toBeNull()
    expect((screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement).disabled).toBe(true)
    expect(seedInput().disabled).toBe(true)
  })

  it('the real Create and Import radios are natively disabled when the host says creating', async () => {
    render(
      <CreateWalletFlow
        defaultLabel=""
        onDone={() => {}}
        pathChoice={{ value: 'create', disabled: true, onChange: () => {} }}
      />,
    )
    const radios = await screen.findAllByRole('radio', { name: /^(Create a new wallet|Import a wallet)$/ })
    expect(radios).toHaveLength(2)
    for (const r of radios) expect((r as HTMLInputElement).disabled).toBe(true)
  })

  it('the same radios are enabled when neither the host nor the flow is busy', async () => {
    render(
      <CreateWalletFlow
        defaultLabel=""
        onDone={() => {}}
        pathChoice={{ value: 'create', disabled: false, onChange: () => {} }}
      />,
    )
    const radios = await screen.findAllByRole('radio', { name: /^(Create a new wallet|Import a wallet)$/ })
    for (const r of radios) expect((r as HTMLInputElement).disabled).toBe(false)
  })
})

describe('first-run Onboarding', () => {
  it('step 1 of its real flow (Name and network) shows no Create or Import radios', async () => {
    render(<Onboarding />)
    await click(await screen.findByRole('button', { name: 'Create a new wallet' }))
    expect((await screen.findByRole('heading', { level: 2 })).textContent).toBe('Name and network')
    expect(screen.queryByRole('radio', { name: /Create a new wallet|Import a wallet/ })).toBeNull()
  })

  it('shows exactly one button named Back (the quiz) and one named Back to start, which returns to the entry choice', async () => {
    render(<Onboarding />)
    await click(await screen.findByRole('button', { name: 'Create a new wallet' }))
    await screen.findByRole('heading', { level: 2 })
    expect(screen.getAllByRole('button', { name: /^Back$/ })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^Back to start$/ })).toHaveLength(1)
    await click(screen.getByRole('button', { name: 'Back to start' }))
    expect(await screen.findByRole('button', { name: 'Create a new wallet' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Back$/ })).toBeNull()
  })
})

describe('the Mainnet fact is display only', () => {
  it('its sentence is written once in check-words.ts and no policy file under src/lib/crypto mentions it', () => {
    const sentence = 'A Seed you used on another Network is the same key on Mainnet.'
    const words = readFileSync('src/components/wallet/check-words.ts', 'utf8')
    expect(words.split(sentence).length - 1).toBe(1)
    const dir = 'src/lib/crypto'
    for (const f of readdirSync(dir, { recursive: true }) as string[]) {
      if (!/\.tsx?$/.test(f) || /__tests__|\.test\./.test(f)) continue
      const src = readFileSync(`${dir}/${f}`, 'utf8')
      expect(src, f).not.toContain(sentence)
      expect(src, f).not.toMatch(/IMPORT_MAINNET_FACT|importMainnetFact/)
    }
  })
})
