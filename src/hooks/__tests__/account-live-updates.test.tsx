/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

/** Named, so a test can see what a stream event discards and for whom. */
const invalidateQueries = vi.fn()
let handler: ((event: unknown) => void) | null = null
const fakeClient = {
  on: vi.fn((_: string, h: (event: unknown) => void) => {
    handler = h
  }),
  off: vi.fn(),
  isConnected: () => true,
  request: vi.fn().mockResolvedValue({}),
}

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }))
const getXrplClient = vi.fn((..._args: unknown[]) => Promise.resolve(fakeClient))
vi.mock('@/lib/xrpl/client', () => ({ getXrplClient: (...a: unknown[]) => getXrplClient(...a) }))

import { useAccountLiveUpdates } from '../useAccountLiveUpdates'
import { queryKeys } from '@/lib/xrpl/query-keys'

const ADDRESS = 'rBoGUS9uiK9m3Kk6qnGRvWWCwAeN8hF3wR'

async function mountAndSubscribe() {
  renderHook(() => useAccountLiveUpdates('testnet', ADDRESS))
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
  expect(handler, 'the hook never subscribed to the transaction stream').not.toBeNull()
}

beforeEach(() => {
  handler = null
  invalidateQueries.mockClear()
  getXrplClient.mockClear()
  getXrplClient.mockImplementation(() => Promise.resolve(fakeClient))
})
afterEach(cleanup)

describe('useAccountLiveUpdates — a stream event discards the whole account group', () => {
  it('invalidates every account-scoped entry for the address on a transaction it sent', async () => {
    await mountAndSubscribe()
    act(() => handler!({ tx_json: { Account: ADDRESS, Destination: 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh' } }))

    for (const key of [
      queryKeys.accountState('testnet', ADDRESS),
      queryKeys.accountTx('testnet', ADDRESS),
      queryKeys.trustLines('testnet', ADDRESS),
      queryKeys.incomingPaymentWatch('testnet', ADDRESS),
    ]) {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: key })
    }
  })

  it('invalidates nothing on a transaction that does not touch the address', async () => {
    await mountAndSubscribe()
    act(() => handler!({ tx_json: { Account: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' }, meta: { AffectedNodes: [] } }))

    expect(invalidateQueries).not.toHaveBeenCalled()
  })
})

describe('useAccountLiveUpdates — the Wallet\'s Node', () => {
  const NODE = 'wss://node.example.com'
  const tick = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))

  it('asks the pool for (network, node) and re-subscribes when the node changes', async () => {
    const { rerender } = renderHook(({ node }: { node?: string }) => useAccountLiveUpdates('testnet', ADDRESS, node), {
      initialProps: { node: NODE } as { node?: string },
    })
    await tick()
    expect(getXrplClient).toHaveBeenLastCalledWith('testnet', NODE)

    rerender({ node: undefined })
    await tick()
    expect(getXrplClient).toHaveBeenLastCalledWith('testnet', undefined)
    expect(getXrplClient).toHaveBeenCalledTimes(2)
    expect(fakeClient.off).toHaveBeenCalled()
  })

  it('a rejected client (a Node that failed its check) causes no unhandled rejection', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    getXrplClient.mockImplementation(() => Promise.reject(new Error('wrong network')))
    renderHook(() => useAccountLiveUpdates('mainnet', ADDRESS, NODE))
    await tick()
    await new Promise((r) => setTimeout(r, 10))
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
    expect(handler).toBeNull()
  })
})
