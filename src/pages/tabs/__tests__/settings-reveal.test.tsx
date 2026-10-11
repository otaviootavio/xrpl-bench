/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/** handleConfirmReveal against every shape of `CheckResult`. */
const h = vi.hoisted(() => ({
  revealSeed: vi.fn(async (_id: string, _ctx: unknown): Promise<unknown> => ({ status: 'ok', value: 'sSECRETSEED' })),
  toastError: vi.fn(),
}))

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {}, endSession: async () => {} }))
vi.mock('@/lib/notify', () => ({ toast: { error: (m: string) => h.toastError(m), success: () => {}, warning: () => {} } }))
vi.mock('@/lib/crypto/keystore', () => ({
  addressFromSeed: () => '',
  generateAndStoreWallet: async () => {},
  importAndStoreWallet: async () => {},
  listWallets: async () => [],
  removeWallet: async () => {},
  addNetworkView: async () => ({}),
  unavailablePrompts: { pin: async () => null },
  describeCheckFailure: (r: { status: string; triesRemaining?: number }) =>
    r.status === 'wrong-credential' ? `Incorrect PIN. ${r.triesRemaining} tries remaining.` : 'locked',
  revealSeed: (id: string, ctx: unknown) => h.revealSeed(id, ctx),
}))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: async () => {} }))
vi.mock('@/lib/xrpl/query-reads', () => ({ fetchAccountStateOnce: async () => null }))
vi.mock('@/components/wallet/SeedReveal', () => ({ SeedReveal: ({ getSeed }: { getSeed: () => string | null }) => <p>{`seed:${getSeed()}`}</p> }))
vi.mock('@/hooks/useAppUpdate', () => ({
  useAppUpdate: () => ({
    updateReady: false, applying: false, applyUpdate: () => {}, checking: false, checkError: null,
    checkForUpdate: () => {}, pendingRelease: null, blockedReason: null, declined: false, declineCurrent: () => {},
  }),
}))
vi.mock('@/lib/build-info', () => ({
  BUILD: { version: '0.0.0', commitSha: 'unknown-dev', builtAt: '' },
  shortSha: 'unknown',
  sourceUrl: 'https://example.invalid',
  formatBuiltAt: () => '',
}))

import { SettingsTab } from '../SettingsTab'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/app-store'

const W = { id: 'w1', seedId: 's1', label: 'Savings', address: 'rAddr', createdAt: 1, network: 'mainnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' }

async function openReveal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <SettingsTab />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Reveal seed' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Show my seed' }))
}

beforeEach(() => {
  h.revealSeed.mockReset()
  h.toastError.mockReset()
  useAppStore.setState({ wallets: [W], activeWalletId: 'w1', network: 'mainnet', vaultKey: {} as CryptoKey } as never)
})
afterEach(cleanup)

describe('SettingsTab reveal seed', () => {
  it('shows the seed on ok', async () => {
    h.revealSeed.mockResolvedValue({ status: 'ok', value: 'sSECRETSEED' })
    await openReveal()
    expect(await screen.findByText('seed:sSECRETSEED')).toBeTruthy()
    expect(h.toastError).not.toHaveBeenCalled()
  })

  it('toasts on a cancelled check and keeps the seed hidden', async () => {
    h.revealSeed.mockResolvedValue({ status: 'cancelled' })
    await openReveal()
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Cancelled. The seed was not revealed.'))
    expect(screen.queryByText(/seed:/)).toBeNull()
  })

  it('toasts the described failure on a wrong credential and keeps the seed hidden', async () => {
    h.revealSeed.mockResolvedValue({ status: 'wrong-credential', kind: 'pin', triesRemaining: 6 })
    await openReveal()
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith('Incorrect PIN. 6 tries remaining.'))
    expect(screen.queryByText(/seed:/)).toBeNull()
  })
})
