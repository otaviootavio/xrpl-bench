/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Story 8: the edit dialog RENDERS what `lib/crypto/policy.ts` says about the
 * result of an edit — it decides nothing itself. The keystore is stubbed at its
 * edge; the policy is the real one.
 */
const SEED = 'sEdTM1uX8pu2do5XvTnutH6HsouMaM2'

const h = vi.hoisted(() => ({
  capability: 'yes' as 'yes' | 'no' | 'unknown',
  appPin: true,
  lock: { id: 'lock-1', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false } as Record<string, unknown>,
  editChecks: vi.fn(),
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/webauthn', () => ({ detectPrfSupport: async () => h.capability, getRpId: () => 'localhost' }))
vi.mock('@/lib/crypto/lock', () => ({ hasAppPin: async () => h.appPin, getLockInfo: async () => h.lock }))
vi.mock('@/lib/crypto/pin', () => ({ triesRemaining: async () => 8 }))
vi.mock('@/lib/crypto/keystore', () => ({
  editChecks: (...a: unknown[]) => h.editChecks(...a),
  describeCheckFailure: (r: { status: string; triesRemaining?: number }) =>
    r.status === 'wrong-credential' ? `Incorrect PIN. ${r.triesRemaining} tries remaining.` : 'Locked out.',
}))

import { EditChecksDialog } from '../EditChecksDialog'
import { useAppStore } from '@/store/app-store'

const META = {
  id: 'w1',
  seedId: 's1',
  lockId: 'lock-1',
  label: 'Savings',
  address: 'rAddr',
  createdAt: 1,
  network: 'testnet',
  algorithm: 'ed25519',
  openCheck: 'pin',
  signingCheck: 'standard',
  seedMethod: 'stored',
} as const

const done = { status: 'ok', value: { meta: META, changed: true, previousLockId: 'lock-1', autoLockMinutes: 5, previousLockRemoved: false } }
const click = async (el: HTMLElement) => act(async () => void fireEvent.click(el))
const radio = (name: RegExp | string) => screen.getByRole('radio', { name }) as HTMLInputElement
const save = () => screen.getByRole('button', { name: /Save changes/ })

async function mount(wallet: Record<string, unknown> = META, onEdited = vi.fn(), onClose = vi.fn()) {
  useAppStore.setState({ wallets: [wallet] } as never)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <EditChecksDialog wallet={wallet as never} onClose={onClose} onEdited={onEdited} />
    </QueryClientProvider>,
  )
  await screen.findByText('Open Check')
  return { onEdited, onClose }
}

beforeEach(() => {
  h.capability = 'yes'
  h.appPin = true
  h.lock = { id: 'lock-1', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }
  h.editChecks.mockReset().mockResolvedValue(done)
})
afterEach(cleanup)

describe('Edit checks dialog', () => {
  it('asks nothing and offers no save while nothing is changed', async () => {
    await mount()
    expect(save().getAttribute('aria-disabled')).toBe('true')
    await click(save())
    expect(h.editChecks).not.toHaveBeenCalled()
    expect(screen.getByText(/Nothing to change yet/)).toBeTruthy()
  })

  it('sends only what changed, with the passkey choice, and hands the result to the caller', async () => {
    const { onEdited, onClose } = await mount()
    await click(radio(/Passkey only: create a new one/))
    await click(save())
    await waitFor(() => expect(onEdited).toHaveBeenCalledWith(done.value))
    expect(onClose).toHaveBeenCalled()
    const [id, request, ctx] = h.editChecks.mock.calls[0]
    expect(id).toBe('w1')
    expect(request).toEqual({ signing: { kind: 'passkey', passkey: 'new' } })
    expect(ctx.pin).toBeUndefined()
    expect(typeof ctx.confirmWrittenSeed).toBe('function')
  })

  it('shows an unavailable answer aria-disabled with its reason in words, and never calls the keystore with it', async () => {
    h.capability = 'no'
    await mount()
    const passkey = radio(/Passkey only: create a new one/)
    expect(passkey.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getAllByText(/cannot use a passkey/).length).toBeGreaterThan(0)
    await click(passkey)
    expect(passkey.checked).toBe(false)
  })

  it('Mainnet: No Open Check is aria-disabled with the policy reason, and the sub-minute lock too', async () => {
    await mount({ ...META, network: 'mainnet' })
    expect(radio('No Open Check').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getAllByText(/Mainnet wallet needs an Open Check/).length).toBeGreaterThan(0)
    expect(radio('30 seconds').getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('Real funds')).toBeTruthy()
  })

  it('a Passkey-Derived Wallet: every Signing Check answer is aria-disabled with the reason; Open Check is editable', async () => {
    await mount({ ...META, seedMethod: 'passkey-derived', signingCheck: 'passkey' })
    for (const name of ['Standard', 'App PIN only', /A new passkey/, /use one already on this device/]) {
      // the Open Check axis also offers a passkey: look only in the Signing Check fieldset
      const fieldset = screen.getByText('Signing Check').closest('fieldset') as HTMLElement
      const inside = Array.from(fieldset.querySelectorAll('input[type=radio]')) as HTMLInputElement[]
      const labelled = inside.filter((r) => (r.closest('label')?.textContent ?? '').match(name))
      expect(labelled.length).toBeGreaterThan(0)
      for (const r of labelled) expect(r.getAttribute('aria-disabled')).toBe('true')
    }
    expect(screen.getAllByText(/Signing Check is its passkey/).length).toBeGreaterThan(0)
    expect(radio('No Open Check').getAttribute('aria-disabled')).toBeNull()
  })

  it('warns that an older version can no longer open the wallet when a Signing Check is added or the legacy lock is left', async () => {
    await mount()
    expect(screen.queryByText(/older version of this app can no longer open/i)).toBeNull()
    await click(radio(/Passkey only: create a new one/))
    expect(screen.getByText(/older version of this app can no longer open/i)).toBeTruthy()
    cleanup()
    h.lock = { id: 'legacy', openCheck: 'either', autoLockMinutes: 5, pin: true, passkey: true }
    await mount({ ...META, lockId: 'legacy', openCheck: 'either' })
    expect(screen.queryByText(/older version of this app can no longer open/i)).toBeNull()
    await click(radio('App PIN'))
    expect(screen.getByText(/older version of this app can no longer open/i)).toBeTruthy()
  })

  it('a new PIN check needs the App PIN, typed twice when none exists', async () => {
    h.appPin = false
    h.lock = { id: 'lock-1', openCheck: 'none', autoLockMinutes: 5, pin: false, passkey: false }
    await mount({ ...META, openCheck: 'none' })
    await click(radio('App PIN'))
    await screen.findByLabelText(/Choose an App PIN/)
    await click(save())
    expect(screen.getByRole('alert').textContent).toMatch(/at least 6 digits/)
    expect(h.editChecks).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/Choose an App PIN/), { target: { value: '123456' } })
    fireEvent.change(screen.getByLabelText(/Confirm the App PIN/), { target: { value: '654321' } })
    await click(save())
    expect(screen.getByRole('alert').textContent).toMatch(/don't match/)
    fireEvent.change(screen.getByLabelText(/Confirm the App PIN/), { target: { value: '123456' } })
    await click(save())
    await waitFor(() => expect(h.editChecks).toHaveBeenCalled())
    expect(h.editChecks.mock.calls[0][2].pin).toBe('123456')
  })

  it.each([
    [{ status: 'refused', reason: 'A Mainnet wallet must auto-lock after at least 1 minute of inactivity.' }, /at least 1 minute/],
    [{ status: 'cancelled' }, /Cancelled\. Nothing was changed/],
    [{ status: 'wrong-credential', kind: 'pin', triesRemaining: 7 }, /Incorrect PIN\. 7 tries remaining\. Nothing was changed/],
  ])('a %j result is said in plain words and does not close the dialog', async (result, words) => {
    h.editChecks.mockResolvedValue(result)
    const { onClose, onEdited } = await mount()
    await click(radio(/Passkey only: create a new one/))
    await click(save())
    expect(await screen.findByText(words)).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    expect(onEdited).not.toHaveBeenCalled()
  })

  it('asks for the written Seed through the keystore callback, and cancelling it goes back to the form', async () => {
    let settled: boolean | null = null
    h.editChecks.mockImplementation(async (_id: string, _req: unknown, ctx: { confirmWrittenSeed: (s: string) => Promise<boolean> }) => {
      settled = await ctx.confirmWrittenSeed(SEED)
      return { status: 'cancelled' }
    })
    await mount({ ...META, network: 'mainnet' })
    await click(radio('Passkey: create a new one'))
    await click(radio(/Passkey only: create a new one/))
    expect(screen.getByText(/write your Seed down/)).toBeTruthy()
    await click(save())
    await screen.findByText('Write down your Seed')
    await click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(settled).toBe(false))
    expect(await screen.findByText('Open Check')).toBeTruthy()
  })

  it('typing the challenged groups resolves the callback true and the edit goes on to onEdited and close', async () => {
    let settled: boolean | null = null
    h.editChecks.mockImplementation(async (_id: string, _req: unknown, ctx: { confirmWrittenSeed: (s: string) => Promise<boolean> }) => {
      settled = await ctx.confirmWrittenSeed(SEED)
      return settled ? done : { status: 'cancelled' }
    })
    const { onEdited, onClose } = await mount({ ...META, network: 'mainnet' })
    await click(radio('Passkey: create a new one'))
    await click(radio(/Passkey only: create a new one/))
    await click(save())
    await screen.findByText('Write down your Seed')
    for (const input of screen.getAllByLabelText(/^Characters /) as HTMLInputElement[]) {
      const [from, to] = (input.labels?.[0]?.textContent ?? '').replace('Characters ', '').split('–').map(Number)
      await act(async () => void fireEvent.change(input, { target: { value: SEED.slice(from - 1, to) } }))
    }
    await click(screen.getByRole('button', { name: 'Check what I wrote' }))
    await waitFor(() => expect(onEdited).toHaveBeenCalledWith(done.value))
    expect(settled).toBe(true)
    expect(onClose).toHaveBeenCalled()
  })

  it('a failure AFTER the commit says the edit was saved, never "Nothing was changed"', async () => {
    const onEdited = vi.fn().mockRejectedValue(new Error('idb down'))
    const { onClose } = await mount(META, onEdited)
    await click(radio(/Passkey only: create a new one/))
    await click(save())
    expect(await screen.findByText('Saved, but the wallet could not be reopened. Unlock it again.')).toBeTruthy()
    expect(screen.queryByText(/Nothing was changed/)).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('offers a sub-minute auto-lock as unavailable when another Wallet on the shared lock is on Mainnet', async () => {
    h.lock = { id: 'legacy', openCheck: 'either', autoLockMinutes: 5, pin: true, passkey: true }
    const legacy = { ...META, lockId: 'legacy', openCheck: 'either' }
    useAppStore.setState({ wallets: [legacy, { ...META, id: 'w2', seedId: 's2', lockId: 'legacy', network: 'mainnet' }] } as never)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <EditChecksDialog wallet={legacy as never} onClose={vi.fn()} onEdited={vi.fn()} />
      </QueryClientProvider>,
    )
    await screen.findByText('Open Check')
    expect(radio('30 seconds').getAttribute('aria-disabled')).toBe('true')
  })
})
