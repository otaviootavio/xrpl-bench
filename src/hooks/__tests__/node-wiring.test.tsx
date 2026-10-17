/** @vitest-environment jsdom */
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/xrpl/query-keys'
import {
  fetchAccountState,
  fetchAccountTx,
  fetchAccountLines,
  fetchServerReserves,
  fetchRecommendedFeeDrops,
} from '@/lib/xrpl/reads'
import { useAccountState } from '@/hooks/useAccountState'
import { useAccountTxHistory } from '@/hooks/useAccountTxHistory'
import { useTrustLines } from '@/hooks/useTrustLines'
import { useServerReserves } from '@/hooks/useServerReserves'
import { useRecommendedFee } from '@/hooks/useRecommendedFee'
import { useIncomingPaymentNotifications } from '@/hooks/useIncomingPaymentNotifications'

/**
 * Story 2: every read takes the Wallet's Node as a trailing argument, and the
 * Node is NOT part of any query key (AD-19) — two Nodes of one network serve
 * one ledger.
 */
vi.mock('@/lib/xrpl/reads', () => ({
  fetchAccountState: vi.fn(async () => ({ exists: true, requireDestTag: false })),
  fetchAccountTx: vi.fn(async () => ({ items: [], marker: undefined })),
  fetchAccountLines: vi.fn(async () => []),
  fetchServerReserves: vi.fn(async () => ({ baseReserveDrops: '1000000', ownerReserveDrops: '200000' })),
  fetchRecommendedFeeDrops: vi.fn(async () => '12'),
}))
vi.mock('@/lib/notify', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const NODE = 'wss://node.example.com'

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

describe('the Node reaches the fetcher and never the key', () => {
  it('account-scoped reads pass the node and keep (name, network, address) keys', async () => {
    const { client, wrapper } = harness()
    renderHook(() => useAccountState('testnet', 'rA', NODE), { wrapper })
    renderHook(() => useTrustLines('testnet', 'rA', NODE), { wrapper })
    renderHook(() => useAccountTxHistory('testnet', 'rA', NODE), { wrapper })
    renderHook(() => useIncomingPaymentNotifications('testnet', 'rA', NODE), { wrapper })
    await waitFor(() => expect(fetchAccountTx).toHaveBeenCalledTimes(2))

    expect(fetchAccountState).toHaveBeenCalledWith('testnet', 'rA', NODE)
    expect(fetchAccountLines).toHaveBeenCalledWith('testnet', 'rA', NODE)
    expect(fetchAccountTx).toHaveBeenCalledWith('testnet', 'rA', undefined, NODE)

    const keys = client.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey)).sort()
    expect(keys).toEqual(
      [
        queryKeys.accountState('testnet', 'rA'),
        queryKeys.trustLines('testnet', 'rA'),
        queryKeys.accountTx('testnet', 'rA'),
        queryKeys.incomingPaymentWatch('testnet', 'rA'),
      ]
        .map((k) => JSON.stringify(k))
        .sort(),
    )
    expect(keys.join()).not.toContain(NODE)
  })

  it('ledger-wide reads pass the node and keep their network-only keys', async () => {
    const { client, wrapper } = harness()
    renderHook(() => useServerReserves('mainnet', NODE), { wrapper })
    renderHook(() => useRecommendedFee('mainnet', NODE), { wrapper })
    await waitFor(() => expect(fetchRecommendedFeeDrops).toHaveBeenCalled())
    expect(fetchServerReserves).toHaveBeenCalledWith('mainnet', NODE)
    expect(fetchRecommendedFeeDrops).toHaveBeenCalledWith('mainnet', NODE)
    const keys = client.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey)).sort()
    expect(keys).toEqual([queryKeys.recommendedFee('mainnet'), queryKeys.serverReserves('mainnet')].map((k) => JSON.stringify(k)).sort())
  })

  it('with no Wallet (no address) no read is issued at all', async () => {
    vi.mocked(fetchAccountState).mockClear()
    const { wrapper } = harness()
    renderHook(() => useAccountState('testnet', null, NODE), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(fetchAccountState).not.toHaveBeenCalled()
  })
})
