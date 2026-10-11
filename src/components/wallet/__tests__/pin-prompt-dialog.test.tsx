/** @vitest-environment jsdom */
import { useEffect } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PinPromptProvider } from '../PinPromptDialog'
import { usePrompts } from '@/hooks/usePrompts'
import type { Prompts } from '@/lib/crypto/keystore'

const captured: { prompts?: Prompts } = {}
function Probe() {
  const current = usePrompts()
  useEffect(() => {
    captured.prompts = current
  })
  return null
}
const prompts = { pin: (info: { triesRemaining: number }) => captured.prompts!.pin(info) }
const mount = () =>
  render(
    <PinPromptProvider>
      <Probe />
    </PinPromptProvider>,
  )

afterEach(cleanup)

describe('PinPromptProvider', () => {
  it('asks for the App PIN, states tries remaining and what a lock-out is', async () => {
    mount()
    let answer: Promise<string | null> | undefined
    act(() => {
      answer = prompts.pin({ triesRemaining: 3 })
    })
    expect(await screen.findByText('3 tries remaining.')).toBeTruthy()
    expect(screen.getByText(/locked/i)).toBeTruthy()
    expect(screen.getByText(/Cancelling does not count/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('App PIN'), { target: { value: '123456' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    })
    expect(await answer).toBe('123456')
    expect(screen.queryByText('3 tries remaining.')).toBeNull()
  })

  it('says one try in the singular', async () => {
    mount()
    act(() => void prompts.pin({ triesRemaining: 1 }))
    expect(await screen.findByText('1 try remaining.')).toBeTruthy()
  })

  it('Cancel resolves null: cancelled, not a wrong PIN', async () => {
    mount()
    let answer: Promise<string | null> | undefined
    act(() => {
      answer = prompts.pin({ triesRemaining: 8 })
    })
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    })
    expect(await answer).toBeNull()
  })

  it('Escape and the close button also resolve null', async () => {
    mount()
    let answer: Promise<string | null> | undefined
    act(() => {
      answer = prompts.pin({ triesRemaining: 8 })
    })
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    })
    expect(await answer).toBeNull()
  })

  it('an empty submit asks nothing of the keystore', async () => {
    mount()
    let settled = false
    act(() => {
      void prompts.pin({ triesRemaining: 8 }).then(() => (settled = true))
    })
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    })
    expect(settled).toBe(false)
  })

  it('outside a provider a PIN prompt is dismissed, so a PIN-sealed Wallet fails closed', async () => {
    render(<Probe />)
    expect(await prompts.pin({ triesRemaining: 8 })).toBeNull()
  })
})
