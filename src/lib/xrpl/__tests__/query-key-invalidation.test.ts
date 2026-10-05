import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { invalidateAccountScoped, invalidateDestinationCheck, queryKeys } from '../query-keys'

// The matrix row this covers: the account-scoped entries are invalidated using
// factory-built keys. Every site that discards account data — the live
// subscription, a send, a trust-line change and the faucet — calls
// `invalidateAccountScoped()`, so each discards the same whole group: the four
// entries seeded below. Before that function, each site invalidated its own
// hand-picked subset and a missing member was only visible by comparing sites.
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

/** Every builder in the factory whose key has the account-scoped shape
 * `[name, network, address]` — found from the public factory rather than from a
 * second list, so a fifth account-scoped builder is covered here unedited. */
function accountScopedBuilders() {
  return Object.entries(queryKeys).filter(([, build]) => {
    if (build.length !== 2) return false
    const key = (build as (n: typeof NETWORK, a: string) => readonly unknown[])(NETWORK, 'rProbe')
    return key.length === 3 && key[1] === NETWORK && key[2] === 'rProbe'
  }) as [string, (n: typeof NETWORK, a: string | null) => readonly unknown[]][]
}

describe('invalidateAccountScoped', () => {
  it('invalidates all four account-scoped entries for the address', async () => {
    const client = seededClient()
    await invalidateAccountScoped(client, NETWORK, ADDRESS)
    expect(isInvalidated(client, queryKeys.accountState(NETWORK, ADDRESS))).toBe(true)
    expect(isInvalidated(client, queryKeys.accountTx(NETWORK, ADDRESS))).toBe(true)
    expect(isInvalidated(client, queryKeys.trustLines(NETWORK, ADDRESS))).toBe(true)
    expect(isInvalidated(client, queryKeys.incomingPaymentWatch(NETWORK, ADDRESS))).toBe(true)
  })

  it('invalidates every account-scoped builder the factory has, not a fixed four', async () => {
    const client = new QueryClient()
    const builders = accountScopedBuilders()
    // At least the four known members; a fifth builder joins without an edit.
    expect(builders.map(([name]) => name)).toEqual(
      expect.arrayContaining(['accountState', 'accountTx', 'incomingPaymentWatch', 'trustLines']),
    )
    for (const [, build] of builders) client.setQueryData(build(NETWORK, ADDRESS), {})
    await invalidateAccountScoped(client, NETWORK, ADDRESS)
    for (const [, build] of builders) expect(isInvalidated(client, build(NETWORK, ADDRESS))).toBe(true)
  })

  it('leaves another wallet, another network and every non-account key untouched', async () => {
    const client = seededClient()
    const untouched = [
      queryKeys.accountState(NETWORK, 'rOther'),
      queryKeys.accountTx(NETWORK, 'rOther'),
      queryKeys.trustLines(NETWORK, 'rOther'),
      queryKeys.incomingPaymentWatch(NETWORK, 'rOther'),
      queryKeys.accountState('mainnet', ADDRESS),
      queryKeys.accountTx('mainnet', ADDRESS),
      queryKeys.trustLines('mainnet', ADDRESS),
      queryKeys.incomingPaymentWatch('mainnet', ADDRESS),
      queryKeys.serverReserves(NETWORK),
      queryKeys.recommendedFee(NETWORK),
      queryKeys.destinationInfo(NETWORK, 'rDestination', 'XRP'),
      queryKeys.passkeyRegistered(),
      queryKeys.lockoutState(),
    ]
    for (const key of untouched) client.setQueryData(key, {})
    await invalidateAccountScoped(client, NETWORK, ADDRESS)
    for (const key of untouched) expect(isInvalidated(client, key), JSON.stringify(key)).toBe(false)
  })

  it('resolves only after every member has resolved', async () => {
    const pending: { key: readonly unknown[]; resolve: () => void }[] = []
    const client = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) =>
        new Promise<void>((resolve) => pending.push({ key: queryKey, resolve })),
    }
    let settled = false
    const done = invalidateAccountScoped(client as never, NETWORK, ADDRESS).then(() => {
      settled = true
    })

    expect(pending.map((p) => p.key)).toEqual(
      expect.arrayContaining(accountScopedBuilders().map(([, build]) => build(NETWORK, ADDRESS))),
    )
    expect(pending).toHaveLength(accountScopedBuilders().length)
    for (const p of pending.slice(0, -1)) {
      p.resolve()
      // A macrotask, so every queued microtask has run before the check.
      await new Promise((r) => setTimeout(r, 0))
      expect(settled).toBe(false)
    }
    pending[pending.length - 1].resolve()
    await done
    expect(settled).toBe(true)
  })
})

describe('invalidateDestinationCheck', () => {
  const DESTINATION = 'rDestination'
  const TOKEN = 'USD|rIssuer'

  it("marks every asset's check for that one destination stale", async () => {
    const client = new QueryClient()
    const mine = [
      queryKeys.destinationInfo(NETWORK, DESTINATION, 'XRP'),
      queryKeys.destinationInfo(NETWORK, DESTINATION, TOKEN),
    ]
    for (const key of mine) client.setQueryData(key, {})
    await invalidateDestinationCheck(client, NETWORK, DESTINATION)
    // Built by the factory's own builder: if the helper's prefix drifts from
    // `queryKeys.destinationInfo`, these stop matching and this fails.
    for (const key of mine) expect(isInvalidated(client, key), JSON.stringify(key)).toBe(true)
  })

  it("leaves another destination, another network, and the sender's own entries untouched", async () => {
    const client = seededClient()
    const untouched = [
      queryKeys.destinationInfo(NETWORK, 'rSomeoneElse', 'XRP'),
      queryKeys.destinationInfo('mainnet', DESTINATION, 'XRP'),
      queryKeys.accountState(NETWORK, ADDRESS),
      queryKeys.accountTx(NETWORK, ADDRESS),
      queryKeys.trustLines(NETWORK, ADDRESS),
      queryKeys.incomingPaymentWatch(NETWORK, ADDRESS),
      queryKeys.serverReserves(NETWORK),
      queryKeys.recommendedFee(NETWORK),
    ]
    for (const key of untouched) client.setQueryData(key, {})
    client.setQueryData(queryKeys.destinationInfo(NETWORK, DESTINATION, 'XRP'), {})
    await invalidateDestinationCheck(client, NETWORK, DESTINATION)
    expect(isInvalidated(client, queryKeys.destinationInfo(NETWORK, DESTINATION, 'XRP'))).toBe(true)
    for (const key of untouched) expect(isInvalidated(client, key), JSON.stringify(key)).toBe(false)
  })
})
