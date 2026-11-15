import { describe, expect, it, vi } from 'vitest'

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))

import { offlineWalletHas, transmitterSyncedTo } from '../same-address'
import { removeBodyFor, removeSentences, REMOVE_LAST } from '../remove-copy'
import { ADD_TRANSMITTER_PATH, parseRoute } from '../route'
import { mergePersistedAppState } from '@/store/app-store'
import type { WalletMeta } from '@/lib/crypto/keystore'

/** Story 4 helpers: P-8's two conditions, the Transmitter's Remove body, its route
 * and its meta surviving a reload (OS-FR-3, OS-FR-4). */
const A = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe'
const key = (id: string, kind: 'online' | 'offline', address = A, network = 'testnet'): WalletMeta =>
  ({ id, seedId: id, lockId: `L${id}`, label: id, address, keyAddress: address, createdAt: 1, network, algorithm: 'ed25519', seedMethod: 'stored', openCheck: 'pin', signingCheck: 'standard', kind }) as WalletMeta
const tx = (id: string, address: string | null): WalletMeta =>
  ({ id, seedId: id, lockId: `L${id}`, label: id, address, createdAt: 1, network: 'mainnet', openCheck: 'pin', kind: 'transmitter' }) as WalletMeta

describe('P-8: the same address as an Offline and a Transmitter Wallet (OS-FR-3)', () => {
  it('first form: an Offline Wallet here has the address, on any Network', () => {
    expect(offlineWalletHas([key('o', 'offline', A, 'mainnet')], A)).toBe(true)
    expect(offlineWalletHas([key('n', 'online')], A)).toBe(false)
    expect(offlineWalletHas([key('o', 'offline')], '')).toBe(false)
  })

  it('second form: a Transmitter here is synced to the address', () => {
    expect(transmitterSyncedTo([tx('t', A)], A)).toBe(true)
    expect(transmitterSyncedTo([tx('t', null)], A)).toBe(false)
    expect(transmitterSyncedTo([key('o', 'offline')], A)).toBe(false)
  })
})

describe('the Transmitter Remove dialog says no Seed sentence (story 4, deferred from story 1)', () => {
  it('a Transmitter beside other Wallets: no sentence; the last one: only the last-wallet sentence', () => {
    expect(removeBodyFor([tx('t', null), key('o', 'online')], 't')).toBe('transmitter')
    expect(removeSentences('transmitter')).toEqual([])
    expect(removeBodyFor([tx('t', A)], 't')).toBe('transmitter-last')
    expect(removeSentences('transmitter-last')).toEqual([REMOVE_LAST])
    for (const body of ['transmitter', 'transmitter-last'] as const) expect(removeSentences(body).join(' ')).not.toMatch(/seed|backup/i)
  })

  it('a Seed Wallet beside a Transmitter keeps its sentences', () => {
    expect(removeBodyFor([tx('t', null), key('o', 'online')], 'o')).toBe('sole')
  })
})

describe('Add a Transmitter wallet route (P-2)', () => {
  it('is a chooser-side screen of its own', () => {
    expect(parseRoute(ADD_TRANSMITTER_PATH)).toEqual({ screen: 'add-transmitter' })
    expect(parseRoute('/wallets/new')).toEqual({ screen: 'add-wallet' })
  })
})

describe('a Transmitter meta survives a reload (OS-FR-3)', () => {
  it('is kept with or without a Synced address; an incomplete one is not shown', () => {
    const current = { network: 'testnet', wallets: [], activeWalletId: null, addressBook: {}, declinedUpdateVersions: [] } as never
    const merged = mergePersistedAppState({ wallets: [tx('t1', null), tx('t2', A), { ...tx('bad', A), lockId: '' }, key('k', 'online')] }, current) as unknown as { wallets: WalletMeta[] }
    expect(merged.wallets.map((w) => w.id)).toEqual(['t1', 't2', 'k'])
  })
})
