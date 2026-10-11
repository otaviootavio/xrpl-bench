/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Story 2: "the app is locked → no ledger request is made". Every ledger hook
 * lives under `Main`, which the Gate mounts only for an unlocked app; a locked
 * one shows the unlock screen and the pool is never asked for a client.
 */
const h = vi.hoisted(() => ({ getXrplClient: vi.fn() }))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/xrpl/client', () => ({ getXrplClient: h.getXrplClient, holdXrplClient: vi.fn() }))
vi.mock('@/pages/Main', () => ({ Main: () => <div>main</div> }))
vi.mock('@/pages/Unlock', () => ({ Unlock: () => <div>unlock</div> }))
vi.mock('@/pages/Onboarding', () => ({ Onboarding: () => <div>onboarding</div> }))
vi.mock('@/lib/crypto/auth', () => ({ endSession: async () => {}, restoreSession: async () => null }))
vi.mock('@/lib/crypto/keystore', () => ({
  migrateLegacyVault: async () => true,
  listWallets: async () => [
    { id: 'w1', seedId: 'w1', label: 'W', address: 'rA', createdAt: 1, network: 'mainnet', algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' },
  ],
}))

import App from '../App'
import { useAppStore } from '@/store/app-store'

afterEach(cleanup)

describe('a locked app issues no ledger request', () => {
  it('shows the unlock screen and never asks the pool for a client', async () => {
    useAppStore.setState({ unlocked: false })
    render(<App />)
    await waitFor(() => expect(screen.getByText('unlock')).toBeTruthy())
    expect(screen.queryByText('main')).toBeNull()
    expect(h.getXrplClient).not.toHaveBeenCalled()
  })
})
