import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ retire: vi.fn() }))
vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/auth', () => ({ wipeVault: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {} }))
vi.mock('@/lib/xrpl/client', () => ({ disconnectAllClients: () => {}, retireNetworkClient: h.retire }))

import { forgetLedgerOf } from '../teardown'
import { useAppStore } from '@/store/app-store'
import { queryKeys } from '@/lib/xrpl/query-keys'

/** Offline scope (story 5, OS-FR-5, Text C "This wallet stops all connections to the
 * XRP Ledger"): the changed Wallet's cached reads and its socket go, unless another
 * open Wallet still uses them. */
const A = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const key = (id: string, lockId: string, o: Record<string, unknown> = {}) => ({ id, seedId: id, lockId, label: id, address: A, keyAddress: A, createdAt: 1, network: 'testnet', algorithm: 'ed25519', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard', kind: 'online', ...o })
const before = key('w', 'LW')
const removed = (client: { removeQueries: ReturnType<typeof vi.fn> }) => client.removeQueries.mock.calls.map((c) => JSON.stringify(c[0].queryKey))

beforeEach(() => {
  h.retire.mockClear()
  useAppStore.setState({ wallets: [], openLocks: {} } as never)
})

describe('forgetLedgerOf (OS-FR-5)', () => {
  it('alone on the network: removes its account data and retires the built-in socket', () => {
    useAppStore.setState({ wallets: [key('w', 'LW', { kind: 'offline' })], openLocks: { LW: {} } } as never)
    const client = { removeQueries: vi.fn() }
    forgetLedgerOf(client as never, before as never)
    expect(removed(client)).toContain(JSON.stringify(queryKeys.accountState('testnet', A)))
    expect(h.retire).toHaveBeenCalledWith('testnet', undefined)
  })

  it('retires its custom Node', () => {
    const client = { removeQueries: vi.fn() }
    forgetLedgerOf(client as never, { ...before, node: 'wss://mine.example' } as never)
    expect(h.retire).toHaveBeenCalledWith('testnet', 'wss://mine.example')
  })

  it('keeps the socket while another open Online Wallet or Synced Transmitter reads through it', () => {
    const client = { removeQueries: vi.fn() }
    useAppStore.setState({ wallets: [key('o', 'LO', { address: 'rOther' })], openLocks: { LO: {} } } as never)
    forgetLedgerOf(client as never, before as never)
    useAppStore.setState({ wallets: [{ id: 't', seedId: 't', lockId: 'LT', label: 't', createdAt: 1, network: 'testnet', openCheck: 'pin', kind: 'transmitter', address: 'rOther' }], openLocks: { LT: {} } } as never)
    forgetLedgerOf(client as never, before as never)
    expect(h.retire).not.toHaveBeenCalled()
  })

  it('retires it when the other Wallet is locked, Offline, on another Node or another Network', () => {
    const client = { removeQueries: vi.fn() }
    for (const other of [key('a', 'LA'), key('b', 'LB', { kind: 'offline' }), key('c', 'LC', { node: 'wss://n.example' }), key('d', 'LD', { network: 'mainnet' })]) {
      useAppStore.setState({ wallets: [other], openLocks: other.lockId === 'LA' ? {} : { [other.lockId]: {} } } as never)
      forgetLedgerOf(client as never, before as never)
    }
    expect(h.retire).toHaveBeenCalledTimes(4)
  })

  it('keeps the account data while another open Wallet holds the same address', () => {
    useAppStore.setState({ wallets: [key('o', 'LO')], openLocks: { LO: {} } } as never)
    const client = { removeQueries: vi.fn() }
    forgetLedgerOf(client as never, before as never)
    expect(client.removeQueries).not.toHaveBeenCalled()
  })
})
