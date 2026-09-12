/** @vitest-environment jsdom */
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/xrpl/query-keys'
import { fetchAccountStateOnce } from '@/lib/xrpl/query-reads'
import { useAccountState } from '@/hooks/useAccountState'
import { useAccountTxHistory } from '@/hooks/useAccountTxHistory'
import { useTrustLines } from '@/hooks/useTrustLines'
import { useIncomingPaymentNotifications } from '@/hooks/useIncomingPaymentNotifications'

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
}))

vi.mock('@/lib/notify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const NETWORK = 'testnet' as const
const ADDRESS = 'rWiring'

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
