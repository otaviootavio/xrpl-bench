/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { QuizShell, type QuizStep } from '../QuizShell'

const STEPS = [
  { id: 'a', title: 'First' },
  { id: 'b', title: 'Second' },
  { id: 'c', title: 'Third' },
]

// The wrapper owns every answer, as CreateWalletFlow does.
function Fixture({ busy = false, start = 0, actionHost }: { busy?: boolean; start?: number; actionHost?: HTMLElement | null }) {
  const [index, setIndex] = useState(start)
  const [text, setText] = useState('')
  const [pick, setPick] = useState('x')
  return (
    <QuizShell steps={STEPS} index={index} onIndex={setIndex} busy={busy} actionHost={actionHost} finalAction={<button type="button">Finish</button>}>
      <input aria-label="Typed" value={text} onChange={(e) => setText(e.target.value)} />
      {['x', 'y'].map((v) => (
        <label key={v}>
          <input type="radio" name="r" aria-label={`pick ${v}`} checked={pick === v} onChange={() => setPick(v)} />
        </label>
      ))}
    </QuizShell>
  )
}

const click = async (el: HTMLElement) => act(async () => void fireEvent.click(el))
const heading = (name: string) => screen.getByRole('heading', { name })

const hosts: HTMLElement[] = []
afterEach(() => {
  cleanup()
  hosts.splice(0).forEach((h) => h.remove())
})

describe('QuizShell', () => {
  it('shows the position as text and does not move focus on mount', () => {
    render(<Fixture />)
    expect(screen.getByText('Step 1 of 3')).toBeTruthy()
    expect(document.activeElement).toBe(document.body)
  })

  it('keeps a typed value and a chosen radio across Next and Back, and focuses the heading', async () => {
    render(<Fixture />)
    fireEvent.change(screen.getByLabelText('Typed'), { target: { value: 'hello' } })
    await click(screen.getByLabelText('pick y'))
    await click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText('Step 2 of 3')).toBeTruthy()
    expect(document.activeElement).toBe(heading('Second'))
    await click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Step 1 of 3')).toBeTruthy()
    expect(document.activeElement).toBe(heading('First'))
    expect((screen.getByLabelText('Typed') as HTMLInputElement).value).toBe('hello')
    expect((screen.getByLabelText('pick y') as HTMLInputElement).checked).toBe(true)
  })

  it('Back is aria-disabled on step 1 and does nothing', async () => {
    render(<Fixture />)
    const back = screen.getByRole('button', { name: 'Back' })
    expect(back.getAttribute('aria-disabled')).toBe('true')
    await click(back)
    expect(screen.getByText('Step 1 of 3')).toBeTruthy()
  })

  it('the last step shows the final action and no Next', () => {
    render(<Fixture start={2} />)
    expect(screen.getByRole('button', { name: 'Finish' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Back' }).getAttribute('aria-disabled')).toBeNull()
  })

  it('busy makes Back and Next inert', async () => {
    render(<Fixture busy start={1} />)
    const next = screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement
    const back = screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement
    expect(next.disabled).toBe(true)
    expect(back.disabled).toBe(true)
    await click(next)
    await click(back)
    expect(screen.getByText('Step 2 of 3')).toBeTruthy()
  })

  it('has no animation or transition classes of its own', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    hosts.push(host)
    const { container } = render(<Fixture actionHost={host} />)
    await click(screen.getByRole('button', { name: 'Next' }))
    // The shell's own markup and its actions container; Button carries its shared hover transition, which is not a step change.
    const own = [...container.querySelectorAll('section, section > div, h2, p'), ...host.querySelectorAll('[data-slot="screen-footer"]')].map((el) => el.getAttribute('class') ?? '').join(' ')
    expect(own).not.toMatch(/animate-|transition/)
  })

  it('renders its actions in the actionHost, not inline, and still steps', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    hosts.push(host)
    const { container } = render(<Fixture actionHost={host} />)
    const inHost = (name: string) => within(host).queryByRole('button', { name })
    expect(inHost('Back')).toBeTruthy()
    expect(inHost('Next')).toBeTruthy()
    expect(within(container).queryByRole('button', { name: 'Back' })).toBeNull()
    expect(within(container).queryByRole('button', { name: 'Next' })).toBeNull()
    await click(inHost('Next')!)
    expect(screen.getByText('Step 2 of 3')).toBeTruthy()
    await click(inHost('Next')!)
    expect(inHost('Finish')).toBeTruthy()
    expect(inHost('Next')).toBeNull()
    expect(within(container).queryByRole('button', { name: 'Finish' })).toBeNull()
    await click(inHost('Back')!)
    expect(screen.getByText('Step 2 of 3')).toBeTruthy()
  })

  describe('per-step blocked, primary and secondary', () => {
    function Custom({ steps, actionHost }: { steps: QuizStep[]; actionHost?: HTMLElement | null }) {
      const [index, setIndex] = useState(0)
      return (
        <QuizShell steps={steps} index={index} onIndex={setIndex} busy={false} actionHost={actionHost} finalAction={<button type="button">Finish</button>}>
          <p>body</p>
        </QuizShell>
      )
    }
    const extra = (blocked: boolean): QuizStep[] => [
      { id: 'a', title: 'First', blocked },
      { id: 'b', title: 'Second', primary: <button type="button">Do it</button>, secondary: <button type="button">Other way</button> },
      { id: 'c', title: 'Third' },
    ]

    it('a blocked step makes Next aria-disabled and does nothing', async () => {
      render(<Custom steps={extra(true)} />)
      const next = screen.getByRole('button', { name: 'Next' })
      expect(next.getAttribute('aria-disabled')).toBe('true')
      await click(next)
      expect(screen.getByText('Step 1 of 3')).toBeTruthy()
    })

    it('an unblocked step advances', async () => {
      render(<Custom steps={extra(false)} />)
      const next = screen.getByRole('button', { name: 'Next' })
      expect(next.getAttribute('aria-disabled')).toBeNull()
      await click(next)
      expect(screen.getByText('Step 2 of 3')).toBeTruthy()
    })

    it('primary replaces Next and secondary sits between Back and it, inline', async () => {
      const { container } = render(<Custom steps={extra(false)} />)
      await click(screen.getByRole('button', { name: 'Next' }))
      expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
      const names = within(container).getAllByRole('button').map((b) => b.textContent)
      expect(names).toEqual(['Back', 'Other way', 'Do it'])
    })

    it('primary and secondary render in the actionHost', async () => {
      const host = document.createElement('div')
      document.body.appendChild(host)
      hosts.push(host)
      const { container } = render(<Custom steps={extra(false)} actionHost={host} />)
      await click(within(host).getByRole('button', { name: 'Next' }))
      expect(within(host).getAllByRole('button').map((b) => b.textContent)).toEqual(['Back', 'Other way', 'Do it'])
      expect(within(container).queryByRole('button', { name: 'Do it' })).toBeNull()
    })
  })
})
