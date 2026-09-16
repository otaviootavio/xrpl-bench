/** @vitest-environment jsdom */
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/xrpl/query-keys'
import {
  DESTINATION_CHECK_FRESHNESS_MS,
  fetchAccountStateOnce,
  fetchDestinationInfoOnce,
} from '@/lib/xrpl/query-reads'
import { fetchAccountState, fetchAccountLines } from '@/lib/xrpl/reads'
import { useAccountState } from '@/hooks/useAccountState'
import { useAccountTxHistory } from '@/hooks/useAccountTxHistory'
import { useTrustLines } from '@/hooks/useTrustLines'
import { useIncomingPaymentNotifications } from '@/hooks/useIncomingPaymentNotifications'
import { useDestinationInfo } from '@/hooks/useDestinationInfo'
import { useServerReserves } from '@/hooks/useServerReserves'
import { useRecommendedFee } from '@/hooks/useRecommendedFee'

/**
 * Each account-scoped hook must land on ITS OWN factory key.
 *
 * Without these, swapping `queryKeys.trustLines` for `queryKeys.accountTx`
 * inside `useTrustLines` left lint, build and every test green: the four
 * builders share one signature, so the typecheck cannot tell them apart, and
 * nothing else imported a hook. The mistake would only have shown up as a
 * balance that never refreshed. These assert the key the cache actually ends
 * up holding, which is the only place that swap becomes visible.
 *
 * `@/lib/xrpl/reads` is mocked because this suite is testing which key a hook
 * registers, not what the ledger returns; `@/lib/notify` because the incoming-
 * payment hook toasts, and a toast is not what is under test.
 */
vi.mock('@/lib/xrpl/reads', () => ({
  fetchAccountState: vi.fn(async () => ({ exists: true, requireDestTag: false })),
  fetchAccountTx: vi.fn(async () => ({ items: [], marker: undefined })),
  fetchAccountLines: vi.fn(async () => []),
  fetchServerReserves: vi.fn(async () => ({ baseReserveDrops: '1000000', ownerReserveDrops: '200000' })),
  fetchRecommendedFeeDrops: vi.fn(async () => '12'),
}))

vi.mock('@/lib/notify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const NETWORK = 'testnet' as const
const ADDRESS = 'rWiring'
/** `useDestinationInfo` runs the real `isValidClassicAddress` before it is
 * enabled, so this one has to survive a checksum. */
const DESTINATION = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

/** The keys the cache is holding, as comparable strings. */
function cachedKeys(client: QueryClient) {
  return client
    .getQueryCache()
    .getAll()
    .map((q) => JSON.stringify(q.queryKey))
}

async function expectLandsOn(
  hook: () => unknown,
  expected: readonly unknown[],
) {
  const { client, wrapper } = harness()
  renderHook(hook, { wrapper })
  await waitFor(() => expect(cachedKeys(client).length).toBeGreaterThan(0))
  // Exactly one entry, and it is this hook's own key — an equality check, so a
  // hook that built a sibling's key fails rather than merely adding an entry.
  expect(cachedKeys(client)).toEqual([JSON.stringify(expected)])
}

describe('each account-scoped hook lands on its own factory key', () => {
  it('useAccountState', async () => {
    await expectLandsOn(
      () => useAccountState(NETWORK, ADDRESS),
      queryKeys.accountState(NETWORK, ADDRESS),
    )
  })

  it('useAccountTxHistory', async () => {
    await expectLandsOn(
      () => useAccountTxHistory(NETWORK, ADDRESS),
      queryKeys.accountTx(NETWORK, ADDRESS),
    )
  })

  it('useTrustLines', async () => {
    await expectLandsOn(
      () => useTrustLines(NETWORK, ADDRESS),
      queryKeys.trustLines(NETWORK, ADDRESS),
    )
  })

  it('useIncomingPaymentNotifications', async () => {
    await expectLandsOn(
      () => useIncomingPaymentNotifications(NETWORK, ADDRESS),
      queryKeys.incomingPaymentWatch(NETWORK, ADDRESS),
    )
  })
})

describe('the pre-flight probe and the Balances screen share one entry', () => {
  it('fetchAccountStateOnce reuses the entry useAccountState created', async () => {
    // The reason lib/xrpl/query-reads.ts exists: the disabled-master-key probe
    // and the screen must never disagree about the same account. Routing both
    // through one factory function is what makes that guaranteed rather than
    // commented — and this is the assertion that would fail if either side
    // stopped calling it.
    const { client, wrapper } = harness()
    renderHook(() => useAccountState(NETWORK, ADDRESS), { wrapper })
    await waitFor(() => expect(cachedKeys(client).length).toBe(1))

    await fetchAccountStateOnce(client, NETWORK, ADDRESS)

    expect(cachedKeys(client)).toEqual([JSON.stringify(queryKeys.accountState(NETWORK, ADDRESS))])
  })
})

/**
 * The destination check is the one read that authorises a payment, and the
 * three ways it can be broken are all invisible to the four gates: a wider
 * `staleTime` lets a minutes-old answer authorise a send, a dropped field in
 * the payload's `(network, destination, asset)` stamp blocks every send
 * forever, and a swap to a sibling factory function collides with another
 * read's cache entry. Each is one edit away and none is a type error.
 */
describe('the destination check', () => {
  it('useDestinationInfo lands on the destination-scoped key', async () => {
    await expectLandsOn(
      () => useDestinationInfo(NETWORK, DESTINATION, 'XRP'),
      queryKeys.destinationInfo(NETWORK, DESTINATION, 'XRP'),
    )
  })

  it('fetchDestinationInfoOnce reuses the entry the form already watches', async () => {
    // The probe that authorises the payment and the check the operator was
    // shown must be the same entry, or the form can say one thing while the
    // submit path acts on another.
    const { client, wrapper } = harness()
    renderHook(() => useDestinationInfo(NETWORK, DESTINATION, 'XRP'), { wrapper })
    await waitFor(() => expect(cachedKeys(client).length).toBe(1))

    await fetchDestinationInfoOnce(client, NETWORK, DESTINATION, 'XRP')

    expect(cachedKeys(client)).toEqual([JSON.stringify(queryKeys.destinationInfo(NETWORK, DESTINATION, 'XRP'))])
  })

  it('stamps the answer with the triple it was asked for', async () => {
    // Without the stamp the form cannot tell whether an answer it is holding is
    // about the address in the field, and the guard closes on every send.
    const { client } = harness()

    // An issued asset, not XRP: a stamp that hardcodes the common case reads
    // as correct against an XRP send and mislabels every token one.
    const info = await fetchDestinationInfoOnce(client, NETWORK, DESTINATION, 'USD|rIssuer')

    expect(info).toMatchObject({ network: NETWORK, destination: DESTINATION, asset: 'USD|rIssuer' })
  })

  it('carries the trust-line answer and the tag flag out of the payload', async () => {
    // The stamp test above inspects only the triple, so the two fields the send
    // guard and the token warning actually consult were unverified: inverting
    // the `.some()` or hardcoding `requireDestTag: false` left every test green
    // while the form stopped warning about an unreachable token destination.
    const { client } = harness()

    vi.mocked(fetchAccountLines).mockResolvedValueOnce([])
    const noLine = await fetchDestinationInfoOnce(client, NETWORK, DESTINATION, 'USD|rIssuer')
    expect(noLine.hasTrustLine).toBe(false)

    client.clear()
    vi.mocked(fetchAccountLines).mockResolvedValueOnce([
      { currency: 'USD', account: 'rIssuer', balance: '0', freeze: false, freezePeer: false } as never,
    ])
    const withLine = await fetchDestinationInfoOnce(client, NETWORK, DESTINATION, 'USD|rIssuer')
    expect(withLine.hasTrustLine).toBe(true)

    client.clear()
    vi.mocked(fetchAccountState).mockResolvedValueOnce({ exists: true, requireDestTag: true } as never)
    const tagged = await fetchDestinationInfoOnce(client, NETWORK, DESTINATION, 'XRP')
    expect(tagged.requireDestTag).toBe(true)
    // XRP sends involve no trust line, so the field stays absent rather than false.
    expect(tagged.hasTrustLine).toBeUndefined()
  })

  it('re-reads an entry older than the freshness window, and reuses a younger one', async () => {
    const reads = vi.mocked(fetchAccountState)
    reads.mockClear()
    vi.useFakeTimers()
    const started = Date.now()
    try {
      const { client } = harness()
      await fetchDestinationInfoOnce(client, NETWORK, DESTINATION, 'XRP')
      expect(reads).toHaveBeenCalledTimes(1)

      vi.setSystemTime(started + DESTINATION_CHECK_FRESHNESS_MS - 1_000)
      await fetchDestinationInfoOnce(client, NETWORK, DESTINATION, 'XRP')
      expect(reads).toHaveBeenCalledTimes(1)

      vi.setSystemTime(started + DESTINATION_CHECK_FRESHNESS_MS + 1_000)
      await fetchDestinationInfoOnce(client, NETWORK, DESTINATION, 'XRP')
      expect(reads).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

/**
 * The reserve read is a NAMED network-scoped exception on the factory, not an
 * account-scoped key — so it gets its own describe rather than joining the
 * group above. Two ways it breaks, neither of them a type error: an address
 * element creeping in (a ledger-wide answer would then be thrown away on every
 * wallet switch, and re-read per wallet), or the hook reaching for a sibling
 * builder and colliding with another read's entry. The equivalent absence for
 * the destination read cost story 5.1 a whole patch round.
 */
describe('the reserve read is network-scoped, by name', () => {
  it('useServerReserves lands on the network-scoped key, with no address in it', async () => {
    const { client, wrapper } = harness()
    renderHook(() => useServerReserves(NETWORK), { wrapper })
    await waitFor(() => expect(cachedKeys(client).length).toBeGreaterThan(0))

    // The literal spelled out, not just the factory call: an address element
    // appended to the builder would keep both sides of an equality against
    // `queryKeys.serverReserves` in step and change nothing here.
    expect(cachedKeys(client)).toEqual([JSON.stringify(['serverReserves', NETWORK])])
  })
})

/**
 * The fee is the second named network-scoped exception, and it is the figure an
 * XRP send is checked against — so a key that quietly took the active address
 * would throw the answer away on every wallet switch, and a key that collided
 * with a sibling read would let another read's payload arrive as a fee. Neither
 * is a type error: all these builders share one signature.
 */
describe('the fee read is network-scoped, by name', () => {
  it('useRecommendedFee lands on the network-scoped key, with no address in it', async () => {
    const { client, wrapper } = harness()
    renderHook(() => useRecommendedFee(NETWORK), { wrapper })
    await waitFor(() => expect(cachedKeys(client).length).toBeGreaterThan(0))

    // The literal, not the factory call: an address element appended to the
    // builder would keep both sides of an equality in step and change nothing.
    expect(cachedKeys(client)).toEqual([JSON.stringify(['fee', NETWORK])])
  })
})
