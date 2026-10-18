// @vitest-environment jsdom
// A tap outside is not covered here: jsdom never delivers Radix's outside-pointer event.
// It is checked in a real browser (spec-mobile-dialogs-s4 Verification).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../dialog'

const settle = () => act(() => new Promise<void>((r) => setTimeout(r, 30)))

function Host({ refuse = false }: { refuse?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Opener</button>
      <Dialog open={open} onOpenChange={(o) => (refuse && !o ? undefined : setOpen(o))}>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription>Body</DialogDescription>
          <button onClick={() => setOpen(false)}>Done</button>
        </DialogContent>
      </Dialog>
    </>
  )
}

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(async () => {
  cleanup()
  await settle()
})

describe('Dialog overlay behaviour', () => {
  it('returns focus to the control that opened it', async () => {
    render(<Host />)
    const opener = screen.getByRole('button', { name: 'Opener' })
    opener.focus()
    fireEvent.click(opener)
    await settle()
    expect(document.activeElement).not.toBe(opener)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await settle()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('hardware Back closes the overlay and stays on the same path', async () => {
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'Opener' }))
    await settle()
    expect(window.history.state).toEqual({ overlay: true })
    window.history.back()
    await settle()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.pathname).toBe('/')
  })

  it('closing by a button pops its own history entry, so Back is not left a dead step', async () => {
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'Opener' }))
    await settle()
    expect(window.history.state).toEqual({ overlay: true })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await settle()
    expect(window.history.state).toBeNull()
  })

  it('a dialog that refuses to close keeps the entry, so Back cannot discard it', async () => {
    render(<Host refuse />)
    fireEvent.click(screen.getByRole('button', { name: 'Opener' }))
    await settle()
    window.history.back()
    await settle()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(window.history.state).toEqual({ overlay: true })
  })

  it('keeps no secret or form data in the history state', async () => {
    const spy = vi.spyOn(window.history, 'pushState')
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'Opener' }))
    await settle()
    expect(spy.mock.calls.every(([state]) => JSON.stringify(state) === '{"overlay":true}')).toBe(true)
    spy.mockRestore()
  })
})
