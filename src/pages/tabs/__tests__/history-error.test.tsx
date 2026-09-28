/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const useAccountTxHistory = vi.fn()

vi.mock('@/hooks/useAccountTxHistory', () => ({
  useAccountTxHistory: (...args: unknown[]) => useAccountTxHistory(...args),
}))

// The tab reads the active network and wallet from the store; neither is what
// this test is about, and standing up the real store would drag IndexedDB in.
vi.mock('@/store/app-store', () => ({
  useAppStore: (selector: (s: { network: string }) => unknown) => selector({ network: 'testnet' }),
  useActiveWallet: () => ({ id: 'w1', address: 'rBoGUS9uiK9m3Kk6qnGRvWWCwAeN8hF3wR', label: 'Test' }),
}))

import { HistoryTab } from '../HistoryTab'

const EMPTY_COPY = 'No transactions yet'

function query(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn().mockResolvedValue({}),
    fetchNextPage: vi.fn().mockResolvedValue({}),
    hasNextPage: false,
    isFetchingNextPage: false,
    ...overrides,
  }
}

function page(items: unknown[]) {
  return { pages: [{ items, marker: undefined }] }
}

beforeEach(() => useAccountTxHistory.mockReset())
afterEach(cleanup)

/**
 * The regression this suite exists for: `account_tx` failing used to render
 * "No transactions yet — Payments this account sends or receives will appear
 * here once the ledger validates them." That states as fact something the app
 * does not know, on a wallet whose owner ranks correctness about money above
 * everything. It must never come back.
 */
describe('HistoryTab — a failed read is never an empty account', () => {
  it('reports the failure and does not claim the account has no transactions', () => {
    useAccountTxHistory.mockReturnValue(query({ isError: true, error: new Error('websocket closed') }))
    render(<HistoryTab />)

    expect(screen.queryByText(EMPTY_COPY)).toBeNull()
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('History unavailable')
    expect(alert.textContent).toContain('could not be read from the ledger')
  })

  it('does not put the transport error on screen', () => {
    useAccountTxHistory.mockReturnValue(query({ isError: true, error: new Error('websocket closed') }))
    const { container } = render(<HistoryTab />)
    expect(container.textContent).not.toContain('websocket closed')
  })

  it('retries the read from the keyboard-reachable control', () => {
    const refetch = vi.fn()
    useAccountTxHistory.mockReturnValue(query({ isError: true, refetch }))
    render(<HistoryTab />)

    const retry = screen.getByRole('button', { name: 'Try again' })
    expect(retry.hasAttribute('disabled')).toBe(false)
    expect(retry.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(retry)
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('still says "No transactions yet" when the read genuinely succeeds with zero items', () => {
    useAccountTxHistory.mockReturnValue(query({ data: page([]) }))
    render(<HistoryTab />)

    expect(screen.getByText(EMPTY_COPY)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('keeps the filter-reset route open when a later page fails under a filter', async () => {
    const tx = {
      hash: 'ABCDEF0123456789',
      direction: 'sent',
      type: 'Payment',
      resultCode: 'tesSUCCESS',
      validated: true,
      date: null,
      amountDrops: '1000000',
      counterparty: 'rBoGUS9uiK9m3Kk6qnGRvWWCwAeN8hF3wR',
    }
    useAccountTxHistory.mockReturnValue(query({ isError: true, data: page([tx]) }))
    render(<HistoryTab />)

    // Switch to "Received": zero rows match, and the read is also in error.
    // Radix activates a tab on mousedown, not on a bare click().
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Received' }), { button: 0 })
    const reset = await screen.findByRole('button', { name: 'Show all transactions' })
    // Accurate, so it survives the error — and it is the only way back to All.
    expect(reset).toBeTruthy()
    expect(screen.queryByText(EMPTY_COPY)).toBeNull()
  })

  it('retries the page that actually failed, not the whole read', () => {
    const refetch = vi.fn().mockResolvedValue({})
    const fetchNextPage = vi.fn().mockResolvedValue({})
    const tx = {
      hash: 'ABCDEF0123456789',
      direction: 'sent',
      type: 'Payment',
      resultCode: 'tesSUCCESS',
      validated: true,
      date: null,
      amountDrops: '1000000',
      counterparty: 'rBoGUS9uiK9m3Kk6qnGRvWWCwAeN8hF3wR',
    }
    useAccountTxHistory.mockReturnValue(query({ isError: true, data: page([tx]), refetch, fetchNextPage }))
    render(<HistoryTab />)

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    // With pages loaded the failure came from `fetchNextPage`; `refetch` there
    // clears the error without ever fetching the page that is missing.
    expect(fetchNextPage).toHaveBeenCalledOnce()
    expect(refetch).not.toHaveBeenCalled()
  })

  it('keeps history already on screen when a later page fails', () => {
    const tx = {
      hash: 'ABCDEF0123456789',
      direction: 'sent',
      type: 'Payment',
      resultCode: 'tesSUCCESS',
      validated: true,
      date: null,
      amountDrops: '1000000',
      counterparty: 'rBoGUS9uiK9m3Kk6qnGRvWWCwAeN8hF3wR',
    }
    useAccountTxHistory.mockReturnValue(query({ isError: true, data: page([tx]) }))
    render(<HistoryTab />)

    // The failure is reported, but the rows the user already had are not taken
    // away and replaced with an error panel.
    expect(screen.getByRole('alert').textContent).toContain('History unavailable')
    expect(screen.getByText('sent')).toBeTruthy()
    expect(screen.queryByText(EMPTY_COPY)).toBeNull()
  })
})
