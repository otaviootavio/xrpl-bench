import { describe, expect, it } from 'vitest'
import { queryKeys } from '../query-keys'

// These assertions are the proof that the factory refactor changed no cache
// identity: every expected value below is the exact literal that used to be
// written by hand at the call site. If one of these ever needs updating, the
// cache entry it names is being renamed — which is a behaviour change, not a
// refactor.

describe('account-scoped keys', () => {
  it('carries network and address, in that order, after the name', () => {
    expect(queryKeys.accountState('testnet', 'rAbc')).toEqual(['accountState', 'testnet', 'rAbc'])
    expect(queryKeys.accountTx('testnet', 'rAbc')).toEqual(['accountTx', 'testnet', 'rAbc'])
    expect(queryKeys.trustLines('testnet', 'rAbc')).toEqual(['trustLines', 'testnet', 'rAbc'])
    expect(queryKeys.incomingPaymentWatch('testnet', 'rAbc')).toEqual([
      'incomingPaymentWatch',
      'testnet',
      'rAbc',
    ])
  })

  it('separates the two networks', () => {
    expect(queryKeys.accountState('mainnet', 'rAbc')).toEqual(['accountState', 'mainnet', 'rAbc'])
    expect(queryKeys.accountState('mainnet', 'rAbc')).not.toEqual(
      queryKeys.accountState('testnet', 'rAbc'),
    )
  })

  it('separates two wallets on the same network', () => {
    expect(queryKeys.accountState('testnet', 'rOne')).not.toEqual(
      queryKeys.accountState('testnet', 'rTwo'),
    )
  })

  it('still builds with a null address — the hook’s own `enabled` gates the run', () => {
    expect(queryKeys.accountState('testnet', null)).toEqual(['accountState', 'testnet', null])
    expect(queryKeys.accountTx('testnet', null)).toEqual(['accountTx', 'testnet', null])
    expect(queryKeys.trustLines('testnet', null)).toEqual(['trustLines', 'testnet', null])
    expect(queryKeys.incomingPaymentWatch('testnet', null)).toEqual([
      'incomingPaymentWatch',
      'testnet',
      null,
    ])
  })

  it('pins the accountState literal itself, which is the cache entry\u2019s identity', () => {
    // Renaming this literal renames a cache entry — a behaviour change, not a
    // refactor. That hooks/useAccountState.ts and lib/xrpl/query-reads.ts land
    // on ONE entry is a property of the call sites, not of this function, so it
    // is asserted where the call sites are: see the shared-entry test in
    // src/hooks/__tests__/query-key-wiring.test.tsx.
    expect(queryKeys.accountState('testnet', 'rAbc')).toEqual(['accountState', 'testnet', 'rAbc'])
  })
})

describe('destination-scoped key', () => {
  it('is keyed on the destination and the selected asset, not the active wallet', () => {
    expect(queryKeys.destinationInfo('testnet', 'rDest', 'XRP')).toEqual([
      'destinationInfo',
      'testnet',
      'rDest',
      'XRP',
    ])
    expect(queryKeys.destinationInfo('mainnet', 'rDest', 'USD|rIssuer')).toEqual([
      'destinationInfo',
      'mainnet',
      'rDest',
      'USD|rIssuer',
    ])
  })

  it('does not collide with the account-scoped key for the same address', () => {
    expect(queryKeys.destinationInfo('testnet', 'rAbc', 'XRP')).not.toEqual(
      queryKeys.accountState('testnet', 'rAbc'),
    )
  })
})

describe('network-scoped keys', () => {
  it('carries no address element', () => {
    expect(queryKeys.serverReserves('mainnet')).toEqual(['serverReserves', 'mainnet'])
    expect(queryKeys.recommendedFee('mainnet')).toEqual(['fee', 'mainnet'])
  })

  it('keeps the fee key named `fee`, not after its factory function', () => {
    expect(queryKeys.recommendedFee('testnet')[0]).toBe('fee')
  })
})

describe('device-scoped keys', () => {
  it('carries neither network nor address, so no switch can affect it', () => {
    expect(queryKeys.passkeyRegistered()).toEqual(['passkeyRegistered'])
    expect(queryKeys.lockoutState()).toEqual(['lockoutState'])
  })
})
