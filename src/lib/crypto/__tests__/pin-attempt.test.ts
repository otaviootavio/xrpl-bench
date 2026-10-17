import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Review finding (story 12.3/12.4): `attemptPin` checked the lock and recorded
 * the failure in two separate steps, so guesses started together all passed the
 * check. The vault meta is replaced by one that serialises its transactions, as
 * IndexedDB's readwrite transactions do; the PIN derivation is the real one.
 */
const h = vi.hoisted(() => {
  const state = { meta: { key: 'vault', failedAttempts: 0, pinSaltB64: 'AAAAAAAAAAAAAAAAAAAAAA==' } as Record<string, any> }
  let chain: Promise<unknown> = Promise.resolve()
  return { state, serial: <T,>(run: () => Promise<T>): Promise<T> => (chain = chain.then(run, run)) as Promise<T> }
})

vi.mock('../db', () => ({
  getVaultMeta: async () => structuredClone(h.state.meta),
  mutateVaultMeta: (change: (m: any) => any) =>
    h.serial(async () => {
      await Promise.resolve()
      const next = change(structuredClone(h.state.meta))
      h.state.meta = next
      return structuredClone(next)
    }),
}))

import { attemptPin, MAX_ATTEMPTS_BEFORE_HARD_LOCK } from '../pin'

beforeEach(() => {
  h.state.meta = { key: 'vault', failedAttempts: 0, pinSaltB64: 'AAAAAAAAAAAAAAAAAAAAAA==' }
})

describe('attemptPin charges the attempt before trying it', () => {
  it('lets no more than the allowed guesses reach the proof when many start together', async () => {
    const proof = vi.fn(async () => {
      throw new Error('wrong')
    })
    const results = await Promise.all(Array.from({ length: 20 }, () => attemptPin('000000', proof)))

    expect(proof.mock.calls.length).toBeLessThanOrEqual(MAX_ATTEMPTS_BEFORE_HARD_LOCK)
    expect(results.filter((r) => r.status === 'locked-out').length).toBeGreaterThanOrEqual(20 - MAX_ATTEMPTS_BEFORE_HARD_LOCK)
  })

  it('resets the count on a proven PIN and keeps it on a wrong one', async () => {
    h.state.meta.failedAttempts = 2
    expect(await attemptPin('1', async () => 'k')).toEqual({ status: 'ok', value: 'k' })
    expect(h.state.meta.failedAttempts).toBe(0)

    const wrong = await attemptPin('1', async () => {
      throw new Error('wrong')
    })
    expect(wrong).toEqual({ status: 'wrong-credential', triesRemaining: MAX_ATTEMPTS_BEFORE_HARD_LOCK - 1 })
    expect(h.state.meta.failedAttempts).toBe(1)
  })

  it('refuses a hard-locked vault without calling the proof or changing the count', async () => {
    h.state.meta.failedAttempts = MAX_ATTEMPTS_BEFORE_HARD_LOCK
    const proof = vi.fn()
    expect(await attemptPin('1', proof)).toMatchObject({ status: 'locked-out', hard: true })
    expect(proof).not.toHaveBeenCalled()
    expect(h.state.meta.failedAttempts).toBe(MAX_ATTEMPTS_BEFORE_HARD_LOCK)
  })
})
