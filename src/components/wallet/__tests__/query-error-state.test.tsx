/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryErrorState } from '../QueryErrorState'
import { useNoticeStore } from '@/store/notice-store'

// RTL's auto-cleanup only registers with `globals: true`; this project runs
// without it, so unmount explicitly between renders.
afterEach(cleanup)
beforeEach(() => useNoticeStore.setState({ notices: [] }))

/**
 * AD-8's inline error surface. The three things asserted here are the three
 * the frozen spec names: the failure is stated in words, the retry is reachable
 * by keyboard alone, and nothing expires on a timer.
 */
describe('QueryErrorState', () => {
  it('states what failed, in words, and announces it', () => {
    render(
      <QueryErrorState
        title="Balance unavailable"
        description="The XRP balance could not be read from the ledger."
        onRetry={() => {}}
      />,
    )

    // role="alert" — the failure reaches a screen reader, not only the eye.
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Balance unavailable')
    expect(alert.textContent).toContain('could not be read from the ledger')
  })

  it('offers a retry that a keyboard alone can reach and activate', () => {
    const onRetry = vi.fn()
    render(<QueryErrorState title="Balance unavailable" description="Could not read." onRetry={onRetry} />)

    const retry = screen.getByRole('button', { name: 'Try again' })
    // Unavailable BOTH ways would put it out of reach: `disabled` drops it from
    // the tab order, `aria-disabled` tells a screen reader not to bother. A
    // `tabIndex` check alone proves nothing — a disabled button has tabIndex 0
    // too (docs/decisions.md §6.4).
    expect(retry.hasAttribute('disabled')).toBe(false)
    expect(retry.getAttribute('aria-disabled')).toBeNull()

    // Focusable, and a native <button>, which is what makes Enter and Space
    // activate it: jsdom does not synthesise the click a browser generates from
    // Enter, so the activation itself is asserted through that click.
    retry.focus()
    expect(document.activeElement).toBe(retry)
    fireEvent.keyDown(retry, { key: 'Enter', code: 'Enter' })
    expect(retry.tagName).toBe('BUTTON')
    expect(retry.getAttribute('type')).not.toBe('submit')
    fireEvent.click(retry)
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('reports only the user’s own retry as in flight, not the 15-second poll', async () => {
    let release: () => void = () => {}
    const onRetry = vi.fn(() => new Promise<void>((resolve) => (release = resolve)))
    render(<QueryErrorState title="Balance unavailable" description="Could not read." onRetry={onRetry} />)

    // Idle: the label is not rewritten by anything the user did not do.
    expect(screen.getByRole('button', { name: 'Try again' }).getAttribute('aria-busy')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    const busy = await screen.findByRole('button', { name: 'Retrying…' })
    expect(busy.getAttribute('aria-busy')).toBe('true')
    // Still reachable while it works — never disabled mid-attempt.
    expect(busy.hasAttribute('disabled')).toBe(false)

    release()
    await screen.findByRole('button', { name: 'Try again' })
  })

  it('stays inline and pushes nothing to the Annunciator', () => {
    render(
      <QueryErrorState
        title="Balance unavailable"
        description="The XRP balance could not be read from the ledger."
        onRetry={() => {}}
      />,
    )

    // AD-8: a failed READ reports where the data belongs. Routing it to the
    // notice band instead would flood a surface that never auto-dismisses,
    // because these reads retry every 15 seconds. Asserting the store is empty
    // is what distinguishes this component from one that calls `notify.error`;
    // advancing a timer would not, since neither registers one.
    expect(useNoticeStore.getState().notices).toEqual([])
    expect(screen.getByRole('alert').textContent).toContain('Balance unavailable')
  })
})
