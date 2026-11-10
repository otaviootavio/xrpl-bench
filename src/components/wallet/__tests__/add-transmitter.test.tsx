/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Add a Transmitter wallet (offline signing story 4; OS-FR-3, OS-FR-4, P-2, P-41,
 * P-8). Real: the quiz, the policy, the words, the store. Faked: the keystore write
 * and the lock session, at their edges.
 */
const h = vi.hoisted(() => ({
  create: vi.fn(),
  startLockSession: vi.fn(),
  appPin: true,
  capability: 'no' as 'yes' | 'no' | 'unknown',
}))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/webauthn', () => ({ detectPrfSupport: async () => h.capability, getRpId: () => 'localhost' }))
vi.mock('@/lib/crypto/lock', () => ({ hasAppPin: async () => h.appPin, startLockSession: (...a: unknown[]) => h.startLockSession(...a) }))
vi.mock('@/lib/crypto/pin', () => ({ triesRemaining: async () => 8 }))
vi.mock('@/lib/xrpl/client', () => ({ verifyNode: vi.fn() }))
vi.mock('@/lib/crypto/keystore', () => ({
  createTransmitterWallet: (...a: unknown[]) => h.create(...a),
  listWallets: async () => [],
  describeCheckFailure: () => 'Locked out.',
  appPinResidue: async () => false,
}))
vi.mock('@/lib/build-info', () => ({ BUILD: { version: '0.0.0' }, shortSha: 'abc', sourceUrl: '#', formatBuiltAt: () => 'now' }))

import { AddTransmitterScreen } from '../AddTransmitterScreen'
import { useAppStore } from '@/store/app-store'
import { consumeAdded } from '@/lib/chooser-signals'
import { Onboarding } from '@/pages/Onboarding'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const ADDR = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const P8 = 'WARNING: An offline wallet on this device has this address.'
const onClose = vi.fn()

const button = (name: string) => screen.getByRole('button', { name })
const heading = () => screen.getByRole('heading', { level: 2 }).textContent
async function click(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el)
  })
}
async function open() {
  render(<AddTransmitterScreen onClose={onClose} />)
  await screen.findByLabelText('Label')
}

beforeEach(() => {
  h.create.mockReset()
  h.startLockSession.mockReset()
  onClose.mockReset()
  useAppStore.setState({ wallets: [], openLocks: {}, activeWalletId: null } as never)
})
afterEach(cleanup)

describe('Add a Transmitter wallet (OS-FR-3)', () => {
  it('walks Name and network, Node, Open Check and auto-lock, Sync to an address, Review, with no Seed or Signing Check question', async () => {
    await open()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Add a Transmitter wallet')
    const titles = [heading()]
    for (let i = 0; i < 3; i++) {
      await click(button('Next'))
      titles.push(heading())
    }
    expect(screen.getByText('You can do this step later in Local settings.')).toBeTruthy()
    await click(button('Skip this step'))
    titles.push(heading())
    expect(titles).toEqual(['Name and network', 'Node', 'Authentication to open the wallet, and auto-lock', 'Sync to an address', 'Review'])
    expect(document.body.textContent).not.toMatch(/Seed|Authentication required to sign/)
    const terms = [...document.querySelectorAll('dt')].map((d) => d.textContent)
    expect(terms).toEqual(['Label', 'Network', 'Node', 'Authentication required to open the wallet', 'Auto-lock', 'Sync to an address'])
    expect(screen.getByText('Not synced')).toBeTruthy()
    // P-2 is the final key.
    expect(button('Add a Transmitter wallet')).toBeTruthy()
  })

  it('an address that does not check blocks Next with its reason; a valid one is on the Review and in the write', async () => {
    h.create.mockResolvedValue({ status: 'ok', value: { meta: { id: 'T', lockId: 'LT' }, openKey: {} } })
    await open()
    await click(button('Next'))
    await click(button('Next'))
    // Testnet: no Open Check is allowed, so no PIN is asked on the Review.
    await click(screen.getByRole('radio', { name: 'No authentication required to open the wallet' }))
    await click(button('Next'))
    const field = screen.getByLabelText('Address')
    fireEvent.change(field, { target: { value: 'rNOPE' } })
    expect(button('Next').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText("That doesn't look like a valid XRPL address.")).toBeTruthy()
    await click(button('Next'))
    expect(heading()).toBe('Sync to an address')
    fireEvent.change(field, { target: { value: ADDR } })
    await click(button('Next'))
    expect(heading()).toBe('Review')
    expect(screen.getByText(ADDR)).toBeTruthy()
    await click(button('Add a Transmitter wallet'))
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1))
    expect(h.create.mock.calls[0][0]).toEqual({ label: 'Wallet', network: 'testnet', openCheck: 'none', autoLockMinutes: 5, syncedAddress: ADDR })
    expect(h.startLockSession).toHaveBeenCalledWith('LT', {}, 5)
    expect(useAppStore.getState().openLocks.LT).toBeTruthy()
    expect(consumeAdded()).toBe('T')
    expect(onClose).toHaveBeenCalled()
  })

  it('warns with P-8 when an Offline Wallet here has the address, and still lets it be added', async () => {
    useAppStore.setState({ wallets: [{ id: 'o', seedId: 'o', lockId: 'Lo', label: 'Savings', address: ADDR, keyAddress: ADDR, createdAt: 1, network: 'mainnet', algorithm: 'ed25519', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard', kind: 'offline' }] } as never)
    await open()
    await click(button('Next'))
    await click(button('Next'))
    await click(button('Next'))
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: ADDR } })
    expect(screen.getByText(P8)).toBeTruthy()
    expect(screen.getByText('Thus the offline key is on a device that connects to the internet.')).toBeTruthy()
    expect(button('Next').getAttribute('aria-disabled')).toBeNull()
    await click(button('Next'))
    expect(within(screen.getByRole('region', { name: 'Your answers' })).getByText(P8)).toBeTruthy()
  })

  it('a Network change clears a typed Sync address', async () => {
    await open()
    for (let i = 0; i < 3; i++) await click(button('Next'))
    fireEvent.change(screen.getByRole('textbox', { name: 'Address' }), { target: { value: ADDR } })
    for (let i = 0; i < 3; i++) await click(button('Back'))
    await click(screen.getByRole('radio', { name: /Devnet/ }))
    for (let i = 0; i < 3; i++) await click(button('Next'))
    expect((screen.getByRole('textbox', { name: 'Address' }) as HTMLInputElement).value).toBe('')
  })

  it('on Mainnet no Open Check is not offered, and the 30-second auto-lock is not either (FR-65)', async () => {
    await open()
    await click(screen.getByRole('radio', { name: /Mainnet/ }))
    await click(button('Next'))
    await click(button('Next'))
    expect(screen.getByRole('radio', { name: 'No authentication required to open the wallet' }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('radio', { name: '30 seconds' }).getAttribute('aria-disabled')).toBe('true')
  })

  it('a refusal from the keystore is shown, and nothing is opened', async () => {
    h.create.mockResolvedValue({ status: 'refused', reason: 'No.' })
    await open()
    await click(button('Next'))
    await click(button('Next'))
    await click(screen.getByRole('radio', { name: 'No authentication required to open the wallet' }))
    await click(button('Next'))
    await click(button('Skip this step'))
    await click(button('Add a Transmitter wallet'))
    expect(await screen.findByText('No.')).toBeTruthy()
    expect(h.startLockSession).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('first run offers it too (story 4: a daily phone may hold only a Transmitter)', () => {
  it('Onboarding shows P-2; it opens the quiz, Back to start returns, and a new Transmitter becomes the active Wallet', async () => {
    h.create.mockResolvedValue({ status: 'ok', value: { meta: { id: 'T1', lockId: 'LT1' }, openKey: {} } })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Onboarding />
      </QueryClientProvider>,
    )
    await click(button('Add a Transmitter wallet'))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Add a Transmitter wallet')
    await click(await screen.findByRole('button', { name: /Back to start/ }))
    await click(button('Add a Transmitter wallet'))
    await screen.findByLabelText('Label')
    await click(button('Next'))
    await click(button('Next'))
    await click(screen.getByRole('radio', { name: 'No authentication required to open the wallet' }))
    await click(button('Next'))
    await click(button('Skip this step'))
    await click(button('Add a Transmitter wallet'))
    await waitFor(() => expect(useAppStore.getState().activeWalletId).toBe('T1'))
  })
})
