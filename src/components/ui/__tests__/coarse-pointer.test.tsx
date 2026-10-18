// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Button } from '../button'
import { Checkbox } from '../checkbox'
import { Dialog, DialogContent, DialogTitle } from '../dialog'
import { Input } from '../input'
import { Label } from '../label'

afterEach(cleanup)

// jsdom does not evaluate `(pointer: coarse)`, so these assert the classes the
// primitive carries; the computed sizes are checked in a real browser pass.
describe('coarse-pointer sizing lives in the primitives', () => {
  it('input and every button size reach 16px text and 44px height', () => {
    render(
      <>
        <Input aria-label="field" />
        <Button size="default">a</Button>
        <Button size="sm">b</Button>
        <Button size="lg">c</Button>
        <Button size="icon" aria-label="i" />
      </>,
    )
    expect(screen.getByLabelText('field').className).toMatch(/pointer-coarse:h-11/)
    expect(screen.getByLabelText('field').className).toMatch(/pointer-coarse:text-base/)
    for (const name of ['a', 'b']) {
      const cls = screen.getByRole('button', { name }).className
      expect(cls).toMatch(/pointer-coarse:h-11/)
      expect(cls).toMatch(/pointer-coarse:text-base/)
    }
    expect(screen.getByRole('button', { name: 'c' }).className).toMatch(/pointer-coarse:text-base/)
    expect(screen.getByRole('button', { name: 'i' }).className).toMatch(/pointer-coarse:size-11/)
  })

  it('the dialog Close is 44px on a coarse pointer and a Label is 12px', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>T</DialogTitle>
          <Label>Field</Label>
        </DialogContent>
      </Dialog>,
    )
    expect(screen.getByRole('button', { name: 'Close' }).className).toMatch(/pointer-coarse:size-11/)
    expect(screen.getByText('Field').className).toMatch(/\btext-xs\b/)
  })

  it('a checkbox extends its hit area to 44px', () => {
    render(<Checkbox aria-label="c" />)
    expect(screen.getByRole('checkbox').className).toMatch(/pointer-coarse:after:-inset-4/)
  })

  it('never disables viewport zoom', () => {
    const html = readFileSync('index.html', 'utf8')
    expect(html).not.toMatch(/user-scalable|maximum-scale/)
  })
})
