/** @vitest-environment jsdom */
import { readFileSync, readdirSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../select'
import { Radio } from '../radio'
import { Axis, Choice } from '@/components/wallet/check-controls'

afterEach(cleanup)

Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.scrollIntoView ??= () => {}

describe('panel vocabulary (mobile dialogs S5c)', () => {
  it('a Select item is styled by Radix highlight state, not the focus pseudo-class', () => {
    render(
      <Select defaultValue="a">
        <SelectTrigger aria-label="Pick">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">Alpha</SelectItem>
          <SelectItem value="b">Beta</SelectItem>
        </SelectContent>
      </Select>,
    )
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Pick' }), { key: 'ArrowDown' })
    const item = screen.getByRole('option', { name: 'Beta' })
    expect(item.className).toContain('data-[highlighted]:bg-accent')
    expect(item.className.split(/\s+/).some((c) => c.startsWith('focus' + ':'))).toBe(false)
    act(() => item.focus())
    expect(item.hasAttribute('data-highlighted')).toBe(true)
  })

  it('the shared Radio is a native radio: grouping and checked state survive', () => {
    render(
      <>
        <Radio name="g" aria-label="One" defaultChecked />
        <Radio name="g" aria-label="Two" />
      </>,
    )
    const one = screen.getByRole('radio', { name: 'One' }) as HTMLInputElement
    const two = screen.getByRole('radio', { name: 'Two' }) as HTMLInputElement
    expect(one.checked).toBe(true)
    fireEvent.click(two)
    expect(two.checked).toBe(true)
    expect(one.checked).toBe(false)
  })

  it('an Axis legend is an engraved panel legend, and Choice renders through the shared Radio', () => {
    render(
      <Axis legend="Open check">
        <Choice name="x" checked label="PIN" state={{ available: true }} onSelect={() => {}} />
      </Axis>,
    )
    expect(screen.getByText('Open check').className).toContain('panel-legend')
    expect(screen.getByRole('radio', { name: 'PIN' }).getAttribute('data-slot')).toBe('radio')
  })

  it('the skip link reveals itself but authors no ring or outline', () => {
    const src = readFileSync('src/pages/Main.tsx', 'utf8')
    const classes = /href="#main-content"\s+className="([^"]+)"/.exec(src)?.[1] ?? ''
    expect(classes).toContain('sr-only')
    expect(classes).not.toMatch(/ring|outline/)
  })

  it('only the documented skip link in Main.tsx matches the focus-style and outline-removal grep', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const path = `${dir}/${e.name}`
        if (e.isDirectory()) return e.name === '__tests__' ? [] : walk(path)
        return /\.(ts|tsx)$/.test(e.name) ? [path] : []
      })
    const pattern = new RegExp(['focus', ':|outline', '-none'].join(''))
    const hits = walk('src').filter((f) => pattern.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual(['src/pages/Main.tsx'])
  })
})
