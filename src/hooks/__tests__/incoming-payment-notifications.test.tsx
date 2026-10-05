/** @vitest-environment jsdom */
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TxSummary } from '@/lib/xrpl/reads'

const fetchAccountTx = vi.fn()
vi.mock('@/lib/xrpl/reads', () => ({
  fetchAccountTx: (...args: unknown[]) => fetchAccountTx(...args),
}))

const success = vi.fn()
vi.mock('@/lib/notify', () => ({ toast: { success: (...a: unknown[]) => success(...a), error: vi.fn(), warning: vi.fn() } }))

import { useIncomingPaymentNotifications } from '@/hooks/useIncomingPaymentNotifications'

const ADDRESS = 'rReceiver'

function incoming(hash: string, resultCode: string, extra: Partial<TxSummary> = {}): TxSummary {
  return {
    hash,
    type: 'Payment',
    direction: 'received',
    counterparty: 'rSender',
    amountDrops: '1000000',
    validated: true,
    resultCode,
    ...extra,
  }
}

function harness() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

beforeEach(() => {
  fetchAccountTx.mockReset()
  success.mockReset()
})

/** Loads a first page (seeded silently), then a second page with `next`. */
async function afterSecondPoll(next: TxSummary[]) {
  const seed = incoming('SEED', 'tesSUCCESS')
  fetchAccountTx.mockResolvedValueOnce({ items: [seed] }).mockResolvedValueOnce({ items: [...next, seed] })
  const { client, wrapper } = harness()
  renderHook(() => useIncomingPaymentNotifications('testnet', ADDRESS), { wrapper })
  // The first page must land (and be seeded) before the refetch, or the
  // refetch would cancel it and itself become the silent first load.
  await waitFor(() => expect(client.getQueryCache().getAll()[0]?.state.data).toBeDefined())
  await new Promise((r) => setTimeout(r, 0))
  await client.invalidateQueries()
  await waitFor(() => expect(fetchAccountTx).toHaveBeenCalledTimes(2))
  // Let the effect that diffs the new page run.
  await new Promise((r) => setTimeout(r, 0))
}

describe('useIncomingPaymentNotifications', () => {
  it('announces a new successful incoming payment', async () => {
    await afterSecondPoll([incoming('NEW', 'tesSUCCESS')])
    await waitFor(() => expect(success).toHaveBeenCalledOnce())
    expect(success.mock.calls[0][0]).toBe('Received 1 XRP')
  })

  it('keeps the "up to" prefix for an upper-bound figure', async () => {
    await afterSecondPoll([incoming('NEW', 'tesSUCCESS', { amountIsUpperBound: true })])
    await waitFor(() => expect(success).toHaveBeenCalledOnce())
    expect(success.mock.calls[0][0]).toBe('Received up to 1 XRP')
  })

  it('does not announce a failed incoming payment as received', async () => {
    // A successful payment in the same poll proves the diff ran, so the
    // missing toast for the failed one is not a vacuous pass.
    await afterSecondPoll([
      incoming('FAILED', 'tecPATH_DRY', { amountIsUpperBound: true, amountDrops: '9000000' }),
      incoming('OK', 'tesSUCCESS'),
    ])
    await waitFor(() => expect(success).toHaveBeenCalledOnce())
    expect(success.mock.calls[0][0]).toBe('Received 1 XRP')
  })
})
