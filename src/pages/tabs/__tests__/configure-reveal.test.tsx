/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The Configure counterpart of `settings-reveal.test.tsx` (test design R12): the same
 * scenarios driven through the Configure screen's Seed plate, plus the Seed's lifetime.
 */
const h = vi.hoisted(() => ({
  revealSeed: vi.fn(async (_id: string, _ctx: unknown): Promise<unknown> => ({ status: 'ok', value: 'sSECRETSEED' })),
  toastError: vi.fn(),
  getSeed: null as null | (() => string | null),
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {}, getLockInfo: async () => ({ id: 'legacy', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }) }))
vi.mock('@/lib/notify', () => ({ toast: { error: (m: string) => h.toastError(m), success: () => {}, warning: () => {} } }))
vi.mock('@/lib/crypto/keystore', () => ({
  addressFromSeed: () => '',
  listWallets: async () => [],
  unavailablePrompts: { pin: async () => null },
  describeCheckFailure: (r: { status: string; triesRemaining?: number }) =>
    r.status === 'wrong-credential' ? `Incorrect PIN. ${r.triesRemaining} tries remaining.` : 'locked',
  revealSeed: (id: string, ctx: unknown) => h.revealSeed(id, ctx),
}))
vi.mock('@/components/wallet/SeedReveal', () => ({
  SeedReveal: ({ getSeed }: { getSeed: () => string | null }) => {
    h.getSeed = getSeed
    return <p>{`seed:${getSeed()}`}</p>
  },
}))

import { ConfigureScreen } from '@/components/wallet/ConfigureScreen'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/app-store'

const W = { id: 'w1', seedId: 's1', lockId: 'legacy', label: 'Savings', address: 'rAddr', createdAt: 1, network: 'mainnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' }

function mount(wallet: Record<string, unknown> = W) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <ConfigureScreen wallet={wallet as never} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

async function reveal() {
  fireEvent.click(screen.getByRole('button', { name: 'Reveal seed' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Show my seed' }))
}

beforeEach(() => {
  h.revealSeed.mockReset()
  h.toastError.mockReset()
  h.getSeed = null
  useAppStore.setState({ wallets: [W], activeWalletId: 'w1', network: 'mainnet', openLocks: { legacy: { key: {} as CryptoKey, autoLockMinutes: 5 } } } as never)
})
afterEach(cleanup)

describe('Configure reveal seed: the dialog names the check', () => {
  async function dialogFor(wallet: Record<string, unknown>) {
    useAppStore.setState({
      wallets: [{ ...W, ...wallet }],
      openLocks: { legacy: { key: {} as CryptoKey, autoLockMinutes: 5 }, 'lock-1': { key: {} as CryptoKey, autoLockMinutes: 5 } },
    } as never)
    mount({ ...W, ...wallet })
    fireEvent.click(screen.getByRole('button', { name: 'Reveal seed' }))
    const dialog = await screen.findByRole('dialog')
    expect(screen.getByRole('heading', { name: "Reveal this wallet's seed?" })).toBeTruthy()
    return dialog.textContent ?? ''
  }

  it.each([
    ['a PIN Open Check', { lockId: 'lock-1' }, /App PIN will be asked/],
    ['the legacy lock, whichever check it uses', {}, /passkey or App PIN will be asked, whichever this wallet's lock uses/],
    ['a passkey Open Check', { lockId: 'lock-1', openCheck: 'passkey' }, /passkey will be asked/],
    ['an either lock off the legacy id', { lockId: 'lock-1', openCheck: 'either' }, /passkey will be asked, or your App PIN/],
    ['no Open Check', { lockId: 'lock-1', openCheck: 'none' }, /nothing more will be asked and the Seed is shown/],
    ['a PIN Signing Check', { openCheck: 'passkey', signingCheck: 'pin' }, /App PIN will be asked/],
    ['a passkey Signing Check', { signingCheck: 'passkey' }, /passkey will be asked/],
    ['a Passkey-Derived Seed', { seedMethod: 'passkey-derived', signingCheck: 'passkey' }, /passkey will be asked/],
  ])('%s', async (_name, change, expected) => {
    expect(await dialogFor(change)).toMatch(expected)
  })
})

describe('Configure reveal seed', () => {
  it('is an outline key, not danger; the confirm key is the destructive fill', async () => {
    mount()
    const key = screen.getByRole('button', { name: 'Reveal seed' })
    expect(key.className).toContain('border-input')
    expect(key.className).not.toContain('border-destructive')
    fireEvent.click(key)
    expect((await screen.findByRole('button', { name: 'Show my seed' })).className).toContain('bg-destructive')
  })

  it('asks the wallet\'s own check with its own lock key', async () => {
    const OWN = { type: 'own' } as unknown as CryptoKey
    useAppStore.setState({ openLocks: { legacy: { key: OWN, autoLockMinutes: 5 }, other: { key: {} as CryptoKey, autoLockMinutes: 5 } } } as never)
    h.revealSeed.mockResolvedValue({ status: 'ok', value: 'sSECRETSEED' })
    mount()
    await reveal()
    await screen.findByText('seed:sSECRETSEED')
    expect(h.revealSeed.mock.calls[0][0]).toBe('w1')
    expect((h.revealSeed.mock.calls[0][1] as { openKey: CryptoKey }).openKey).toBe(OWN)
  })

  it('shows the seed on ok', async () => {
    h.revealSeed.mockResolvedValue({ status: 'ok', value: 'sSECRETSEED' })
    mount()
    await reveal()
    expect(await screen.findByText('seed:sSECRETSEED')).toBeTruthy()
    expect(h.toastError).not.toHaveBeenCalled()
  })

  it('toasts on a cancelled check and keeps the seed hidden', async () => {
    h.revealSeed.mockResolvedValue({ status: 'cancelled' })
    mount()
    await reveal()
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Cancelled. The seed was not revealed.'))
    expect(screen.queryByText(/seed:/)).toBeNull()
  })

  it('toasts the described failure on a wrong credential and keeps the seed hidden', async () => {
    h.revealSeed.mockResolvedValue({ status: 'wrong-credential', kind: 'pin', triesRemaining: 6 })
    mount()
    await reveal()
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Incorrect PIN. 6 tries remaining.'))
    expect(screen.queryByText(/seed:/)).toBeNull()
  })

  it('a closed lock reveals nothing', async () => {
    useAppStore.setState({ openLocks: {} } as never)
    mount()
    await reveal()
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Open this wallet first: its lock is closed.'))
    expect(h.revealSeed).not.toHaveBeenCalled()
  })
})

describe('Configure reveal seed: the Seed\'s lifetime', () => {
  it('is in no rendered text before the reveal, nor after the dialog closes', async () => {
    h.revealSeed.mockResolvedValue({ status: 'ok', value: 'sSECRETSEED' })
    mount()
    expect(document.body.textContent).not.toContain('sSECRETSEED')
    await reveal()
    await screen.findByText('seed:sSECRETSEED')
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText(/seed:/)).toBeNull())
    expect(document.body.textContent).not.toContain('sSECRETSEED')
  })

  it('the ref is cleared when the dialog closes', async () => {
    h.revealSeed.mockResolvedValue({ status: 'ok', value: 'sSECRETSEED' })
    mount()
    await reveal()
    await screen.findByText('seed:sSECRETSEED')
    expect(h.getSeed?.()).toBe('sSECRETSEED')
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText(/seed:/)).toBeNull())
    expect(h.getSeed?.()).toBeNull()
  })

  it('the ref is cleared when the screen unmounts mid-reveal', async () => {
    h.revealSeed.mockResolvedValue({ status: 'ok', value: 'sSECRETSEED' })
    const { unmount } = mount()
    await reveal()
    await screen.findByText('seed:sSECRETSEED')
    expect(h.getSeed?.()).toBe('sSECRETSEED')
    unmount()
    expect(h.getSeed?.()).toBeNull()
  })

  it('a second press while the check is open asks nothing more', async () => {
    let settle!: (v: unknown) => void
    h.revealSeed.mockReturnValue(new Promise((r) => (settle = r)))
    mount()
    await reveal()
    fireEvent.click(screen.getByRole('button', { name: 'Show my seed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show my seed' }))
    expect(h.revealSeed).toHaveBeenCalledTimes(1)
    await act(async () => settle({ status: 'ok', value: 'sSECRETSEED' }))
  })

  it('a reveal that resolves after the screen was left writes the Seed nowhere', async () => {
    let settle!: (v: unknown) => void
    h.revealSeed.mockReturnValue(new Promise((r) => (settle = r)))
    const view = mount()
    await reveal()
    view.unmount()
    await act(async () => settle({ status: 'ok', value: 'sSECRETSEED' }))
    expect(h.getSeed?.() ?? null).toBeNull()
    expect(document.body.textContent).not.toContain('sSECRETSEED')
  })

  it('focus returns to the Reveal seed key after the seed dialog closes', async () => {
    h.revealSeed.mockResolvedValue({ status: 'ok', value: 'sSECRETSEED' })
    mount()
    await reveal()
    await screen.findByText('seed:sSECRETSEED')
    act(() => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }))
    await waitFor(() => expect(screen.queryByText(/seed:/)).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reveal seed' })))
  })

  it('focus returns to the key after the confirm is cancelled', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Reveal seed' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Reveal seed' })))
    expect(h.revealSeed).not.toHaveBeenCalled()
  })
})
