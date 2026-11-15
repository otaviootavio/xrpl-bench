import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {} }))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: () => {} }))

import { forgetSyncedAddress } from '../teardown'
import { useAppStore } from '@/store/app-store'
import { queryKeys } from '@/lib/xrpl/query-keys'

/** Sync scope (story 4, OS-FR-4): a changed or removed Synced address sheds its
 * cached reads, unless another open Wallet still holds that (network, address). */
const OLD = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const tx = { id: 't', seedId: 't', lockId: 'LT', label: 'Send', createdAt: 1, network: 'testnet', openCheck: 'pin', kind: 'transmitter', address: null }
const online = (lockId: string) => ({ id: 'o', seedId: 'o', lockId, label: 'Main', address: OLD, keyAddress: OLD, createdAt: 1, network: 'testnet', algorithm: 'ed25519', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard', kind: 'online' })
const removed = (client: { removeQueries: ReturnType<typeof vi.fn> }) => client.removeQueries.mock.calls.map((c) => JSON.stringify(c[0].queryKey))

beforeEach(() => useAppStore.setState({ wallets: [], openLocks: {} } as never))

describe('forgetSyncedAddress (OS-FR-4)', () => {
  it('removes every account-scoped entry of the old address when no other open Wallet holds it', () => {
    useAppStore.setState({ wallets: [tx, online('LO')], openLocks: { LT: {} } } as never)
    const client = { removeQueries: vi.fn() }
    forgetSyncedAddress(client as never, 't', 'testnet', OLD)
    expect(removed(client)).toContain(JSON.stringify(queryKeys.accountState('testnet', OLD)))
    expect(removed(client)).toContain(JSON.stringify(queryKeys.delegates('testnet', OLD)))
  })

  it('keeps them while another open Wallet holds the same address on the same Network', () => {
    useAppStore.setState({ wallets: [tx, online('LO')], openLocks: { LT: {}, LO: {} } } as never)
    const client = { removeQueries: vi.fn() }
    forgetSyncedAddress(client as never, 't', 'testnet', OLD)
    expect(client.removeQueries).not.toHaveBeenCalled()
  })

  it('does nothing when there was no Synced address', () => {
    const client = { removeQueries: vi.fn() }
    forgetSyncedAddress(client as never, 't', 'testnet', null)
    expect(client.removeQueries).not.toHaveBeenCalled()
  })
})
