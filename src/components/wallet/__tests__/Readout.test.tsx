/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Readout, type ScaleMark } from '../Readout'

afterEach(cleanup)

function renderWith(marks: ScaleMark[]) {
  render(<Readout legend="XRP Balance" value="25" unit="XRP" marks={marks} />)
  return (label: string) => screen.getByText(label).parentElement!.querySelector('dd')!
}

/**
 * `unavailable` exists so a reading that could not be read keeps its place
 * under the rule and says so, instead of vanishing — a mark that disappears
 * tells the operator the obligation is smaller, which is the dangerous
 * direction to be wrong in. What it renders is a sentence, so it must not wear
 * the data face or the tabular numerals that say "this is a figure".
 */
describe('ScaleMark — the stated-unavailable state', () => {
  it('renders the words, without the data face or tabular numerals', () => {
    const dd = renderWith([{ label: 'Spendable', value: 'Unavailable', unavailable: true }])('Spendable')

    expect(dd.textContent).toBe('Unavailable')
    expect(dd.className).not.toContain('font-data')
    expect(dd.className).toContain('text-readout-muted')
  })

  it('keeps the data face on a mark that does carry a figure', () => {
    const dd = renderWith([{ label: 'Reserved', value: '1.6' }])('Reserved')

    expect(dd.className).toContain('font-data')
    expect(dd.className).not.toContain('text-readout-muted')
  })

  it('makes one statement: no note rides along on an unavailable mark', () => {
    const dd = renderWith([
      { label: 'Reserved', value: 'Unavailable', note: '3 owned objects', unavailable: true },
    ])('Reserved')

    expect(dd.textContent).toBe('Unavailable')
    expect(screen.queryByText('3 owned objects')).toBeNull()
  })

  it('still renders the note on a mark that carries a figure', () => {
    renderWith([{ label: 'Reserved', value: '1.6', note: '3 owned objects' }])

    expect(screen.getByText('3 owned objects')).toBeTruthy()
  })

  it('keeps the rule and both marks on screen when every mark is unavailable', () => {
    // The `marks.length > 0` gate skips the whole <dl>; the unavailable state
    // exists precisely so the array is never emptied to say "could not read".
    renderWith([
      { label: 'Spendable', value: 'Unavailable', unavailable: true },
      { label: 'Reserved', value: 'Unavailable', unavailable: true },
    ])

    expect(screen.getAllByText('Unavailable').length).toBe(2)
  })
})
