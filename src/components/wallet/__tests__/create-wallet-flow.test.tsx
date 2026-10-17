/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

/**
 * Story 5: the creation flow asks one question per axis, in order, each with a
 * pre-selected answer, and RENDERS what `lib/crypto/policy.ts` says. The
 * keystore and the ledger are stubbed at their edges; the policy is the real one
 * (and, in one test, a stand-in that proves the screen decides nothing itself).
 */
const SEED = 'sEdTM1uX8pu2do5XvTnutH6HsouMaM2'

const h = vi.hoisted(() => ({
  capability: 'no' as 'yes' | 'no' | 'unknown',
  appPin: false,
  pinReadFails: false,
  verifyDeferred: null as null | ((ok: boolean) => void),
  createStoredWallet: vi.fn(),
  createDerivedWallet: vi.fn(),
  rpId: 'localhost' as string | null,
  verifyNode: vi.fn(),
  startLockSession: vi.fn(async () => {}),
  policyOverride: null as null | ((described: any) => any),
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/webauthn', () => ({ detectPrfSupport: async () => h.capability, getRpId: () => {
    if (h.rpId === null) throw new Error('no rpId')
    return h.rpId
  },
}))
vi.mock('@/lib/crypto/lock', () => ({
  hasAppPin: async () => {
    if (h.pinReadFails) throw new Error('idb down')
    return h.appPin
  },
  startLockSession: (...a: unknown[]) => h.startLockSession(...(a as [])),
}))
vi.mock('@/lib/crypto/pin', () => ({ triesRemaining: async () => 8 }))
vi.mock('@/lib/xrpl/client', () => ({ verifyNode: (...a: unknown[]) => h.verifyNode(...a) }))
vi.mock('@/lib/crypto/keystore', () => ({
  createStoredWallet: (...a: unknown[]) => h.createStoredWallet(...a),
  createDerivedWallet: (...a: unknown[]) => h.createDerivedWallet(...a),
  listWallets: async () => [META],
  describeCheckFailure: (r: { status: string; triesRemaining?: number }) =>
    r.status === 'wrong-credential' ? `Incorrect PIN. ${r.triesRemaining} tries remaining.` : 'Locked out.',
}))
vi.mock('@/lib/crypto/policy', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/crypto/policy')>()
  // Looked up at call time, so a test can swap the policy after the import.
  return {
    ...real,
    describeOptions: (ctx: Parameters<typeof real.describeOptions>[0]) =>
      h.policyOverride ? h.policyOverride(real.describeOptions(ctx)) : real.describeOptions(ctx),
  }
})

import { CreateWalletFlow } from '../CreateWalletFlow'
import { useAppStore } from '@/store/app-store'

const META = {
  id: 'w1',
  seedId: 'w1',
  lockId: 'lock-1',
  label: 'Savings',
  address: 'rAddr',
  createdAt: 1,
  network: 'testnet',
  algorithm: 'ed25519',
  openCheck: 'pin',
  signingCheck: 'standard',
  seedMethod: 'stored',
}
const KEY = { type: 'secret' } as unknown as CryptoKey
const created = () => ({ status: 'ok', value: { meta: META, openKey: KEY, seed: SEED } })

async function mount(props: Parameters<typeof CreateWalletFlow>[0] = {}) {
  render(<CreateWalletFlow {...props} />)
  await screen.findByText('Seed Method')
}

const radioNamed = (name: RegExp | string) => screen.getByRole('radio', { name }) as HTMLInputElement
const legends = () => Array.from(document.querySelectorAll('legend')).map((l) => l.textContent)
const createButton = () => screen.getByRole('button', { name: /Create wallet/ })
const click = async (el: HTMLElement) => act(async () => void fireEvent.click(el))
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })

beforeEach(() => {
  h.capability = 'no'
  h.appPin = false
  h.pinReadFails = false
  h.verifyDeferred = null
  h.policyOverride = null
  h.createStoredWallet.mockReset().mockResolvedValue(created())
  h.createDerivedWallet.mockReset().mockResolvedValue({ status: 'ok', value: { meta: { ...META, seedMethod: 'passkey-derived' }, openKey: KEY, ordinal: '048213', backupEligible: true } })
  h.rpId = 'localhost'
  h.verifyNode.mockReset().mockResolvedValue(undefined)
  h.startLockSession.mockClear()
  useAppStore.setState({ wallets: [], activeWalletId: null, openLocks: {} } as never)
})
afterEach(cleanup)

describe('the questions and their pre-selected answers', () => {
  it('asks in the FR-60 order', async () => {
    await mount()
    expect(legends()).toEqual([
      'Network',
      'Node',
      'Seed Method',
      'Signature type',
      'Open Check',
      'Auto-lock after inactivity',
      'Signing Check',
    ])
  })

  it('pre-selects Testnet, the built-in Nodes, Stored Seed, Ed25519, App PIN, 5 minutes, Standard (no PRF)', async () => {
    await mount()
    expect(radioNamed(/^Testnet/).checked).toBe(true)
    expect(radioNamed(/^Built-in Nodes/).checked).toBe(true)
    expect(screen.getByText(/wss:\/\/s\.altnet\.rippletest\.net:51233/)).toBeTruthy()
    expect(radioNamed(/^Stored Seed/).checked).toBe(true)
    expect(radioNamed('Ed25519').checked).toBe(true)
    expect(radioNamed('App PIN').checked).toBe(true)
    expect(radioNamed('5 minutes').checked).toBe(true)
    expect(radioNamed(/^Standard/).checked).toBe(true)
  })

  it('with a known PRF the Open Check defaults to a passkey; Signing stays Standard on Testnet and becomes passkey on Mainnet', async () => {
    h.capability = 'yes'
    await mount()
    expect(radioNamed('Passkey').checked).toBe(true)
    expect(radioNamed(/^Standard/).checked).toBe(true)
    await click(radioNamed(/^Mainnet/))
    expect(radioNamed(/^Passkey only/).checked).toBe(true)
  })

  it('on Mainnet without PRF the Signing Check defaults to the App PIN', async () => {
    await mount()
    await click(radioNamed(/^Mainnet/))
    expect(radioNamed(/^App PIN only/).checked).toBe(true)
  })

  it('the pre-selected pair on Mainnet with PRF is allowed, because this flow confirms the written Seed first', async () => {
    h.capability = 'yes'
    await mount()
    await click(radioNamed(/^Mainnet/))
    expect(createButton().getAttribute('aria-disabled')).toBeNull()
    expect(screen.queryByText(/needs a written, confirmed Seed/)).toBeNull()
  })
})

describe('unavailable answers', () => {
  it('Passkey-Derived without PRF is aria-disabled with the reason as text, and does nothing when clicked', async () => {
    await mount()
    const derived = radioNamed(/^Passkey-Derived Seed/)
    expect(derived.getAttribute('aria-disabled')).toBe('true')
    await click(derived)
    expect(radioNamed(/^Stored Seed/).checked).toBe(true)
    expect(derived.checked).toBe(false)
    expect(derived.disabled).toBe(false) // aria-disabled, not removed from the reading order
    expect(screen.queryByText(/Not available in this version yet/)).toBeNull()
  })

  it('Passkey-Derived on Mainnet at a b-cdn.net origin is aria-disabled with the reason, and creation is refused', async () => {
    h.capability = 'yes'
    h.rpId = 'sites-xrpl-bench-prod-pdbywc.b-cdn.net'
    await mount()
    await click(radioNamed(/^Passkey-Derived Seed/))
    expect(radioNamed(/^Passkey-Derived Seed/).checked).toBe(true)
    await click(radioNamed(/^Mainnet/))
    const derived = radioNamed(/^Passkey-Derived Seed/)
    expect(derived.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getAllByText(/tied to a temporary web address/).length).toBeGreaterThan(0)
    expect(createButton().getAttribute('aria-disabled')).toBe('true')
    await click(createButton())
    expect(h.createDerivedWallet).not.toHaveBeenCalled()
    // Testnet is unaffected.
    await click(radioNamed(/^Testnet/))
    expect(radioNamed(/^Passkey-Derived Seed/).getAttribute('aria-disabled')).toBeNull()
  })

  it('Mainnet: no Open Check and an auto-lock under a minute are aria-disabled with reasons, and creation cannot proceed', async () => {
    await mount()
    await click(radioNamed(/^Mainnet/))
    const none = radioNamed(/^No Open Check/)
    expect(none.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getAllByText(/A Mainnet wallet needs an Open Check/).length).toBeGreaterThan(0)
    const half = radioNamed('30 seconds')
    expect(half.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/at least 1 minute/)).toBeTruthy()
    // Forcing them on: still refused, nothing created.
    await click(none)
    expect(none.checked).toBe(false)
    await click(radioNamed('1 minute'))
    expect(createButton().getAttribute('aria-disabled')).toBeNull()
  })

  it('Testnet may use no Open Check; switching to Mainnet then blocks it with the reason', async () => {
    await mount()
    await click(radioNamed(/^No Open Check/))
    expect(radioNamed(/^No Open Check/).checked).toBe(true)
    expect(createButton().getAttribute('aria-disabled')).toBeNull()
    await click(radioNamed(/^Mainnet/))
    expect(createButton().getAttribute('aria-disabled')).toBe('true')
    expect(screen.getAllByText(/A Mainnet wallet needs an Open Check/).length).toBeGreaterThan(0)
    await click(createButton())
    expect(h.createStoredWallet).not.toHaveBeenCalled()
  })

  it('no PRF: both passkey answers are aria-disabled with the reason visible, and the defaults are the App PIN', async () => {
    await mount()
    expect(radioNamed('Passkey').getAttribute('aria-disabled')).toBe('true')
    expect(radioNamed(/^Passkey only/).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getAllByText(/cannot use a passkey/).length).toBe(3) // Passkey, Passkey only, Passkey-Derived
    expect(radioNamed('App PIN').checked).toBe(true)
  })

  it('PRF unknown: passkey answers are available with a visible note', async () => {
    h.capability = 'unknown'
    await mount()
    expect(radioNamed('Passkey').getAttribute('aria-disabled')).toBeNull()
    expect(screen.getAllByText('Checked when the passkey is created.').length).toBe(3)
    expect(radioNamed('App PIN').checked).toBe(true)
  })

  it('renders the policy, and decides nothing itself: a stand-in policy changes what is offered and blocked', async () => {
    h.policyOverride = (d) => ({
      ...d,
      openCheck: { ...d.openCheck, pin: { available: false, reason: 'SENTINEL: the policy said no.' } },
      combination: { ok: false, reason: 'SENTINEL combination.' },
    })
    await mount()
    expect(radioNamed('App PIN').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('SENTINEL: the policy said no.')).toBeTruthy()
    expect(screen.getByText('SENTINEL combination.')).toBeTruthy()
    expect(createButton().getAttribute('aria-disabled')).toBe('true')
    await click(createButton())
    expect(h.createStoredWallet).not.toHaveBeenCalled()
  })
})

describe('a rule leaking into the screen would show here', () => {
  it('a policy that allows everything is believed: Mainnet with no Open Check and 30 seconds is offered and created', async () => {
    h.policyOverride = (d) => ({
      ...d,
      openCheck: { pin: { available: true }, passkey: { available: true }, none: { available: true } },
      autoLock: d.autoLock.map((c: object) => ({ ...c, available: true })),
      combination: { ok: true },
    })
    await mount()
    await click(radioNamed(/^Mainnet/))
    await click(radioNamed(/^No Open Check/))
    await click(radioNamed('30 seconds'))
    expect(radioNamed(/^No Open Check/).getAttribute('aria-disabled')).toBeNull()
    expect(radioNamed('30 seconds').getAttribute('aria-disabled')).toBeNull()
    expect(createButton().getAttribute('aria-disabled')).toBeNull()
    await screen.findByLabelText('Confirm the App PIN') // the default signing check still wants a PIN
    type(screen.getByLabelText(/Choose an App PIN/), '123456')
    type(screen.getByLabelText('Confirm the App PIN'), '123456')
    await click(createButton())
    expect(h.createStoredWallet.mock.calls[0][0]).toMatchObject({ network: 'mainnet', openCheck: 'none', autoLockMinutes: 0.5 })
  })
})

describe('the App PIN', () => {
  it('a first PIN is asked twice; a mismatch blocks', async () => {
    await mount()
    await screen.findByLabelText('Confirm the App PIN')
    type(screen.getByLabelText(/Choose an App PIN/), '123456')
    type(screen.getByLabelText('Confirm the App PIN'), '654321')
    await click(createButton())
    expect(screen.getByText("The two PINs don't match.")).toBeTruthy()
    expect(h.createStoredWallet).not.toHaveBeenCalled()
  })

  it('a PIN under 6 digits blocks', async () => {
    await mount()
    await screen.findByLabelText('Confirm the App PIN')
    type(screen.getByLabelText(/Choose an App PIN/), '123')
    type(screen.getByLabelText('Confirm the App PIN'), '123')
    await click(createButton())
    expect(screen.getByText('The App PIN must be at least 6 digits.')).toBeTruthy()
    expect(h.createStoredWallet).not.toHaveBeenCalled()
  })

  it('an existing App PIN is asked for once, with tries remaining', async () => {
    h.appPin = true
    await mount()
    expect(await screen.findByLabelText('Your App PIN')).toBeTruthy()
    expect(screen.queryByLabelText('Confirm the App PIN')).toBeNull()
    expect(screen.getByText(/8 tries remaining/)).toBeTruthy()
  })

  it('is not asked for when neither check uses it', async () => {
    await mount()
    await click(radioNamed(/^No Open Check/))
    expect(screen.queryByLabelText('Your App PIN')).toBeNull()
    expect(screen.queryByLabelText(/Choose an App PIN/)).toBeNull()
  })

  it('passes the typed PIN once and clears the field', async () => {
    await mount()
    await screen.findByLabelText('Confirm the App PIN')
    type(screen.getByLabelText(/Choose an App PIN/), '123456')
    type(screen.getByLabelText('Confirm the App PIN'), '123456')
    await click(createButton())
    expect(h.createStoredWallet).toHaveBeenCalledTimes(1)
    expect(h.createStoredWallet.mock.calls[0][1]).toMatchObject({ pin: '123456' })
    expect(h.createStoredWallet.mock.calls[0][0]).toMatchObject({
      network: 'testnet',
      algorithm: 'ed25519',
      openCheck: 'pin',
      autoLockMinutes: 5,
      signing: 'standard',
      passkey: 'no',
    })
  })
})

describe('a failed App PIN read', () => {
  it('says so with Retry, blocks Create, and recovers on retry', async () => {
    h.pinReadFails = true
    await mount()
    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not read the App PIN state/)
    expect(screen.queryByLabelText(/Choose an App PIN/)).toBeNull()
    expect(createButton().getAttribute('aria-disabled')).toBe('true')
    await click(createButton())
    expect(h.createStoredWallet).not.toHaveBeenCalled()
    h.pinReadFails = false
    await click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByLabelText(/Choose an App PIN/)).toBeTruthy()
    expect(createButton().getAttribute('aria-disabled')).toBeNull()
  })
})

describe('results', () => {
  async function submit() {
    await screen.findByLabelText('Confirm the App PIN')
    type(screen.getByLabelText(/Choose an App PIN/), '123456')
    type(screen.getByLabelText('Confirm the App PIN'), '123456')
    await click(createButton())
  }

  it.each([
    [{ status: 'refused', reason: 'Refused for a reason.' }, 'Refused for a reason.'],
    [{ status: 'cancelled' }, 'Cancelled. Nothing was created.'],
    [{ status: 'unsupported' }, /could not use a passkey/],
    [{ status: 'wrong-credential', kind: 'pin', triesRemaining: 6 }, /Incorrect PIN. 6 tries remaining. Nothing was created./],
  ])('shows %j and moves on to no backup', async (result, text) => {
    h.createStoredWallet.mockResolvedValue(result)
    await mount()
    await submit()
    expect((await screen.findByRole('alert')).textContent).toMatch(text)
    expect(screen.queryByText('Back up your seed')).toBeNull()
    expect(useAppStore.getState().wallets).toEqual([])
  })

  it('a thrown failure is shown and nothing is committed', async () => {
    h.createStoredWallet.mockRejectedValue(new Error('put failed'))
    await mount()
    await submit()
    expect((await screen.findByRole('alert')).textContent).toBe('put failed')
    expect(useAppStore.getState().wallets).toEqual([])
  })
})

describe('a created Wallet: backup first, then the store', () => {
  it('commits only after the backup is confirmed, opens its own lock first, and keeps the Seed out of state and storage', async () => {
    const inProgress: boolean[] = []
    const done = vi.fn()
    await mount({ onInProgressChange: (b) => inProgress.push(b), onDone: done })
    await screen.findByLabelText('Confirm the App PIN')
    type(screen.getByLabelText(/Choose an App PIN/), '123456')
    type(screen.getByLabelText('Confirm the App PIN'), '123456')
    await click(createButton())

    expect(await screen.findByText('Back up your seed')).toBeTruthy()
    // Not yet in the store: the Gate would skip the backup screen.
    expect(useAppStore.getState().wallets).toEqual([])
    expect(useAppStore.getState().openLocks).toEqual({})
    // The Seed is masked in the DOM until asked, and is nowhere serializable.
    expect(document.body.textContent).not.toContain(SEED)
    for (const store of [localStorage, sessionStorage]) expect(JSON.stringify({ ...store })).not.toContain(SEED)

    const continueButton = screen.getByRole('button', { name: 'Continue to my wallet' }) as HTMLButtonElement
    expect(continueButton.disabled).toBe(true)
    await click(screen.getByRole('checkbox'))
    await click(continueButton)

    await waitFor(() => expect(done).toHaveBeenCalledWith(META))
    expect(h.startLockSession).toHaveBeenCalledWith('lock-1', KEY, 5)
    const state = useAppStore.getState()
    expect(Object.keys(state.openLocks)).toEqual(['lock-1'])
    expect(state.wallets).toEqual([META])
    expect(state.activeWalletId).toBe('w1')
    expect(JSON.stringify({ wallets: state.wallets, activeWalletId: state.activeWalletId })).not.toContain(SEED)
    expect(inProgress).toEqual([true, false])
  })
})

describe('the Node', () => {
  it('a Node that fails the network check is refused with its reason, and the built-in choice stays', async () => {
    h.verifyNode.mockRejectedValue(new Error('That Node reports another network.'))
    await mount()
    await click(radioNamed(/^A Node you choose/))
    type(screen.getByLabelText(/Node address/), 'wss://other.example.com')
    await click(screen.getByRole('button', { name: 'Test this Node' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/That Node reports another network\./)
    expect(h.verifyNode).toHaveBeenCalledWith('testnet', 'wss://other.example.com')
    expect(radioNamed(/^Built-in Nodes/).checked).toBe(true)
  })

  it('a proven Node is sent with the Wallet; an untested one blocks', async () => {
    await mount()
    await click(radioNamed(/^A Node you choose/))
    type(screen.getByLabelText(/Node address/), 'wss://node.example.com')
    await screen.findByLabelText('Confirm the App PIN')
    type(screen.getByLabelText(/Choose an App PIN/), '123456')
    type(screen.getByLabelText('Confirm the App PIN'), '123456')
    await click(createButton())
    expect(screen.getByText('Test the custom Node first, or use the built-in Nodes.')).toBeTruthy()
    expect(h.createStoredWallet).not.toHaveBeenCalled()
    await click(screen.getByRole('button', { name: 'Test this Node' }))
    await screen.findByText(/answers for this network/)
    await click(createButton())
    expect(h.createStoredWallet.mock.calls[0][0]).toMatchObject({ node: 'wss://node.example.com' })
  })

  it('the network cannot change while a Node test runs, so a result is never stored for another network', async () => {
    let finish: () => void = () => {}
    h.verifyNode.mockImplementation(() => new Promise<void>((resolve) => (finish = resolve)))
    await mount()
    await click(radioNamed(/^A Node you choose/))
    type(screen.getByLabelText(/Node address/), 'wss://node.example.com')
    await click(screen.getByRole('button', { name: 'Test this Node' }))
    expect(radioNamed(/^Devnet/).disabled).toBe(true)
    await act(async () => finish())
    await screen.findByText(/answers for this network/)
    expect(radioNamed(/^Devnet/).disabled).toBe(false)
  })

  it('changing the network drops a proven Node: it was proven for the other one', async () => {
    await mount()
    await click(radioNamed(/^A Node you choose/))
    type(screen.getByLabelText(/Node address/), 'wss://node.example.com')
    await click(screen.getByRole('button', { name: 'Test this Node' }))
    await screen.findByText(/answers for this network/)
    await click(radioNamed(/^Devnet/))
    expect(radioNamed(/^Built-in Nodes/).checked).toBe(true)
    expect(screen.queryByLabelText(/Node address/)).toBeNull()
  })
})

describe('Passkey-Derived Seed (story 6)', () => {
  it('on Mainnet with an unknown origin the option is aria-disabled with a visible reason', async () => {
    h.capability = 'yes'
    h.rpId = null
    await mount()
    await click(radioNamed(/^Mainnet/))
    expect(radioNamed(/^Passkey-Derived Seed/).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getAllByText(/could not be determined/).length).toBeGreaterThan(0)
    await click(radioNamed(/^Testnet/))
    expect(radioNamed(/^Passkey-Derived Seed/).getAttribute('aria-disabled')).toBeNull()
  })

  it('shows the domain warning and the existing-or-new choice before creation, and nothing for a stored Seed', async () => {
    h.capability = 'yes'
    await mount()
    expect(screen.queryByText(/depends on the app's domain/)).toBeNull()
    await click(radioNamed(/^Passkey-Derived Seed/))
    expect(screen.getByText(/depends on the app's domain/)).toBeTruthy()
    expect(screen.getByText(/tied to localhost/)).toBeTruthy()
    expect(screen.getByText(/Controlling Wallet/)).toBeTruthy()
    expect(radioNamed(/^Create a new passkey/).checked).toBe(true)
    expect(radioNamed(/^Use an existing passkey/).checked).toBe(false)
    // Its Signing Check is its passkey, and the others are aria-disabled with the policy's reason.
    expect(radioNamed(/^Passkey only/).checked).toBe(true)
    expect(radioNamed(/^Standard/).getAttribute('aria-disabled')).toBe('true')
    await click(radioNamed(/^Stored Seed/))
    expect(screen.queryByText(/depends on the app's domain/)).toBeNull()
    expect(radioNamed(/^Standard/).checked).toBe(true)
  })

  it('creates through createDerivedWallet with the chosen passkey, then shows the ordinal once and the kind statement, and no Seed', async () => {
    h.capability = 'yes'
    await mount({ onDone: vi.fn() })
    await click(radioNamed(/^Passkey-Derived Seed/))
    await click(radioNamed(/^Use an existing passkey/))
    await click(radioNamed('App PIN'))
    type(screen.getByLabelText(/Choose an App PIN/), '123456')
    type(screen.getByLabelText(/Confirm the App PIN/), '123456')
    await click(createButton())
    expect(h.createStoredWallet).not.toHaveBeenCalled()
    expect(h.createDerivedWallet).toHaveBeenCalledTimes(1)
    expect(h.createDerivedWallet.mock.calls[0][0]).toMatchObject({ passkeyChoice: 'existing', network: 'testnet', algorithm: 'ed25519' })
    expect(await screen.findByText('048213')).toBeTruthy()
    expect(screen.getByText('This passkey is synced')).toBeTruthy()
    expect(screen.getByText(/no restore screen yet/)).toBeTruthy()
    expect(screen.getByText(/passkey provider account/)).toBeTruthy()
    expect(screen.queryByText(/Back up your seed/)).toBeNull()
    expect(useAppStore.getState().wallets).toEqual([])
  })

  it.each([
    [false, 'This passkey is device-bound', /written Seed or a Controlling Wallet/],
    [undefined, /could not tell whether this passkey is synced or device-bound/, /If it is synced.*If it is device-bound/],
  ])('states the kind for BE %s', async (backupEligible, title, body) => {
    h.capability = 'yes'
    h.createDerivedWallet.mockResolvedValue({ status: 'ok', value: { meta: META, openKey: KEY, ordinal: '111222', backupEligible } })
    await mount()
    await click(radioNamed(/^Passkey-Derived Seed/))
    await click(radioNamed('App PIN'))
    type(screen.getByLabelText(/Choose an App PIN/), '123456')
    type(screen.getByLabelText(/Confirm the App PIN/), '123456')
    await click(createButton())
    expect(await screen.findByText(title)).toBeTruthy()
    expect(screen.getByText(body)).toBeTruthy()
  })

  it('a refusal or a cancel shows the reason and leaves the flow on its questions', async () => {
    h.capability = 'yes'
    h.createDerivedWallet.mockResolvedValue({ status: 'cancelled' })
    await mount()
    await click(radioNamed(/^Passkey-Derived Seed/))
    await click(radioNamed('App PIN'))
    type(screen.getByLabelText(/Choose an App PIN/), '123456')
    type(screen.getByLabelText(/Confirm the App PIN/), '123456')
    await click(createButton())
    expect(await screen.findByText('Cancelled. Nothing was created.')).toBeTruthy()
    expect(screen.getByText('Seed Method')).toBeTruthy()
  })

  it.each([
    [{ status: 'refused', reason: 'Refused for a stated reason.' }, 'Refused for a stated reason.'],
    [
      { status: 'unsupported' },
      'This device or browser could not use a passkey for this wallet. Nothing was created.',
    ],
  ])('a %o result shows its message and leaves the flow on its questions', async (result, message) => {
    h.capability = 'yes'
    h.createDerivedWallet.mockResolvedValue(result)
    await mount()
    await click(radioNamed(/^Passkey-Derived Seed/))
    await click(radioNamed('App PIN'))
    type(screen.getByLabelText(/Choose an App PIN/), '123456')
    type(screen.getByLabelText(/Confirm the App PIN/), '123456')
    await click(createButton())
    expect(await screen.findByText(message)).toBeTruthy()
    expect(screen.getByText('Seed Method')).toBeTruthy()
  })

  it('continuing from the ordinal commits the Wallet', async () => {
    h.capability = 'yes'
    const onDone = vi.fn()
    await mount({ onDone })
    await click(radioNamed(/^Passkey-Derived Seed/))
    await click(radioNamed('App PIN'))
    type(screen.getByLabelText(/Choose an App PIN/), '123456')
    type(screen.getByLabelText(/Confirm the App PIN/), '123456')
    await click(createButton())
    await screen.findByText('048213')
    expect((screen.getByRole('button', { name: /Continue to my wallet/ }) as HTMLButtonElement).disabled).toBe(true)
    await click(screen.getByRole('checkbox'))
    await click(screen.getByRole('button', { name: /Continue to my wallet/ }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(h.startLockSession).toHaveBeenCalled()
    expect(useAppStore.getState().activeWalletId).toBe('w1')
  })
})

describe('Written-Seed confirmation (story 7)', () => {
  /** A keystore that behaves as the real one: asks the callback, writes only on yes. */
  function realisticStored() {
    h.createStoredWallet.mockImplementation(async (_input: unknown, ctx: { confirmWrittenSeed: (seed: string) => Promise<boolean> }) =>
      (await ctx.confirmWrittenSeed(SEED)) ? created() : { status: 'cancelled' },
    )
  }
  const groups = () =>
    Array.from(document.querySelectorAll('label'))
      .map((l) => ({ m: /^Characters (\d+)–(\d+)$/.exec(l.textContent ?? ''), l }))
      .filter((x) => !!x.m)
      .map(({ m, l }) => ({ from: Number(m![1]), to: Number(m![2]), el: document.getElementById(l.htmlFor) as HTMLInputElement }))

  async function startMainnetPasskeyOnly() {
    h.capability = 'yes'
    realisticStored()
    const done = vi.fn()
    await mount({ onDone: done })
    await click(radioNamed(/^Mainnet/))
    await click(createButton())
    await screen.findByText('Write down your Seed')
    return done
  }

  it('shows the step before anything is committed, asks for three groups by character range, and says Mainnet', async () => {
    await startMainnetPasskeyOnly()
    expect(screen.getByText(/This is a Mainnet wallet/)).toBeTruthy()
    const asked = groups()
    expect(asked).toHaveLength(3)
    for (const g of asked) expect(g.to - g.from).toBe(3)
    expect(new Set(asked.map((g) => g.from)).size).toBe(3)
    expect(useAppStore.getState().wallets).toEqual([])
    expect(h.startLockSession).not.toHaveBeenCalled()
  })

  it('a wrong group stays on the step with the plain message, clears the answers, and allows another try', async () => {
    const done = await startMainnetPasskeyOnly()
    for (const g of groups()) type(g.el, 'zzzz')
    await click(screen.getByRole('button', { name: 'Check what I wrote' }))
    expect(screen.getByText('That does not match. Check what you wrote.')).toBeTruthy()
    for (const g of groups()) expect(g.el.value).toBe('')
    expect(done).not.toHaveBeenCalled()
    expect(h.startLockSession).not.toHaveBeenCalled()
    // Unlimited tries: the right answer still goes through.
    for (const g of groups()) type(g.el, SEED.slice(g.from - 1, g.to))
    await click(screen.getByRole('button', { name: 'Check what I wrote' }))
    await waitFor(() => expect(done).toHaveBeenCalledWith(META))
  })

  it('typing the challenged groups finishes directly: no second backup screen, no Seed kept', async () => {
    const done = await startMainnetPasskeyOnly()
    for (const g of groups()) type(g.el, ` ${SEED.slice(g.from - 1, g.to)} `)
    await click(screen.getByRole('button', { name: 'Check what I wrote' }))
    await waitFor(() => expect(done).toHaveBeenCalledWith(META))
    expect(screen.queryByText('Back up your seed')).toBeNull()
    expect(h.startLockSession).toHaveBeenCalledWith('lock-1', KEY, 5)
    expect(JSON.stringify(useAppStore.getState().wallets)).not.toContain(SEED)
  })

  it('Cancel writes nothing and returns to the questions', async () => {
    const done = await startMainnetPasskeyOnly()
    await click(screen.getByRole('button', { name: 'Cancel' }))
    await screen.findByText('Seed Method')
    expect(screen.getByText(/Nothing was created/)).toBeTruthy()
    expect(done).not.toHaveBeenCalled()
    expect(h.startLockSession).not.toHaveBeenCalled()
    expect(useAppStore.getState().wallets).toEqual([])
  })

  it('Testnet never shows the step: it goes to the ordinary backup', async () => {
    h.createStoredWallet.mockResolvedValue(created())
    await mount()
    await click(radioNamed(/^No Open Check/))
    await click(createButton())
    expect(await screen.findByText('Back up your seed')).toBeTruthy()
    expect(screen.queryByText('Write down your Seed')).toBeNull()
  })

  it('a Passkey-Derived Mainnet wallet is confirmed first, then shows its ordinal', async () => {
    h.capability = 'yes'
    h.createDerivedWallet.mockImplementation(async (_input: unknown, ctx: { confirmWrittenSeed: (seed: string) => Promise<boolean> }) =>
      (await ctx.confirmWrittenSeed(SEED))
        ? { status: 'ok', value: { meta: { ...META, seedMethod: 'passkey-derived' }, openKey: KEY, ordinal: '048213', backupEligible: true } }
        : { status: 'cancelled' },
    )
    await mount()
    await click(radioNamed(/^Mainnet/))
    await click(radioNamed(/^Passkey-Derived Seed/))
    await click(createButton())
    await screen.findByText('Write down your Seed')
    for (const g of groups()) type(g.el, SEED.slice(g.from - 1, g.to))
    await click(screen.getByRole('button', { name: 'Check what I wrote' }))
    expect(await screen.findByText('048213')).toBeTruthy()
  })

  it('a write that fails AFTER the confirmation returns to the questions with the reason, not a dead Seed screen', async () => {
    h.capability = 'yes'
    h.createStoredWallet.mockImplementation(async (_i: unknown, ctx: { confirmWrittenSeed: (seed: string) => Promise<boolean> }) => {
      await ctx.confirmWrittenSeed(SEED)
      return { status: 'cancelled' } // e.g. the passkey prompt for the new Signing Check is dismissed
    })
    await mount()
    await click(radioNamed(/^Mainnet/))
    await click(createButton())
    await screen.findByText('Write down your Seed')
    for (const g of groups()) type(g.el, SEED.slice(g.from - 1, g.to))
    await click(screen.getByRole('button', { name: 'Check what I wrote' }))

    expect(await screen.findByText('Cancelled. Nothing was created.')).toBeTruthy()
    expect(screen.queryByText('Write down your Seed')).toBeNull()
    expect(screen.getByText('Seed Method')).toBeTruthy()
    expect(h.startLockSession).not.toHaveBeenCalled()
  })

  it('a thrown write after the confirmation also returns to the questions', async () => {
    h.capability = 'yes'
    h.createStoredWallet.mockImplementation(async (_i: unknown, ctx: { confirmWrittenSeed: (seed: string) => Promise<boolean> }) => {
      await ctx.confirmWrittenSeed(SEED)
      throw new Error('vault write failed')
    })
    await mount()
    await click(radioNamed(/^Mainnet/))
    await click(createButton())
    await screen.findByText('Write down your Seed')
    for (const g of groups()) type(g.el, SEED.slice(g.from - 1, g.to))
    await click(screen.getByRole('button', { name: 'Check what I wrote' }))

    expect(await screen.findByText('vault write failed')).toBeTruthy()
    expect(screen.getByText('Seed Method')).toBeTruthy()
  })

  it('Check and Cancel are inert once the confirmation is settled, while the keystore writes', async () => {
    h.capability = 'yes'
    let release: () => void = () => {}
    h.createStoredWallet.mockImplementation(async (_i: unknown, ctx: { confirmWrittenSeed: (seed: string) => Promise<boolean> }) => {
      await ctx.confirmWrittenSeed(SEED)
      await new Promise<void>((r) => (release = r))
      return created()
    })
    await mount()
    await click(radioNamed(/^Mainnet/))
    await click(createButton())
    await screen.findByText('Write down your Seed')
    for (const g of groups()) type(g.el, SEED.slice(g.from - 1, g.to))
    await click(screen.getByRole('button', { name: 'Check what I wrote' }))
    expect((screen.getByRole('button', { name: 'Check what I wrote' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
    await click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Seed Method')).toBeNull()
    await act(async () => release())
  })

  it('leaving during the step resolves the keystore callback false, so nothing is written', async () => {
    h.capability = 'yes'
    let outcome: boolean | null = null
    h.createStoredWallet.mockImplementation(async (_i: unknown, ctx: { confirmWrittenSeed: (seed: string) => Promise<boolean> }) => {
      outcome = await ctx.confirmWrittenSeed(SEED)
      return outcome ? created() : { status: 'cancelled' }
    })
    const { unmount } = render(<CreateWalletFlow />)
    await screen.findByText('Seed Method')
    await click(radioNamed(/^Mainnet/))
    await click(createButton())
    await screen.findByText('Write down your Seed')
    unmount()
    await waitFor(() => expect(outcome).toBe(false))
    expect(h.startLockSession).not.toHaveBeenCalled()
  })

  it('a failed lock start shows the error on the finish step, and Try again retries', async () => {
    h.capability = 'yes'
    realisticStored()
    h.startLockSession.mockRejectedValueOnce(new Error('idb down'))
    const done = vi.fn()
    await mount({ onDone: done })
    await click(radioNamed(/^Mainnet/))
    await click(createButton())
    await screen.findByText('Write down your Seed')
    for (const g of groups()) type(g.el, SEED.slice(g.from - 1, g.to))
    await click(screen.getByRole('button', { name: 'Check what I wrote' }))
    expect(await screen.findByText('idb down')).toBeTruthy()
    expect(done).not.toHaveBeenCalled()
    await click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(done).toHaveBeenCalledWith(META))
  })
})
