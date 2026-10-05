/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { ReadingValue } from '../ReadingValue'
import type { ReadState } from '@/lib/read-state'

afterEach(cleanup)

const format = (v: string) => `${v} XRP`

function dd(state: ReadState<string>) {
  const { container } = render(
    <dl>
      <ReadingValue state={state} format={format} />
    </dl>,
  )
  return container.querySelector('dd') as HTMLElement
}

describe('ReadingValue', () => {
  it('renders a read figure in the data face, formatted at the boundary', () => {
    const el = dd({ status: 'ok', value: '12' })
    expect(el.textContent).toBe('12 XRP')
    expect(el.className).toContain('font-data')
  })

  it('renders a read in flight as the pending ellipsis, not as unavailable', () => {
    const el = dd({ status: 'pending' })
    expect(el.textContent).toBe('…')
    expect(el.className).toContain('font-data')
  })

  it('renders a failed read in words, never as a figure or the pending mark', () => {
    const el = dd({ status: 'failed' })
    expect(el.textContent).toBe('Unavailable')
    expect(el.className).toContain('font-legend')
    expect(el.className).toContain('text-readout-muted')
  })

  it('renders an unactivated account in words too', () => {
    expect(dd({ status: 'not-activated' }).textContent).toBe('Unavailable')
  })
})
