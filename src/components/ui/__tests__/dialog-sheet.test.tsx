// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../dialog'

afterEach(cleanup)

function renderDialog(variant?: 'sheet') {
  render(
    <Dialog open>
      <DialogContent variant={variant}>
        <DialogHeader>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button>Commit</button>
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

  it('is a plain dialog by default', () => {
    expect(renderDialog().getAttribute('data-variant')).toBe('dialog')
  })
})
