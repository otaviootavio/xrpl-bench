// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { PromptsContext, useYieldingPrompts } from '../usePrompts'
import type { Prompts } from '@/lib/crypto/keystore'

function setup(pin: Prompts['pin']) {
  const wrapper = ({ children }: { children: ReactNode }) => <PromptsContext.Provider value={{ pin }}>{children}</PromptsContext.Provider>
  return renderHook(() => useYieldingPrompts(), { wrapper })
}

describe('useYieldingPrompts', () => {
  it('reports a prompt open until it answers, and passes the answer through', async () => {
    let answer!: (v: string | null) => void
    const { result } = setup(() => new Promise((r) => (answer = r)))
    let p!: Promise<string | null>
    act(() => void (p = result.current.prompts.pin({ triesRemaining: 3 })))
    expect(result.current.promptOpen).toBe(true)
    await act(async () => {
      answer('123456')
      expect(await p).toBe('123456')
    })
    expect(result.current.promptOpen).toBe(false)
  })

  it('closes again when the prompt rejects', async () => {
    const { result } = setup(() => Promise.reject(new Error('boom')))
    await act(async () => {
      await result.current.prompts.pin({ triesRemaining: 3 }).catch(() => {})
    })
    expect(result.current.promptOpen).toBe(false)
  })

  it('stays open while a second prompt is still open', async () => {
    const resolvers: Array<(v: string | null) => void> = []
    const { result } = setup(() => new Promise((r) => resolvers.push(r)))
    act(() => {
      void result.current.prompts.pin({ triesRemaining: 3 })
      void result.current.prompts.pin({ triesRemaining: 3 })
    })
    await act(async () => resolvers[0](null))
    expect(result.current.promptOpen).toBe(true)
    await act(async () => resolvers[1](null))
    expect(result.current.promptOpen).toBe(false)
  })
})
