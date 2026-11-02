import { describe, expect, it } from 'vitest'
import { describeOptions } from '@/lib/crypto/policy'
import { answerRows, VERDICT_KEYS, WALK_QUESTIONS, walkQuestions } from '@/components/wallet/walk-questions'
import type { WalletQuestionsProps } from '@/components/wallet/WalletQuestions'

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
    expect(WALK_QUESTIONS.map((q) => q.title)).toEqual(['Node', 'Seed Method', 'Signature type', 'Authentication to open the wallet, and auto-lock', 'Authentication to sign a transaction'])
  })

  it('Import omits Seed Method and Signature type', () => {
    expect(walkQuestions(true).map((q) => q.id)).toEqual(['node', 'open-check', 'signing-check'])
    expect(walkQuestions(false)).toHaveLength(5)
  })
})

const PROPS = {
  group: 'g',
  options: OPTIONS,
  busy: false,
  origin: 'localhost',
  label: 'Savings',
  labelError: null,
  network: 'testnet',
  nodeMode: 'builtin',
  nodeDraft: '',
  verifiedNode: null,
  nodeReason: null,
  nodeBusy: false,
  seedMethod: 'passkey-derived',
  passkeyChoice: 'new',
  algorithm: 'ed25519',
  openCheck: 'pin',
  autoLockMinutes: 5,
  signing: 'passkey',
} as unknown as WalletQuestionsProps

describe('the Review lists every answer once', () => {
  it('every question of the walk yields at least one row tagged with its own step', () => {
    for (const q of WALK_QUESTIONS) {
      const rows = q.summary(PROPS)
      expect(rows.length, q.id).toBeGreaterThan(0)
      for (const row of rows) expect(row.step).toBe(q.id)
    }
  })

  it('with a path, Create or import is the first row and Change goes to step 1', () => {
    const rows = answerRows(PROPS, 'import')
    expect(rows[0]).toEqual({ step: 'name-network', term: 'Create or import', value: 'Import a wallet' })
    expect(answerRows(PROPS, 'create')[0].value).toBe('Create a new wallet')
    expect(rows.length).toBe(answerRows(PROPS).length + 1)
  })

  it('lists Label and Network first, then each question in walk order, with Passkey only when Passkey-Derived', () => {
    expect(answerRows(PROPS).map((r) => [r.step, r.term])).toEqual([
      ['name-network', 'Label'],
      [undefined, 'Network'],
      ['node', 'Node'],
      ['seed-method', 'Seed Method'],
      ['seed-method', 'Passkey'],
      ['signature-type', 'Signature type'],
      ['open-check', 'Authentication required to open the wallet'],
      ['open-check', 'Auto-lock'],
      ['signing-check', 'Authentication required to sign a transaction'],
    ])
    expect(answerRows({ ...PROPS, seedMethod: 'stored' }).some((r) => r.term === 'Passkey')).toBe(false)
  })

  it('words the answers from check-words.ts', () => {
    const value = (term: string, p = PROPS) => answerRows(p).find((r) => r.term === term)?.value
    expect(value('Authentication required to open the wallet')).toBe('App PIN')
    expect(value('Authentication required to open the wallet', { ...PROPS, openCheck: 'none' })).toBe('No authentication required to open the wallet')
    expect(value('Authentication required to sign a transaction')).toBe('Passkey only')
    expect(value('Authentication required to sign a transaction', { ...PROPS, signing: 'standard' })).toBe('Nothing is asked for signing')
    expect(value('Auto-lock', { ...PROPS, autoLockMinutes: 0.5 })).toBe('30 seconds')
  })

  it('Import omits Seed Method, Passkey and Signature type', () => {
    expect(answerRows({ ...PROPS, imported: true }).map((r) => r.term)).toEqual(['Label', 'Network', 'Node', 'Authentication required to open the wallet', 'Auto-lock', 'Authentication required to sign a transaction'])
  })

  it('shows no Seed and no PIN', () => {
    const text = JSON.stringify(answerRows(PROPS))
    expect(text).not.toMatch(/\bs[1-9A-HJ-NP-Za-km-z]{20,}\b/)
    expect(text).not.toMatch(/PIN:|\d{6}/)
  })
})
