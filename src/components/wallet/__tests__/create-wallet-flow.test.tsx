/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { readdirSync, readFileSync } from 'node:fs'

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

/** Mounts on step 1 (Label and Network). */
async function mountCollapsed(props: Parameters<typeof CreateWalletFlow>[0] = {}) {
  render(<CreateWalletFlow {...props} />)
  await screen.findByLabelText('Label')
}

/** Mounts and walks to step 2 (Node), where most policy tests start driving their radios. */
async function mount(props: Parameters<typeof CreateWalletFlow>[0] = {}) {
  await mountCollapsed(props)
  await click(nextButton())
}

/** The Generate steps in order. The walk is steps 2 to 6; the Review is step 7. */
const GENERATE_STEPS = ['Name and network', 'Node', 'Seed Method', 'Signature type', 'Authentication to open the wallet, and auto-lock', 'Authentication to sign a transaction', 'Review']
const currentIndex = () => {
  const m = /^Step (\d+) of (\d+)$/.exec(screen.getByText(/^Step \d+ of \d+$/).textContent ?? '')
  return Number(m![1]) - 1
}
/** Moves through the footer's Back and Next to the named Generate step. */
function goToStep(title: string) {
  const target = GENERATE_STEPS.indexOf(title)
  for (let guard = 0; guard < 10 && currentIndex() !== target; guard++) {
    const now = currentIndex()
    if (now < target) fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    else fireEvent.click(screen.getByRole('button', { name: 'Back' }))
  }
  expect(currentIndex()).toBe(target)
}

/** From any step: back to step 1, pick the Network, and walk forward to step 2 again. */
async function switchNetwork(name: RegExp) {
  goToStep('Name and network')
  await click(radioNamed(name))
  await click(nextButton())
}

const nextButton = () => screen.getByRole('button', { name: 'Next' })
/** The radio with this name. Each question has its own step, so this visits the walk steps until one shows it. */
const radioNamed = (name: RegExp | string): HTMLInputElement => {
  const found = () => screen.queryByRole('radio', { name }) as HTMLInputElement | null
  if (found()) return found()!
  for (const title of GENERATE_STEPS.slice(1)) {
    goToStep(title)
    if (found()) return found()!
  }
  return screen.getByRole('radio', { name }) as HTMLInputElement
}
const legends = () =>
  Array.from(document.querySelectorAll('legend'))
    .filter((l) => !l.closest('[hidden]'))
    .map((l) => l.textContent)
const createButton = () => {
  const now = screen.queryByRole('button', { name: /Create wallet/ })
  if (now) return now
  goToStep('Review')
  return screen.getByRole('button', { name: /Create wallet/ })
}
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

describe('the quiz shell', () => {
  it('opens on Step 1 of 7 with Back inert and Next in place of Create wallet', async () => {
    await mountCollapsed()
    expect(screen.getByText('Step 1 of 7')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back' }).getAttribute('aria-disabled')).toBe('true')
    expect(nextButton()).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Create wallet/ })).toBeNull()
  })
})

describe('the questions and their pre-selected answers', () => {
  it('asks one question per step, in the FR-60 order, each with "Step n of 7"', async () => {
    await mount()
    const seen: [string | null, string | null, (string | null)[]][] = []
    for (const title of GENERATE_STEPS.slice(1, 6)) {
      goToStep(title)
      seen.push([screen.getByText(/^Step \d of \d$/).textContent, screen.getByRole('heading', { level: 2 }).textContent, legends()])
    }
    expect(seen).toEqual([
      ['Step 2 of 7', 'Node', ['Node']],
      ['Step 3 of 7', 'Seed Method', ['Seed Method']],
      ['Step 4 of 7', 'Signature type', ['Signature type']],
      ['Step 5 of 7', 'Authentication to open the wallet, and auto-lock', ['Authentication required to open the wallet', 'Auto-lock after inactivity']],
      ['Step 6 of 7', 'Authentication to sign a transaction', ['Authentication required to sign a transaction']],
    ])
    // The last walk question shows Next; Create wallet waits for the Review.
    expect(screen.getByRole('button', { name: 'Next' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Create wallet/ })).toBeNull()
    goToStep('Review')
    expect(screen.getByText('Step 7 of 7')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Review')
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
    expect(screen.getByRole('button', { name: /Create wallet/ })).toBeTruthy()
  })

  it('pre-selects Testnet, the built-in Nodes, Stored Seed, Ed25519, App PIN, 5 minutes, Standard (no PRF)', async () => {
    await mountCollapsed()
    expect(radioNamed(/^Testnet/).checked).toBe(true)
    await click(nextButton())
    expect(radioNamed(/^Built-in Nodes/).checked).toBe(true)
    expect(screen.getByText(/wss:\/\/s\.altnet\.rippletest\.net:51233/)).toBeTruthy()
    expect(radioNamed(/^Stored Seed/).checked).toBe(true)
    expect(radioNamed('Ed25519').checked).toBe(true)
    expect(radioNamed('App PIN').checked).toBe(true)
    expect(radioNamed('5 minutes').checked).toBe(true)
    expect(radioNamed(/^Nothing is asked for signing/).checked).toBe(true)
  })

  it('with a known PRF the Open Check defaults to a passkey; Signing stays Standard on Testnet and becomes passkey on Mainnet', async () => {
    h.capability = 'yes'
    await mount()
    expect(radioNamed('Passkey').checked).toBe(true)
    expect(radioNamed(/^Nothing is asked for signing/).checked).toBe(true)
    await switchNetwork(/^Mainnet/)
    expect(radioNamed(/^Passkey only/).checked).toBe(true)
  })

  it('on Mainnet without PRF the Signing Check defaults to the App PIN', async () => {
    await mount()
    await switchNetwork(/^Mainnet/)
    expect(radioNamed(/^App PIN only/).checked).toBe(true)
  })

  it('the pre-selected pair on Mainnet with PRF is allowed, because this flow confirms the written Seed first', async () => {
    h.capability = 'yes'
    await mount()
    await switchNetwork(/^Mainnet/)
    expect(createButton().getAttribute('aria-disabled')).toBeNull()
    expect(screen.queryByText(/needs a written, confirmed Seed/)).toBeNull()
  })
})

describe('Label and Network, then the walk', () => {
  it('step 1 shows only Label and Network', async () => {
    await mountCollapsed()
    expect(legends()).toEqual(['Network'])
    expect(screen.getByLabelText('Label')).toBeTruthy()
    expect(screen.getAllByRole('radio').length).toBe(3)
    expect(screen.queryByRole('button', { name: 'Customise' })).toBeNull()
    expect(screen.queryByText('Recommended')).toBeNull()
  })

  it('Network line shows on no question step on Testnet', async () => {
    await mountCollapsed()
    expect(screen.queryByText('Network: Testnet')).toBeNull()
    await click(nextButton())
    expect(screen.queryByText('Network: Testnet')).toBeNull()
    expect(screen.queryByText('Real funds')).toBeNull()
  })

  it('step 2 of 7 is the Node question: no list, no other radios, no Create wallet, no Walk me through it', async () => {
    await mountCollapsed()
    await click(nextButton())
    expect(screen.getByText('Step 2 of 7')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Node')
    expect(legends()).toEqual(['Node'])
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).closest('label')?.textContent?.trim() ?? '')).toEqual(['Built-in Nodes', 'A Node you choose'])
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Back', 'Next'])
  })

  it('no step has a Walk me through it button, and the answers are listed on the Review only', async () => {
    await mountCollapsed()
    for (const title of GENERATE_STEPS) {
      goToStep(title)
      expect(screen.queryByRole('button', { name: 'Walk me through it' })).toBeNull()
      const terms = Array.from(document.querySelectorAll('dt')).filter((dt) => !dt.closest('[hidden]'))
      if (title === 'Review') expect(terms.length).toBeGreaterThan(0)
      else expect(terms).toEqual([])
    }
  })

  it('Create wallet is absent on steps 1 to 6 and present on the Review', async () => {
    await mountCollapsed()
    for (const title of GENERATE_STEPS.slice(0, 6)) {
      goToStep(title)
      expect(screen.queryByRole('button', { name: /Create wallet/ })).toBeNull()
      expect(nextButton()).toBeTruthy()
    }
    goToStep('Review')
    expect(screen.getByRole('button', { name: /Create wallet/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
  })

  it('Mainnet states the Open Check rule in words on the Open Check step only; Testnet and Devnet do not', async () => {
    const sentence = /an Open Check is required, and auto-lock is at least 1 minute/
    await mountCollapsed()
    for (const title of GENERATE_STEPS) {
      goToStep(title)
      expect(screen.queryByText(sentence)).toBeNull()
    }
    await switchNetwork(/^Devnet/)
    goToStep('Authentication to open the wallet, and auto-lock')
    expect(screen.queryByText(sentence)).toBeNull()
    await switchNetwork(/^Mainnet/)
    for (const title of GENERATE_STEPS.slice(1)) {
      goToStep(title)
      if (title === 'Authentication to open the wallet, and auto-lock') expect(screen.getByText(sentence)).toBeTruthy()
      else expect(screen.queryByText(sentence)).toBeNull()
    }
  })

  it('Create wallet on the last step calls the keystore with the walk defaults', async () => {
    await mount()
    type(await screen.findByLabelText(/Choose an App PIN/), '123456')
    type(screen.getByLabelText('Confirm the App PIN'), '123456')
    await click(createButton())
    expect(h.createStoredWallet.mock.calls[0][1]).toMatchObject({ pin: '123456', appPinExpected: false })
    expect(h.createStoredWallet.mock.calls[0][0]).toMatchObject({ network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', autoLockMinutes: 5, signing: 'standard' })
  })

  it('a refusal shows as text on the last step', async () => {
    h.createStoredWallet.mockResolvedValue({ status: 'refused', reason: 'Refused for a reason.' })
    await mount()
    type(await screen.findByLabelText(/Choose an App PIN/), '123456')
    type(screen.getByLabelText('Confirm the App PIN'), '123456')
    await click(createButton())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('The wallet was not created')
    expect(alert.textContent).toContain('Refused for a reason.')
    expect(document.activeElement).toBe(alert.parentElement)
    expect(alert.parentElement?.getAttribute('tabindex')).toBe('-1')
    expect(screen.getByText('Step 7 of 7')).toBeTruthy()
  })

  it('the PIN fields appear on the Review only, and a typed PIN and a chosen answer survive Next and Back', async () => {
    await mountCollapsed()
    const pin = () => screen.getByLabelText(/Choose an App PIN/) as HTMLInputElement
    // The PIN fields render once the App PIN read resolves: wait for them, do not race it.
    await screen.findByLabelText(/Choose an App PIN/)
    expect(pin().closest('[hidden]')).not.toBeNull()
    await click(nextButton())
    expect(pin().closest('[hidden]')).not.toBeNull()
    await click(radioNamed('secp256k1'))
    await click(radioNamed('15 minutes'))
    goToStep('Authentication to sign a transaction')
    expect(pin().closest('[hidden]')).not.toBeNull()
    goToStep('Review')
    expect(pin().closest('[hidden]')).toBeNull()
    type(pin(), '123456')
    goToStep('Name and network')
    expect(pin().closest('[hidden]')).not.toBeNull()
    goToStep('Review')
    expect(pin().value).toBe('123456')
    goToStep('Signature type')
    expect(radioNamed('secp256k1').checked).toBe(true)
    expect(radioNamed('15 minutes').checked).toBe(true)
  })

  it('an invalid Label shows its text on step 1, and Next is aria-disabled and does nothing', async () => {
    await mountCollapsed({ defaultLabel: '' })
    type(screen.getByLabelText('Label'), 'x'.repeat(41))
    expect(screen.getByText('Use 40 characters or fewer.')).toBeTruthy()
    expect(nextButton().getAttribute('aria-disabled')).toBe('true')
    await click(nextButton())
    expect(screen.getByText('Step 1 of 7')).toBeTruthy()
    type(screen.getByLabelText('Label'), 'Fine')
    expect(nextButton().getAttribute('aria-disabled')).toBeNull()
  })

  it('Passkey-Derived shows its choice and domain warning on the Seed Method step only', async () => {
    h.capability = 'yes'
    await mount()
    expect(screen.getByText('Step 2 of 7')).toBeTruthy()
    await click(nextButton())
    await click(radioNamed(/^Passkey-Derived Seed/))
    expect(radioNamed(/^Create a new passkey/).checked).toBe(true)
    expect(screen.getByText(/depends on the app's domain/)).toBeTruthy()
    await click(nextButton())
    expect(screen.queryByText(/depends on the app's domain/)).toBeNull()
    expect(screen.queryByRole('radio', { name: /^Create a new passkey/ })).toBeNull()
    // The only Signing Check left is its own passkey.
    goToStep('Authentication to sign a transaction')
    expect(radioNamed(/^Passkey only/).checked).toBe(true)
    expect(radioNamed(/^Nothing is asked for signing/).getAttribute('aria-disabled')).toBe('true')
    expect(radioNamed(/^App PIN only/).getAttribute('aria-disabled')).toBe('true')
    goToStep('Seed Method')
    expect(radioNamed(/^Passkey-Derived Seed/).checked).toBe(true)
  })

  it('a blocked combination shows the Alert after step 1 and Create wallet on the last step is aria-disabled and does nothing', async () => {
    h.policyOverride = (d) => ({ ...d, combination: { ok: false, reason: 'SENTINEL combination.' } })
    await mountCollapsed()
    expect(screen.queryByText('This wallet cannot be created yet')).toBeNull()
    await click(nextButton())
    expect(screen.getByText('This wallet cannot be created yet')).toBeTruthy()
    expect(screen.getByText('SENTINEL combination.')).toBeTruthy()
    const create = createButton()
    expect(create.getAttribute('aria-disabled')).toBe('true')
    await click(create)
    expect(h.createStoredWallet).not.toHaveBeenCalled()
  })

  it('a custom Node typed and tested on the Node step is kept after Back and forward', async () => {
    await mount()
    await click(radioNamed(/^A Node you choose/))
    type(screen.getByLabelText(/Node address/), 'wss://mine.example.com')
    await click(screen.getByRole('button', { name: 'Test this Node' }))
    await screen.findByText(/answers for this network/)
    await click(screen.getByRole('button', { name: 'Back' }))
    await click(nextButton())
    expect(radioNamed(/^A Node you choose/).checked).toBe(true)
    expect((screen.getByLabelText(/Node address/) as HTMLInputElement).value).toBe('wss://mine.example.com')
    expect(screen.getByText(/answers for this network/)).toBeTruthy()
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

  it('Passkey-Derived on Mainnet at a b-cdn.net origin: Network change resets to Stored, and Passkey-Derived stays visible and aria-disabled with the reason', async () => {
    h.capability = 'yes'
    h.rpId = 'sites-xrpl-bench-prod-pdbywc.b-cdn.net'
    await mount()
    await click(radioNamed(/^Passkey-Derived Seed/))
    expect(radioNamed(/^Passkey-Derived Seed/).checked).toBe(true)
    goToStep('Name and network')
    await click(radioNamed(/^Mainnet/))
    expect(screen.getByRole('status').textContent).toBe('The later questions start again.')
    await click(nextButton())
    await click(nextButton())
    const derived = radioNamed(/^Passkey-Derived Seed/)
    expect(derived.checked).toBe(false)
    expect(radioNamed(/^Stored Seed/).checked).toBe(true)
    expect(derived.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getAllByText(/tied to a temporary web address/).length).toBeGreaterThan(0)
    // Forcing the refused answer does nothing.
    await click(derived)
    expect(derived.checked).toBe(false)
    // Nothing is blocked: the answers were put right, and creation takes the Stored path.
    expect(createButton().getAttribute('aria-disabled')).toBeNull()
    // Testnet is unaffected.
    await switchNetwork(/^Testnet/)
    expect(radioNamed(/^Passkey-Derived Seed/).getAttribute('aria-disabled')).toBeNull()
    // Back on Mainnet, creation takes the Stored path.
    await switchNetwork(/^Mainnet/)
    await click(createButton())
    expect(h.createStoredWallet).toHaveBeenCalledTimes(1)
    expect(h.createDerivedWallet).not.toHaveBeenCalled()
  })

  it('Mainnet: no Open Check and an auto-lock under a minute are aria-disabled with reasons, and creation cannot proceed', async () => {
    await mount()
    await switchNetwork(/^Mainnet/)
    const none = radioNamed(/^No authentication required to open the wallet/)
    expect(none.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getAllByText(/A Mainnet wallet needs an Open Check/).length).toBeGreaterThan(0)
    const half = radioNamed('30 seconds')
    expect(half.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText(/must auto-lock after at least 1 minute of inactivity/)).toBeTruthy()
    // Forcing them on: still refused, nothing created.
    await click(none)
    expect(none.checked).toBe(false)
    await click(radioNamed('1 minute'))
    expect(createButton().getAttribute('aria-disabled')).toBeNull()
  })

  it('every Signing Check option says who it asks, and No Open Check explains itself only where it is available', async () => {
    await mount()
    goToStep('Authentication to sign a transaction')
    expect(screen.getByText('Nothing is asked for signing.')).toBeTruthy()
    expect(screen.getByText('Asks for your passkey on every signature.')).toBeTruthy()
    expect(screen.getByText('Asks for your App PIN on every signature.')).toBeTruthy()
    goToStep('Authentication to open the wallet, and auto-lock')
    expect(screen.getByText('Testnet and Devnet only.')).toBeTruthy()
    await switchNetwork(/^Mainnet/)
    goToStep('Authentication to open the wallet, and auto-lock')
    expect(screen.queryByText('Testnet and Devnet only.')).toBeNull()
  })

  it('Testnet may use no Open Check; changing to Mainnet on step 1 resets it to the recommended answer and says so', async () => {
    await mount()
    await click(radioNamed(/^No authentication required to open the wallet/))
    expect(radioNamed(/^No authentication required to open the wallet/).checked).toBe(true)
    expect(createButton().getAttribute('aria-disabled')).toBeNull()
    goToStep('Name and network')
    await click(radioNamed(/^Mainnet/))
    expect(screen.getByRole('status').textContent).toBe('The later questions start again.')
    await click(nextButton())
    expect(radioNamed('App PIN').checked).toBe(true)
    const none = radioNamed(/^No authentication required to open the wallet/)
    expect(none.checked).toBe(false)
    // Still visible, aria-disabled, with the reason.
    expect(none.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getAllByText(/A Mainnet wallet needs an Open Check/).length).toBeGreaterThan(0)
    expect(createButton().getAttribute('aria-disabled')).toBeNull()
  })

  it('a combination the policy refuses is still refused at Create wallet before any write', async () => {
    await mount()
    await click(radioNamed(/^No authentication required to open the wallet/))
    h.policyOverride = (d) => ({ ...d, combination: { ok: false, reason: 'SENTINEL combination.' } })
    await click(createButton())
    expect(h.createStoredWallet).not.toHaveBeenCalled()
  })

  it('no PRF: both passkey answers are aria-disabled with the reason visible, and the defaults are the App PIN', async () => {
    await mount()
    expect(radioNamed('Passkey').getAttribute('aria-disabled')).toBe('true')
    expect(radioNamed(/^Passkey only/).getAttribute('aria-disabled')).toBe('true')
    // Passkey-Derived, Passkey and Passkey only: one on each of their steps.
    for (const title of ['Seed Method', 'Authentication to open the wallet, and auto-lock', 'Authentication to sign a transaction']) {
      goToStep(title)
      expect(screen.getAllByText(/cannot use a passkey/).length).toBe(1)
    }
    expect(radioNamed('App PIN').checked).toBe(true)
  })

  it('PRF unknown: passkey answers are available with a visible note', async () => {
    h.capability = 'unknown'
    await mount()
    expect(radioNamed('Passkey').getAttribute('aria-disabled')).toBeNull()
    for (const title of ['Seed Method', 'Authentication to open the wallet, and auto-lock', 'Authentication to sign a transaction']) {
      goToStep(title)
      expect(screen.getAllByText('Checked when the passkey is created.').length).toBe(1)
    }
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
    await switchNetwork(/^Mainnet/)
    await click(radioNamed(/^No authentication required to open the wallet/))
    await click(radioNamed('30 seconds'))
    expect(radioNamed(/^No authentication required to open the wallet/).getAttribute('aria-disabled')).toBeNull()
    expect(radioNamed('30 seconds').getAttribute('aria-disabled')).toBeNull()
    expect(createButton().getAttribute('aria-disabled')).toBeNull()
    await screen.findByLabelText('Confirm the App PIN') // the default signing check still wants a PIN
    type(screen.getByLabelText(/Choose an App PIN/), '123456')
    type(screen.getByLabelText('Confirm the App PIN'), '123456')
    await click(createButton())
    expect(h.createStoredWallet.mock.calls[0][0]).toMatchObject({ network: 'mainnet', openCheck: 'none', autoLockMinutes: 0.5 })
  })

  it('on Mainnet the Create button is described by the real-funds line; on Testnet it is not', async () => {
    await mount()
    goToStep('Review')
    expect(createButton().getAttribute('aria-describedby')).toBeNull()
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: /^Back/ }))
    await switchNetwork(/^Mainnet/)
    goToStep('Review')
    const id = createButton().getAttribute('aria-describedby')
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)?.textContent).toContain('real funds')
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
    await click(radioNamed(/^No authentication required to open the wallet/))
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
    goToStep('Review')
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
    expect((await screen.findByRole('alert')).textContent).toContain('put failed')
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
    // Creation never selects (AD-34, AD-40): the caller decides.
    expect(state.activeWalletId).toBeNull()
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
    // It stays on the Node step, and Next is not blocked.
    expect(screen.getByText('Step 2 of 7')).toBeTruthy()
    expect(nextButton().getAttribute('aria-disabled')).toBeNull()
  })

  it('an untested custom Node does not block Next; Create wallet refuses it at the end', async () => {
    await mount()
    await click(radioNamed(/^A Node you choose/))
    expect(nextButton().getAttribute('aria-disabled')).toBeNull()
    goToStep('Review')
    expect(screen.getByText('Step 7 of 7')).toBeTruthy()
    await click(createButton())
    expect(screen.getByText('Test the custom Node first, or use the built-in Nodes.')).toBeTruthy()
    expect(h.createStoredWallet).not.toHaveBeenCalled()
  })

  it('a repeated identical Create refusal moves focus back to the error each time', async () => {
    await mount()
    await click(radioNamed(/^A Node you choose/))
    goToStep('Review')
    await click(createButton())
    const msg = 'Test the custom Node first, or use the built-in Nodes.'
    expect(screen.getByText(msg)).toBeTruthy()
    const wrapper = document.querySelector('[tabindex="-1"].scroll-mb-32') as HTMLElement
    expect(wrapper).toBeTruthy()
    expect(document.activeElement).toBe(wrapper)
    // Focus moves away; the same refusal again must pull it back.
    createButton().focus()
    expect(document.activeElement).not.toBe(wrapper)
    await click(createButton())
    expect(screen.getByText(msg)).toBeTruthy()
    expect(document.activeElement).toBe(wrapper)
  })

  it('Back across the walk keeps every answer', async () => {
    await mount()
    await click(radioNamed('secp256k1'))
    await click(radioNamed('15 minutes'))
    await click(radioNamed(/^App PIN only/))
    goToStep('Seed Method')
    goToStep('Authentication to sign a transaction')
    expect(radioNamed(/^App PIN only/).checked).toBe(true)
    expect(radioNamed('15 minutes').checked).toBe(true)
    expect(radioNamed('secp256k1').checked).toBe(true)
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
    goToStep('Node')
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
    await click(screen.getByRole('button', { name: 'Back' }))
    await click(screen.getByRole('button', { name: 'Back' }))
    expect(radioNamed(/^Devnet/).disabled).toBe(true)
    await act(async () => finish())
    expect(radioNamed(/^Devnet/).disabled).toBe(false)
    await click(nextButton())
    await screen.findByText(/answers for this network/)
  })

  it('changing the network drops a proven Node: it was proven for the other one', async () => {
    await mount()
    await click(radioNamed(/^A Node you choose/))
    type(screen.getByLabelText(/Node address/), 'wss://node.example.com')
    await click(screen.getByRole('button', { name: 'Test this Node' }))
    await screen.findByText(/answers for this network/)
    await switchNetwork(/^Devnet/)
    expect(radioNamed(/^Built-in Nodes/).checked).toBe(true)
    expect(screen.queryByLabelText(/Node address/)).toBeNull()
  })
})

describe('Passkey-Derived Seed (story 6)', () => {
  it('on Mainnet with an unknown origin the option is aria-disabled with a visible reason', async () => {
    h.capability = 'yes'
    h.rpId = null
    await mount()
    await switchNetwork(/^Mainnet/)
    expect(radioNamed(/^Passkey-Derived Seed/).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getAllByText(/could not be determined/).length).toBeGreaterThan(0)
    await switchNetwork(/^Testnet/)
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
    expect(radioNamed(/^Nothing is asked for signing/).getAttribute('aria-disabled')).toBe('true')
    await click(radioNamed(/^Stored Seed/))
    expect(screen.queryByText(/depends on the app's domain/)).toBeNull()
    expect(radioNamed(/^Nothing is asked for signing/).checked).toBe(true)
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
    expect(screen.getByText('Step 7 of 7')).toBeTruthy()
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
    expect(screen.getByText('Step 7 of 7')).toBeTruthy()
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
    expect(useAppStore.getState().activeWalletId).toBeNull()
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
    await switchNetwork(/^Mainnet/)
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
    await screen.findByText('Step 7 of 7')
    expect(screen.getByText(/Nothing was created/)).toBeTruthy()
    expect(done).not.toHaveBeenCalled()
    expect(h.startLockSession).not.toHaveBeenCalled()
    expect(useAppStore.getState().wallets).toEqual([])
  })

  it('Testnet never shows the step: it goes to the ordinary backup', async () => {
    h.createStoredWallet.mockResolvedValue(created())
    await mount()
    await click(radioNamed(/^No authentication required to open the wallet/))
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
    await switchNetwork(/^Mainnet/)
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
    await switchNetwork(/^Mainnet/)
    await click(createButton())
    await screen.findByText('Write down your Seed')
    for (const g of groups()) type(g.el, SEED.slice(g.from - 1, g.to))
    await click(screen.getByRole('button', { name: 'Check what I wrote' }))

    expect(await screen.findByText('Cancelled. Nothing was created.')).toBeTruthy()
    expect(screen.queryByText('Write down your Seed')).toBeNull()
    expect(screen.getByText('Step 7 of 7')).toBeTruthy()
    expect(h.startLockSession).not.toHaveBeenCalled()
  })

  it('a thrown write after the confirmation also returns to the questions', async () => {
    h.capability = 'yes'
    h.createStoredWallet.mockImplementation(async (_i: unknown, ctx: { confirmWrittenSeed: (seed: string) => Promise<boolean> }) => {
      await ctx.confirmWrittenSeed(SEED)
      throw new Error('vault write failed')
    })
    await mount()
    await switchNetwork(/^Mainnet/)
    await click(createButton())
    await screen.findByText('Write down your Seed')
    for (const g of groups()) type(g.el, SEED.slice(g.from - 1, g.to))
    await click(screen.getByRole('button', { name: 'Check what I wrote' }))

    expect(await screen.findByText('vault write failed')).toBeTruthy()
    expect(screen.getByText('Step 7 of 7')).toBeTruthy()
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
    await switchNetwork(/^Mainnet/)
    await click(createButton())
    await screen.findByText('Write down your Seed')
    for (const g of groups()) type(g.el, SEED.slice(g.from - 1, g.to))
    await click(screen.getByRole('button', { name: 'Check what I wrote' }))
    expect((screen.getByRole('button', { name: 'Check what I wrote' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true)
    await click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Seed Method', { selector: 'legend' })).toBeNull()
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
    await screen.findByLabelText('Label')
    await click(radioNamed(/^Mainnet/))
    await click(nextButton())
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
    await switchNetwork(/^Mainnet/)
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

describe('the wallet name and the questions component (chooser story 11)', () => {
  const W = (id: string, label: string) => ({ ...META, id, seedId: id, label })
  const enterPin = async () => {
    type(await screen.findByLabelText(/Choose an App PIN/), '123456')
    type(screen.getByLabelText(/Confirm the App PIN/), '123456')
  }
  const labelInput = () => screen.getByLabelText('Label') as HTMLInputElement

  it('an empty label is created under the auto-suffixed default, never the typed-nothing', async () => {
    useAppStore.setState({ wallets: [W('a', 'Wallet')] } as never)
    await mountCollapsed({ defaultLabel: '' })
    await click(nextButton())
    await enterPin()
    await click(createButton())
    expect(h.createStoredWallet.mock.calls[0][0]).toMatchObject({ label: 'Wallet 2' })
  })

  it.each([
    ['   ', null],
    ['x'.repeat(41), 'Use 40 characters or fewer.'],
    ['savings', 'Another wallet on this device already has that name.'],
  ])('a typed name %j: error %j, tied to the field, and Next does nothing while it shows', async (typed, error) => {
    useAppStore.setState({ wallets: [W('a', 'Savings'), W('a2', 'Savings'), W('b', 'Other')] } as never)
    await mountCollapsed({ defaultLabel: '' })
    type(labelInput(), typed)
    if (error === null) {
      expect(labelInput().getAttribute('aria-invalid')).toBeNull()
      return
    }
    const text = screen.getByText(error)
    expect(labelInput().getAttribute('aria-invalid')).toBe('true')
    expect(labelInput().getAttribute('aria-describedby')).toBe(text.id)
    expect(nextButton().getAttribute('aria-disabled')).toBe('true')
    await click(nextButton())
    expect(screen.getByText('Step 1 of 7')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Create wallet/ })).toBeNull()
    expect(h.createStoredWallet).not.toHaveBeenCalled()
  })

  it('a free typed name goes through as typed', async () => {
    useAppStore.setState({ wallets: [W('a', 'Savings')] } as never)
    await mountCollapsed({ defaultLabel: '' })
    type(labelInput(), 'Cold storage')
    await click(nextButton())
    await enterPin()
    await click(createButton())
    expect(h.createStoredWallet.mock.calls[0][0]).toMatchObject({ label: 'Cold storage' })
  })

  it('creation never selects: the flow does not call setActiveWalletId, and the questions are one component', () => {
    const source = readFileSync('src/components/wallet/CreateWalletFlow.tsx', 'utf8')
    expect(source).not.toMatch(/setActiveWalletId/)
    expect(source).toMatch(/<NameAndNetworkStep\b/)
    expect(source).not.toMatch(/RecommendedList|SHORTCUT_INDEX|Walk me through it/)
    expect(source).toMatch(/walkQuestions\(/)
    expect(source).toMatch(/\.render\(questionProps\)/)
    expect(source).not.toMatch(/legend="(Seed Method|Open Check|Signing Check)"/)
    expect(readFileSync('src/components/wallet/WalletQuestions.tsx', 'utf8')).toMatch(/legend=\{SIGNING_CHECK_QUESTION\}/)
    expect(source).not.toMatch(/isRecommended|customiseForced|customiseOpen/)
  })
})

describe('the old form is retired (story 20.8)', () => {
  const sources = () => {
    const dir = 'src/components/wallet'
    const files = readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => `${dir}/${f}`)
    return [...files, 'src/pages/Onboarding.tsx'].map((f) => [f, readFileSync(f, 'utf8')] as const)
  }

  it('no wallet component or Onboarding keeps a retired name, a Customise toggle or a Recommended panel', () => {
    for (const [file, text] of sources()) {
      expect(text, file).not.toMatch(/isRecommended|customiseForced|customiseOpen|RecommendedList|SHORTCUT_INDEX|Walk me through it/)
      expect(text, file).not.toMatch(/Customi[sz]e/)
      expect(text, file).not.toMatch(/Recommended/)
    }
  })

  it('WalletQuestions holds no answer list: rows come from the Review only', () => {
    const text = readFileSync('src/components/wallet/WalletQuestions.tsx', 'utf8')
    expect(text).not.toMatch(/Your setup|Selected setup/)
    const outside = text.replace(/export function ReviewStep[\s\S]*?(?=\nexport function PathChoice)/, '')
    expect(outside.length).toBeLessThan(text.length)
    expect(outside).toContain('export function PathChoice')
    expect(outside).not.toMatch(/<dl\b|<dt\b|answerRows/)
  })

  it('moves focus to the step heading after Next, Back and Change, and keeps the counter as text', async () => {
    await mountCollapsed()
    for (const [i, title] of GENERATE_STEPS.slice(1).entries()) {
      await click(nextButton())
      expect(screen.getByText(`Step ${i + 2} of 7`)).toBeTruthy()
      const heading = screen.getByRole('heading', { level: 2 })
      expect(heading.textContent).toBe(title)
      expect(document.activeElement).toBe(heading)
    }
    await click(screen.getByRole('button', { name: 'Back' }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 }))
    expect(screen.getByText('Step 6 of 7')).toBeTruthy()
    goToStep('Review')
    await click(screen.getByRole('button', { name: 'Change Signature type' }))
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 2 }))
    expect(screen.getByText('Step 4 of 7')).toBeTruthy()
  })
})

describe('the Review (story 20.7)', () => {
  const rows = () => Array.from(document.querySelectorAll('dt')).filter((dt) => !dt.closest('[hidden]'))
  const change = (term: string) => screen.getByRole('button', { name: `Change ${term}` })
  const pinInput = () => screen.getByLabelText(/Choose an App PIN/) as HTMLInputElement

  it('lists every applicable answer once, each with a Change named after it, and no Seed or PIN', async () => {
    await mount()
    goToStep('Review')
    expect(rows().map((dt) => dt.textContent)).toEqual([
      'Label',
      'Network',
      'Node',
      'Seed Method',
      'Signature type',
      'Authentication required to open the wallet',
      'Auto-lock',
      'Authentication required to sign a transaction',
    ])
    const values = rows().map((dt) => dt.nextElementSibling?.textContent)
    expect(values).toEqual(['My Wallet', 'Testnet', 'Built-in Nodes', 'Stored Seed', 'Ed25519', 'App PIN', '5 minutes', 'Nothing is asked for signing'])
    for (const dt of rows()) {
      const button = screen.queryByRole('button', { name: `Change ${dt.textContent}` })
      if (dt.textContent === 'Network') expect(button).toBeNull()
      else expect(button).toBeTruthy()
    }
    type(pinInput(), '123456')
    expect(document.querySelector('section[aria-label="Your answers"]')?.textContent).not.toContain('123456')
    expect(document.body.textContent).not.toContain(SEED)
  })

  it('adds a Passkey row only when Passkey-Derived is chosen', async () => {
    h.capability = 'yes'
    await mount()
    await click(nextButton())
    await click(radioNamed(/^Passkey-Derived Seed/))
    goToStep('Review')
    expect(rows().map((dt) => dt.textContent)).toContain('Passkey')
    await click(change('Seed Method'))
    await click(radioNamed(/^Stored Seed/))
    goToStep('Review')
    expect(rows().map((dt) => dt.textContent)).not.toContain('Passkey')
  })

  it('Change returns to the question with its answer kept, and Next lands on the Review with the edit', async () => {
    await mount()
    await click(radioNamed('secp256k1'))
    await click(radioNamed('15 minutes'))
    goToStep('Review')
    await click(change('Signature type'))
    expect(screen.getByText('Step 4 of 7')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Signature type')
    expect(radioNamed('secp256k1').checked).toBe(true)
    await click(radioNamed('Ed25519'))
    await click(nextButton())
    expect(screen.getByText('Step 7 of 7')).toBeTruthy()
    expect(rows().map((dt) => dt.nextElementSibling?.textContent)).toContain('Ed25519')
    // Auto-lock changes on the Open Check step, which also asks the Open Check.
    await click(change('Auto-lock'))
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Authentication to open the wallet, and auto-lock')
    expect(radioNamed('15 minutes').checked).toBe(true)
  })

  it('Change on the Label returns to step 1, and a Label error still blocks Next there', async () => {
    await mount()
    goToStep('Review')
    await click(change('Label'))
    expect(screen.getByText('Step 1 of 7')).toBeTruthy()
    type(screen.getByLabelText('Label'), 'x'.repeat(41))
    await click(nextButton())
    expect(screen.getByText('Step 1 of 7')).toBeTruthy()
    type(screen.getByLabelText('Label'), 'Fine name')
    await click(nextButton())
    expect(screen.getByText('Step 7 of 7')).toBeTruthy()
    expect(rows().map((dt) => dt.nextElementSibling?.textContent)).toContain('Fine name')
  })

  it('Back after a Change drops the return, so a later Next goes to the next question', async () => {
    await mount()
    goToStep('Review')
    await click(change('Node'))
    expect(screen.getByText('Step 2 of 7')).toBeTruthy()
    await click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Step 1 of 7')).toBeTruthy()
    await click(nextButton())
    expect(screen.getByText('Step 2 of 7')).toBeTruthy()
    await click(nextButton())
    expect(screen.getByText('Step 3 of 7')).toBeTruthy()
  })

  it('arriving at the Review drops the return, so the walk is ordinary afterwards', async () => {
    await mount()
    goToStep('Review')
    await click(change('Node'))
    await click(nextButton())
    expect(screen.getByText('Step 7 of 7')).toBeTruthy()
    goToStep('Node')
    await click(nextButton())
    expect(screen.getByText('Step 3 of 7')).toBeTruthy()
  })

  it('a blocked verdict shows the warning on the Review and leaves Create wallet aria-disabled', async () => {
    h.policyOverride = (d) => ({ ...d, combination: { ok: false, reason: 'SENTINEL combination.' } })
    await mount()
    goToStep('Review')
    expect(screen.getByText('SENTINEL combination.')).toBeTruthy()
    expect(createButton().getAttribute('aria-disabled')).toBe('true')
  })
})

describe('the Network lock and reset (story 20.7)', () => {
  const line = () => screen.getByRole('status')

  it('is a polite status region that is mounted, and empty, before anything changes', async () => {
    await mountCollapsed()
    expect(line().getAttribute('aria-live')).toBe('polite')
    expect(line().textContent).toBe('')
  })

  it('Network can be changed on step 1 only: no Network radio on any later step or the Review', async () => {
    await mount()
    for (const title of ['Node', 'Seed Method', 'Signature type', 'Authentication to open the wallet, and auto-lock', 'Authentication to sign a transaction']) {
      goToStep(title)
      expect(screen.queryByRole('radio', { name: /^Mainnet/ })).toBeNull()
      expect(screen.queryByRole('button', { name: /Change Network/ })).toBeNull()
    }
    goToStep('Review')
    expect(screen.queryByRole('button', { name: 'Change Network' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Change Label' })).toBeTruthy()
  })

  it('the Review shows Network as locked text with no Change button; Back to step 1 still lets it change', async () => {
    await mount()
    goToStep('Review')
    const dt = screen.getByText('Network', { selector: 'dt' })
    expect(dt.parentElement?.textContent).toContain('Locked. To change it, go Back to step 1; the questions then start again.')
    expect(screen.queryByRole('button', { name: 'Change Network' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Change Label' })).toBeTruthy()
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: /^Back/ }))
    expect(screen.getByRole('radio', { name: /^Mainnet/ })).toBeTruthy()
  })

  it('changing Network on step 1 resets every later answer, with the line, and does not restore them on switching back', async () => {
    h.capability = 'yes'
    await mount()
    await click(radioNamed(/^A Node you choose/))
    await click(radioNamed(/^No authentication required to open the wallet/))
    await click(radioNamed('30 seconds'))
    await click(radioNamed('secp256k1'))
    goToStep('Seed Method')
    await click(radioNamed(/^Passkey-Derived Seed/))
    await click(radioNamed(/^Use an existing passkey/))
    goToStep('Node')
    type(screen.getByLabelText(/Node address/), 'wss://draft.example.com')
    goToStep('Name and network')
    await click(radioNamed(/^Mainnet/))
    expect(line().textContent).toBe('The later questions start again.')
    goToStep('Seed Method')
    expect(radioNamed(/^Stored Seed/).checked).toBe(true)
    await click(radioNamed(/^Passkey-Derived Seed/))
    expect(radioNamed(/^Create a new passkey/).checked).toBe(true)
    goToStep('Node')
    expect(radioNamed(/^Built-in Nodes/).checked).toBe(true)
    await click(radioNamed(/^A Node you choose/))
    expect((screen.getByLabelText(/Node address/) as HTMLInputElement).value).toBe('')
    await click(radioNamed(/^Built-in Nodes/))
    goToStep('Signature type')
    expect(radioNamed('Ed25519').checked).toBe(true)
    goToStep('Authentication to open the wallet, and auto-lock')
    expect(radioNamed('Passkey').checked).toBe(true)
    expect(radioNamed('5 minutes').checked).toBe(true)
    // The line belongs to step 1 and goes with it.
    expect(screen.queryByRole('status')).toBeNull()
    goToStep('Name and network')
    expect(line().textContent).toBe('')
    await click(radioNamed(/^Testnet/))
    goToStep('Authentication to open the wallet, and auto-lock')
    expect(radioNamed('Passkey').checked).toBe(true)
  })

  it('Change on Label, then a Network change, then Next goes to step 2, not the Review', async () => {
    await mount()
    goToStep('Review')
    await click(screen.getByRole('button', { name: 'Change Label' }))
    expect(currentIndex()).toBe(0)
    await click(radioNamed(/^Devnet/))
    await click(nextButton())
    expect(currentIndex()).toBe(1)
  })

  it('a custom Node refusal is gone after a Network change resets the Node', async () => {
    await mount()
    await click(radioNamed(/^A Node you choose/))
    await click(nextButton())
    goToStep('Review')
    await click(createButton())
    expect(screen.queryByText(/Test the custom Node first/)).toBeTruthy()
    goToStep('Name and network')
    await click(radioNamed(/^Devnet/))
    expect(screen.queryByText(/Test the custom Node first/)).toBeNull()
  })

  it('legal answers are reset too: nothing is kept', async () => {
    await mount()
    await click(radioNamed('15 minutes'))
    goToStep('Name and network')
    await click(radioNamed(/^Mainnet/))
    goToStep('Authentication to open the wallet, and auto-lock')
    expect(radioNamed('5 minutes').checked).toBe(true)
  })

  it('Back to step 1 and Next without changing Network keeps every answer and shows no line', async () => {
    await mount()
    await click(radioNamed('15 minutes'))
    goToStep('Name and network')
    expect(line().textContent).toBe('')
    goToStep('Authentication to open the wallet, and auto-lock')
    expect(radioNamed('15 minutes').checked).toBe(true)
  })
})

describe('the consequence line on the Review (story 20.7)', () => {
  it('on Testnet says test funds only, with no Real funds stamp', async () => {
    await mount()
    goToStep('Review')
    expect(screen.getByText('This wallet holds test funds only.')).toBeTruthy()
    expect(screen.queryByText('Real funds')).toBeNull()
  })

  it('on Mainnet says real funds and cannot be recovered, with the Real funds stamp', async () => {
    await mount()
    await switchNetwork(/^Mainnet/)
    goToStep('Review')
    expect(screen.getByText(/Nobody can recover its Seed for you\./)).toBeTruthy()
    expect(screen.getByText('Real funds')).toBeTruthy()
  })
})

describe('an App PIN refused at Create wallet (story 20.7)', () => {
  const pin = () => screen.getByLabelText(/Choose an App PIN/) as HTMLInputElement
  const confirm = () => screen.getByLabelText('Confirm the App PIN') as HTMLInputElement
  const reasonFor = (field: HTMLElement) => document.getElementById(field.getAttribute('aria-describedby') ?? '')

  it('puts one answers plate first, the consequence line last in it, and the PIN plate last above the footer', async () => {
    await mount()
    await screen.findByLabelText(/Choose an App PIN/)
    goToStep('Review')
    const answers = document.querySelector('section[aria-label="Your answers"]')!
    expect(answers.compareDocumentPosition(pin()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(document.querySelector('section[aria-label="Before you create"]')).toBeNull()
    expect(answers.lastElementChild?.textContent).toContain('This wallet holds test funds only.')
    expect(pin().closest('section')?.textContent).not.toMatch(/below/i)
  })

  it('an empty new PIN puts focus on its field with the reason beside it, and no keystore call is made', async () => {
    await mount()
    await screen.findByLabelText(/Choose an App PIN/)
    await click(createButton())
    expect(document.activeElement).toBe(pin())
    expect(pin().getAttribute('aria-invalid')).toBe('true')
    expect(reasonFor(pin())?.textContent).toBe('The App PIN must be at least 6 digits.')
    expect(pin().parentElement).toBe(reasonFor(pin())?.parentElement)
    expect(h.createStoredWallet).not.toHaveBeenCalled()
    // The reason goes when the person types in that field.
    type(pin(), '1')
    expect(pin().getAttribute('aria-invalid')).toBeNull()
    expect(screen.queryByText('The App PIN must be at least 6 digits.')).toBeNull()
  })

  it('a short PIN is refused the same way', async () => {
    await mount()
    await screen.findByLabelText(/Choose an App PIN/)
    type(pin(), '123')
    type(confirm(), '123')
    await click(createButton())
    expect(document.activeElement).toBe(pin())
    expect(reasonFor(pin())?.textContent).toBe('The App PIN must be at least 6 digits.')
    expect(h.createStoredWallet).not.toHaveBeenCalled()
  })

  it('an existing App PIN left empty is refused on its field', async () => {
    h.appPin = true
    await mount()
    const field = (await screen.findByLabelText('Your App PIN')) as HTMLInputElement
    await click(createButton())
    expect(document.activeElement).toBe(field)
    expect(reasonFor(field)?.textContent).toBe('Enter your App PIN.')
    expect(h.createStoredWallet).not.toHaveBeenCalled()
  })

  it('two PINs that differ move focus to the confirm field, with the reason beside it', async () => {
    await mount()
    await screen.findByLabelText('Confirm the App PIN')
    type(pin(), '123456')
    type(confirm(), '654321')
    await click(createButton())
    expect(document.activeElement).toBe(confirm())
    expect(confirm().getAttribute('aria-invalid')).toBe('true')
    expect(pin().getAttribute('aria-invalid')).toBeNull()
    expect(reasonFor(confirm())?.textContent).toBe("The two PINs don't match.")
    expect(confirm().parentElement).toBe(reasonFor(confirm())?.parentElement)
    expect(h.createStoredWallet).not.toHaveBeenCalled()
    // No PIN is held anywhere the page can read it back as text.
    expect(document.body.textContent).not.toContain('123456')
  })

  it('a good PIN makes the same keystore call as before the Review', async () => {
    await mount()
    await screen.findByLabelText('Confirm the App PIN')
    type(pin(), '123456')
    type(confirm(), '123456')
    await click(createButton())
    expect(h.createStoredWallet).toHaveBeenCalledTimes(1)
    expect(h.createStoredWallet.mock.calls[0][0]).toMatchObject({ label: 'My Wallet', network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', autoLockMinutes: 5, signing: 'standard', passkey: 'no' })
    expect(h.createStoredWallet.mock.calls[0][1]).toMatchObject({ pin: '123456', appPinExpected: false })
  })
})
