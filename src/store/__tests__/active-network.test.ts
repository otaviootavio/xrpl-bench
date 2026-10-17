/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('idb-keyval', () => ({ get: async () => undefined, set: async () => {}, del: async () => {} }))
vi.mock('@/lib/crypto/lock', () => ({ endLockSession: async () => {}, endAllLockSessions: async () => {}, getLockInfo: async () => ({ id: 'legacy', openCheck: 'pin', autoLockMinutes: 5, pin: true, passkey: false }) }))

import { mergePersistedAppState, useAppStore, useActiveNetwork, useActiveNode } from '../app-store'

const base = { label: 'W', address: 'rA', createdAt: 1, algorithm: 'ed25519', openCheck: 'pin', signingCheck: 'standard' }
const current: Parameters<typeof mergePersistedAppState>[1] = { network: 'testnet', wallets: [], activeWalletId: null, addressBook: [], autoLockMinutes: 5, declinedUpdateVersions: [] }

describe('legacy persisted state is normalised on merge', () => {
  it('a Wallet meta without node keeps built-in Nodes; devnet is accepted; unknown network falls back to the persisted one', () => {
    const merged = mergePersistedAppState(
      {
        network: 'mainnet',
        wallets: [
          { ...base, id: 'a', seedId: 'a', network: 'devnet' },
          { ...base, id: 'b' },
          { ...base, id: 'c', network: 'signet' },
          { ...base, id: 'd', network: 'testnet', node: 'wss://n.example.com' },
          { ...base, id: 'e', network: 'testnet', node: 'ws://insecure.example.com' },
          { ...base, id: 'f', network: 'testnet', node: 'wss://u:p@n.example.com' },
          { ...base, id: 'g', network: 'testnet', node: 'WSS://N.Example.com/' },
        ],
      },
      current,
    )
    expect(merged.wallets.map((w) => [w.id, w.network, w.node])).toEqual([
      ['a', 'devnet', undefined],
      ['b', 'mainnet', undefined],
      ['c', 'mainnet', undefined],
      ['d', 'testnet', 'wss://n.example.com'],
      // A non-wss node on a persisted record is never contacted.
      ['e', 'testnet', undefined],
      ['f', 'testnet', undefined],
      ['g', 'testnet', 'wss://n.example.com'],
    ])
  })
})

describe('the active network is derived from the active Wallet', () => {
  const wallets = [
    { ...base, id: 'm', seedId: 's', network: 'mainnet' },
    { ...base, id: 't', seedId: 's2', network: 'testnet', node: 'wss://n.example.com' },
  ] as never

  it('follows the active Wallet, with its Node', () => {
    useAppStore.setState({ wallets, activeWalletId: 'm', network: 'testnet' })
    const a = renderHook(() => [useActiveNetwork(), useActiveNode()] as const)
    expect(a.result.current).toEqual(['mainnet', undefined])
    useAppStore.setState({ activeWalletId: 't' })
    a.rerender()
    expect(a.result.current).toEqual(['testnet', 'wss://n.example.com'])
  })

  it('persists the active Wallet\'s network as the rollback mirror', () => {
    useAppStore.setState({ wallets, activeWalletId: 'm', network: 'testnet' })
    const partialize = useAppStore.persist.getOptions().partialize!
    expect(partialize(useAppStore.getState())).toMatchObject({ network: 'mainnet' })
  })

  it('has no setNetwork: the app-wide switch is gone', () => {
    expect('setNetwork' in useAppStore.getState()).toBe(false)
  })
})
