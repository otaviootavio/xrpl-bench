/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * Story 5: a Wallet sealed under the App PIN can sign and reveal. Every screen
 * that signs (Send, Trust Lines) or reveals a Seed (Settings) hands the keystore
 * the PIN dialog's prompts, so the dialog opens, states tries remaining, and a
 * dismissed one resolves `null` (cancelled, not counted).
 */
const h = vi.hoisted(() => ({
  signingHandleFor: vi.fn(),
  revealSeed: vi.fn(),
  submitTrustSet: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {}, getLockInfo: async () => ({ id: 'lock-1', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }) }))
vi.mock('@/lib/notify', () => ({ toast: { error: (m: string) => h.toastError(m), success: () => {}, warning: () => {}, resolve: () => {} } }))
vi.mock('@/lib/crypto/keystore', () => ({
  addressFromSeed: () => '',
  importAndStoreWallet: async () => {},
  listWallets: async () => [],
  removeWallet: async () => {},
  addNetworkView: async () => ({}),
  setLockAutoLock: async () => ({ ok: true }),
  describeCheckFailure: () => 'failed',
  revealSeed: (...a: unknown[]) => h.revealSeed(...a),
  signingHandleFor: (...a: unknown[]) => h.signingHandleFor(...a),
}))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: async () => {} }))
vi.mock('@/lib/xrpl/query-reads', () => ({ fetchAccountStateOnce: async () => null }))
vi.mock('@/lib/xrpl/writes', () => ({ submitTrustSet: (...a: unknown[]) => h.submitTrustSet(...a) }))
vi.mock('@/components/wallet/SeedReveal', () => ({ SeedReveal: ({ getSeed }: { getSeed: () => string | null }) => <p>{`seed:${getSeed()}`}</p> }))
vi.mock('@/components/wallet/CreateWalletFlow', () => ({ CreateWalletFlow: () => <p>flow</p> }))
vi.mock('@/hooks/useTrustLines', () => ({ useTrustLines: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/useServerReserves', () => ({ useServerReserves: () => ({ data: { baseReserveDrops: '1000000', ownerReserveDrops: '200000' } }) }))
vi.mock('@/hooks/useSpendableBalance', () => ({
  useSpendableBalance: () => ({ status: 'ok', isLoading: false, reserveFailed: false, accountFailed: false, retryReserves: vi.fn(), spendableDrops: '25000000', reservedDrops: '1000000' }),
}))
vi.mock('@/hooks/useAppUpdate', () => ({
  useAppUpdate: () => ({
    updateReady: false, applying: false, applyUpdate: () => {}, checking: false, checkError: null,
    checkForUpdate: () => {}, pendingRelease: null, blockedReason: null, declined: false, declineCurrent: () => {},
  }),
}))
vi.mock('@/lib/build-info', () => ({ BUILD: { version: '0.0.0', commitSha: 'x', builtAt: '' }, shortSha: 'x', sourceUrl: '#', formatBuiltAt: () => '' }))

import { SettingsTab } from '../SettingsTab'
import { TrustLinesTab } from '../TrustLinesTab'
import { PinPromptProvider } from '@/components/wallet/PinPromptDialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/app-store'

const W = { id: 'w1', seedId: 's1', lockId: 'lock-1', label: 'Savings', address: 'rBoGUS9uiK9m3Kk6qnGRvWWCwAeN8hF3wR', createdAt: 1, network: 'testnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'pin' }
const ISSUER = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'

function renderWithPrompts(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <PinPromptProvider>{ui}</PinPromptProvider>
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset()
  useAppStore.setState({ wallets: [W], activeWalletId: 'w1', network: 'testnet', openLocks: { 'lock-1': { key: {} as CryptoKey, autoLockMinutes: 5 } } } as never)
})
afterEach(cleanup)

describe('reveal behind a PIN Signing Check', () => {
  async function reveal() {
    renderWithPrompts(<SettingsTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Reveal seed' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Show my seed' }))
  }

  it('opens the PIN dialog with tries remaining and reveals on the PIN', async () => {
    h.revealSeed.mockImplementation(async (_id: string, ctx: { prompts: { pin(i: { triesRemaining: number }): Promise<string | null> } }) => {
      const pin = await ctx.prompts.pin({ triesRemaining: 5 })
      return pin === '123456' ? { status: 'ok', value: 'sSECRET' } : { status: 'cancelled' }
    })
    await reveal()
    expect(await screen.findByText('5 tries remaining.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('App PIN'), { target: { value: '123456' } })
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Continue' })))
    expect(await screen.findByText('seed:sSECRET')).toBeTruthy()
  })

  it('a cancelled dialog resolves null: the seed stays hidden', async () => {
    let answer: string | null | undefined
    h.revealSeed.mockImplementation(async (_id: string, ctx: { prompts: { pin(i: { triesRemaining: number }): Promise<string | null> } }) => {
      answer = await ctx.prompts.pin({ triesRemaining: 8 })
      return { status: 'cancelled' }
    })
    await reveal()
    await act(async () => void fireEvent.click(await screen.findByRole('button', { name: 'Cancel' })))
    await waitFor(() => expect(answer).toBeNull())
    expect(screen.queryByText(/seed:/)).toBeNull()
  })
})

describe('Trust Lines signing behind a PIN Signing Check', () => {
  it('hands the keystore the dialog, which opens and answers the PIN', async () => {
    let answer: string | null | undefined
    h.signingHandleFor.mockImplementation(async (_id: string, ctx: { prompts: { pin(i: { triesRemaining: number }): Promise<string | null> } }) => ({
      address: W.address,
      open: async () => {
        answer = await ctx.prompts.pin({ triesRemaining: 2 })
        throw new Error('stop after the prompt')
      },
    }))
    h.submitTrustSet.mockImplementation(async (_n: unknown, handle: { open(): Promise<unknown> }) => handle.open())
    renderWithPrompts(<TrustLinesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Add trust line' }))
    fireEvent.change(screen.getByLabelText('Issuer address'), { target: { value: ISSUER } })
    fireEvent.change(screen.getByLabelText('Currency code'), { target: { value: 'USD' } })
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Create trust line' })))
    expect(await screen.findByText('2 tries remaining.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('App PIN'), { target: { value: '654321' } })
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Continue' })))
    await waitFor(() => expect(answer).toBe('654321'))
  })
})

describe('no screen that signs or reveals uses the dismissing prompts', () => {
  it.each(['SendTab.tsx', 'TrustLinesTab.tsx', 'SettingsTab.tsx'])('%s asks the PIN dialog', (file) => {
    const source = readFileSync(join(__dirname, '..', file), 'utf8')
    expect(source).toContain('usePrompts()')
    expect(source).not.toContain('unavailablePrompts')
  })
})
