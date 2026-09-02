/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { TrustLineRow } from '../TrustLineRow'
import type { TrustLine } from '@/lib/xrpl/reads'

// AddressLink reads the network from the zustand store and renders a Tooltip;
// neither is what this test is about.
vi.mock('../AddressLink', () => ({
  AddressLink: ({ address }: { address: string }) => <span>{address}</span>,
}))

// RTL's auto-cleanup only registers with `globals: true`; this project runs
// without it, so unmount explicitly between renders.
afterEach(cleanup)

function line(overrides: Partial<TrustLine> = {}): TrustLine {
  return {
    account: 'r4NagxniGTmPRr8yBRXRD6NNpZP7FfP4KR',
    currency: 'USD',
    balance: '0',
    limit: '1000000000',
    freeze: false,
    freezePeer: false,
    ...overrides,
  } as TrustLine
}

/**
 * The non-zero-balance branch cannot be reached through the app's own UI —
 * issuing an IOU is deliberately out of scope — so it is covered here instead.
 * Regression guard for docs/decisions.md §6.4: a control that is temporarily
 * unavailable stays rendered, focusable, and explains itself. The previous
 * implementation omitted it entirely, so a holder saw no Close button and no
 * reason why.
 */
describe('TrustLineRow — Close control availability', () => {
  it('is enabled and actionable when the balance is zero', () => {
    const onRemove = vi.fn()
    render(<TrustLineRow line={line({ balance: '0' })} onRemove={onRemove} />)
    const close = screen.getByRole('button', { name: 'Close' })
    expect(close.getAttribute('aria-disabled')).toBe('false')
    expect(close.getAttribute('aria-describedby')).toBeNull()
    close.click()
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('stays rendered and focusable when a balance blocks closing, and names the reason', () => {
    const onRemove = vi.fn()
    render(<TrustLineRow line={line({ balance: '25.5' })} onRemove={onRemove} />)
    const close = screen.getByRole('button', { name: 'Close' })

    // Rendered, not hidden.
    expect(close).toBeTruthy()
    // Reachable by keyboard: aria-disabled, never the `disabled` attribute.
    expect(close.getAttribute('aria-disabled')).toBe('true')
    expect(close.hasAttribute('disabled')).toBe(false)
    expect(close.tabIndex).toBeGreaterThanOrEqual(0)

    // The reason is real, visible text wired up via aria-describedby.
    const reasonId = close.getAttribute('aria-describedby')
    expect(reasonId).toBeTruthy()
    const reason = document.getElementById(reasonId!)
    expect(reason?.textContent).toBe('Balance must be zero to close')

    // And activating it does nothing while blocked.
    close.click()
    expect(onRemove).not.toHaveBeenCalled()
  })
})
