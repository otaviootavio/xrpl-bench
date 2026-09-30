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
import { TooltipProvider } from '@/components/ui/tooltip'

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

/**
 * FR-57: a figure the ledger did not report as delivered is a maximum, and the
 * screen must say so — in text on the row (`≤`) and in words once expanded.
 */
describe('HistoryTab — an amount not known to be delivered is an upper bound', () => {
  const base = {
    direction: 'received',
    type: 'Payment',
    validated: true,
    date: null,
    counterparty: 'rBoGUS9uiK9m3Kk6qnGRvWWCwAeN8hF3wR',
  }

  /** Each fixture has one row; its toggle is the only button with `aria-expanded`. */
  function expandRow() {
    const row = screen.getAllByRole('button').find((b) => b.hasAttribute('aria-expanded'))
    fireEvent.click(row!)
  }

  it('prefixes an absent-delivery figure with ≤ and states it is a maximum once expanded', () => {
    const tx = { ...base, hash: 'UPPER', resultCode: 'tesSUCCESS', amountDrops: '5000000', amountIsUpperBound: true }
    useAccountTxHistory.mockReturnValue(query({ data: page([tx]) }))
    render(<TooltipProvider><HistoryTab /></TooltipProvider>)

    expect(screen.getByText('≤ 5 XRP')).toBeTruthy()
    expandRow()
    expect(screen.getByText('Delivered amount is an upper bound')).toBeTruthy()
    expect(screen.getByText(/could not report the exact delivered amount/)).toBeTruthy()
    expect(screen.getByText(/is a\s+maximum/)).toBeTruthy()
  })

  it('prefixes an issued upper-bound figure with ≤ too', () => {
    const tx = {
      ...base,
      hash: 'UPPERIOU',
      resultCode: 'tesSUCCESS',
      amountIssued: { currency: 'USD', issuer: 'rIssuer', value: '10' },
      amountIsUpperBound: true,
    }
    useAccountTxHistory.mockReturnValue(query({ data: page([tx]) }))
    render(<TooltipProvider><HistoryTab /></TooltipProvider>)
    expect(screen.getByText('≤ 10 USD')).toBeTruthy()
  })

  it('shows an exact (partial) delivered figure with no upper-bound label', () => {
    const tx = { ...base, hash: 'EXACT', resultCode: 'tesSUCCESS', amountDrops: '1000000' }
    useAccountTxHistory.mockReturnValue(query({ data: page([tx]) }))
    const { container } = render(<TooltipProvider><HistoryTab /></TooltipProvider>)

    expect(screen.getByText('1 XRP')).toBeTruthy()
    expandRow()
    expect(container.textContent).not.toContain('≤')
    expect(screen.queryByText('Delivered amount is an upper bound')).toBeNull()
    expect(screen.queryByText(/nothing was delivered/)).toBeNull()
  })

  it('does not word an unknown-outcome row (empty resultCode) as failed', () => {
    const tx = { ...base, hash: 'UNKNOWN', resultCode: '', amountDrops: '5000000', amountIsUpperBound: true }
    useAccountTxHistory.mockReturnValue(query({ data: page([tx]) }))
    render(<TooltipProvider><HistoryTab /></TooltipProvider>)

    expandRow()
    expect(screen.getByText('Delivered amount is an upper bound')).toBeTruthy()
    expect(screen.queryByText(/nothing was delivered/)).toBeNull()
  })

  it('keeps a failed row\'s legend and its ≤ amount, with the result code unbreakable', () => {
    const tx = {
      ...base,
      hash: 'FAILEDROW',
      direction: 'sent',
      resultCode: 'tecNO_DST_INSUF_XRP',
      amountDrops: '500000',
      amountIsUpperBound: true,
    }
    useAccountTxHistory.mockReturnValue(query({ data: page([tx]) }))
    render(<TooltipProvider><HistoryTab /></TooltipProvider>)

    const row = screen.getAllByRole('button').find((b) => b.hasAttribute('aria-expanded'))!
    expect(row.textContent).toContain('Failed — fee charged (tecNO_DST_INSUF_XRP)')
    expect(screen.getByText('≤ 0.5 XRP')).toBeTruthy()
    // Only the code is kept on one line; the words before it may wrap. The
    // layout itself (the amount staying visible at 320px) is a browser check.
    const code = screen.getByText('(tecNO_DST_INSUF_XRP)')
    expect(code.className).toContain('whitespace-nowrap')
    // No ancestor, up to and including the legend root, may be nowrap: that is
    // the legend-wide overflow this row used to have.
    const nowrapAncestor = code.parentElement?.closest('.whitespace-nowrap')
    expect(nowrapAncestor && row.contains(nowrapAncestor)).toBeFalsy()
  })

  it('keeps the result code on a non-tec failure too', () => {
    const tx = { ...base, hash: 'TEFROW', direction: 'sent', resultCode: 'tefPAST_SEQ', amountDrops: '500000' }
    useAccountTxHistory.mockReturnValue(query({ data: page([tx]) }))
    render(<TooltipProvider><HistoryTab /></TooltipProvider>)

    const row = screen.getAllByRole('button').find((b) => b.hasAttribute('aria-expanded'))!
    expect(row.textContent).toContain('Failed (tefPAST_SEQ)')
    expect(screen.getByText('(tefPAST_SEQ)').className).toContain('whitespace-nowrap')
  })

  it('words a failed payment as failed, not as an unreported amount', () => {
    const tx = { ...base, hash: 'FAILED', resultCode: 'tecPATH_DRY', amountDrops: '5000000', amountIsUpperBound: true }
    useAccountTxHistory.mockReturnValue(query({ data: page([tx]) }))
    render(<TooltipProvider><HistoryTab /></TooltipProvider>)

    expect(screen.getByText('≤ 5 XRP')).toBeTruthy()
    expandRow()
    expect(screen.getByText(/This payment failed — nothing was delivered/)).toBeTruthy()
    expect(screen.getByText(/the amount that was requested/)).toBeTruthy()
    expect(screen.queryByText(/could not report the exact delivered amount/)).toBeNull()
  })
})
