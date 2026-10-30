import { describe, expect, it } from 'vitest'
import { describeOptions } from '@/lib/crypto/policy'
import { VERDICT_KEYS, WALK_QUESTIONS, walkQuestions } from '@/components/wallet/walk-questions'

const OPTIONS = describeOptions({
  network: 'testnet',
  seedMethod: 'stored',
  openCheck: 'pin',
  autoLockMinutes: 5,
  signing: 'standard',
  passkey: 'yes',
  origin: 'localhost',
  canConfirmWrittenSeed: true,
})

describe('the walk covers the policy', () => {
  it('every question key the policy lists is covered by a step', () => {
    const covered = new Set(WALK_QUESTIONS.flatMap((q) => q.covers))
    const questions = Object.keys(OPTIONS).filter((k) => !(VERDICT_KEYS as readonly string[]).includes(k))
    expect(questions.filter((k) => !covered.has(k as never))).toEqual([])
  })

  it('every verdict key is a real policy key, and no step claims one', () => {
    for (const key of VERDICT_KEYS) expect(Object.keys(OPTIONS)).toContain(key)
    for (const q of WALK_QUESTIONS) for (const key of q.covers) expect((VERDICT_KEYS as readonly string[]).includes(key)).toBe(false)
  })

  it('every key a step covers is a real policy key; only Node and Signature type cover none', () => {
    for (const q of WALK_QUESTIONS) {
      for (const key of q.covers) expect(Object.keys(OPTIONS)).toContain(key)
      if (q.covers.length === 0) expect(['node', 'signature-type']).toContain(q.id)
    }
  })

  it('the order is the one in quiz-steps.md', () => {
    expect(WALK_QUESTIONS.map((q) => q.title)).toEqual(['Node', 'Seed Method', 'Signature type', 'Open Check and auto-lock', 'Signing Check'])
  })

  it('Import omits Seed Method and Signature type', () => {
    expect(walkQuestions(true).map((q) => q.id)).toEqual(['node', 'open-check', 'signing-check'])
    expect(walkQuestions(false)).toHaveLength(5)
  })
})
