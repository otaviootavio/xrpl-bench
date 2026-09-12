import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { queryKeys } from '../query-keys'

// The matrix row this covers: the account-scoped entries are invalidated using
// factory-built keys. The set asserted below is the one `useAccountLiveUpdates`
// invalidates; `SendTab` invalidates three of them and leaves
// `incomingPaymentWatch` alone.
//
// The defect guarded against is not "invalidation was forgotten" but "the
// invalidation key was retyped and no longer matches the read key", which
// leaves the stale entry in place and the previous value on screen.

const NETWORK = 'testnet' as const
const ADDRESS = 'rSender'

function seededClient() {
  const client = new QueryClient()
  client.setQueryData(queryKeys.accountState(NETWORK, ADDRESS), { balanceDrops: '1000000' })
  client.setQueryData(queryKeys.accountTx(NETWORK, ADDRESS), { items: [] })
  client.setQueryData(queryKeys.trustLines(NETWORK, ADDRESS), [])
  client.setQueryData(queryKeys.incomingPaymentWatch(NETWORK, ADDRESS), { items: [] })
  return client
}

/**
 * Reads whether a cache entry is invalidated, asserting the entry exists first.
 *
 * Without that assertion every negative case here passes vacuously: `find()`
 * returns `undefined` for a key that was never seeded, so an optional-chained
 * probe yields `undefined` and a `.toBe(false)` against it would hold even if
 * the factory renamed the key out from under the test.
 */
function isInvalidated(client: QueryClient, key: readonly unknown[]): boolean {
  const entry = client.getQueryCache().find({ queryKey: key })
  expect(entry, `no cache entry under ${JSON.stringify(key)}`).toBeDefined()
  return entry!.state.isInvalidated
}

describe('invalidating with factory-built keys', () => {
  it('matches the entries the factory seeded', () => {
    const client = seededClient()
    for (const key of [
      queryKeys.accountState(NETWORK, ADDRESS),
      queryKeys.accountTx(NETWORK, ADDRESS),
      queryKeys.trustLines(NETWORK, ADDRESS),
      queryKeys.incomingPaymentWatch(NETWORK, ADDRESS),
    ]) {
      expect(isInvalidated(client, key)).toBe(false)
      client.invalidateQueries({ queryKey: key })
      expect(isInvalidated(client, key)).toBe(true)
    }
  })

  it('does not match when the key is retyped with a different name', () => {
    // The exact failure the factory exists to prevent: a plausible-looking
    // literal at an invalidation site that never matches the read entry.
    const client = seededClient()
    // check-query-keys-allow
    client.invalidateQueries({ queryKey: ['accountstate', NETWORK, ADDRESS] })
    expect(isInvalidated(client, queryKeys.accountState(NETWORK, ADDRESS))).toBe(false)
  })

  it('does not invalidate another wallet on the same network', () => {
    const client = seededClient()
    client.setQueryData(queryKeys.accountState(NETWORK, 'rOther'), { balanceDrops: '2000000' })
    client.invalidateQueries({ queryKey: queryKeys.accountState(NETWORK, ADDRESS) })
    expect(isInvalidated(client, queryKeys.accountState(NETWORK, 'rOther'))).toBe(false)
  })

  it('leaves the network-scoped reserve entry alone', () => {
    // A wallet switch must not discard ledger-wide settings.
    const client = seededClient()
    client.setQueryData(queryKeys.serverReserves(NETWORK), { baseReserveDrops: '1000000' })
    client.invalidateQueries({ queryKey: queryKeys.accountState(NETWORK, ADDRESS) })
    expect(isInvalidated(client, queryKeys.serverReserves(NETWORK))).toBe(false)
  })
})
