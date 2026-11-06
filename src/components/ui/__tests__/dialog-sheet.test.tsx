// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Button } from '../button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../dialog'

afterEach(cleanup)

function renderDialog(variant?: 'sheet' | 'dialog') {
  render(
    <Dialog open>
      <DialogContent variant={variant}>
        <DialogHeader>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button>Commit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
  )
  return screen.getByRole('dialog')
}

describe('DialogContent variants', () => {
  it('marks a sheet, keeps the footer inside the single scrolling body, and leaves Close outside it', () => {
    const content = renderDialog('sheet')
    expect(content.getAttribute('data-variant')).toBe('sheet')
    const body = content.querySelector('[data-slot="dialog-body"]')
    expect(body?.contains(screen.getByRole('button', { name: 'Commit' }))).toBe(true)
    expect(body?.contains(screen.getByRole('button', { name: 'Close' }))).toBe(false)
  })

  it.each([['sheet' as const], [undefined]])('lets a footer key wrap its label, centred, and grow (variant %s)', (variant) => {
    renderDialog(variant)
    const key = screen.getByRole('button', { name: 'Commit' })
    expect(key.getAttribute('data-slot')).toBe('button')
    const footer = key.parentElement
    expect(footer?.getAttribute('data-slot')).toBe('dialog-footer')
    const classes = footer?.className.split(/\s+/) ?? []
    for (const cls of [
      '[&>[data-slot=button]]:h-auto',
      '[&>[data-slot=button]]:min-h-9',
      'pointer-coarse:[&>[data-slot=button]]:min-h-11',
      '[&>[data-slot=button]]:whitespace-normal',
      '[&>[data-slot=button]]:py-1.5',
      '[&>[data-slot=button]]:text-center',
    ]) {
      expect(classes).toContain(cls)
    }
  })

  it('is a plain dialog by default', () => {
    expect(renderDialog().getAttribute('data-variant')).toBe('dialog')
  })
})
