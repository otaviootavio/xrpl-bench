import { describe, expect, it } from 'vitest'
import { isSignedRecord, latestSameBuild, retryCaseOf, type SignedRecord } from '../signed-list'

/** The retry table (OS-FR-16, route-checks "Retry without paying twice"). */
const rec = (over: Partial<SignedRecord> = {}): SignedRecord => ({
  buildHash: 'a'.repeat(64),
  sequence: 10,
  hash: 'A'.repeat(64),
  lastLedgerSequence: 1150,
  ledgerIndex: 1000,
  signedAt: 1,
  ...over,
})

const KEY = 'rKEY'
const scope = { account: KEY, keyAddress: KEY }

describe('latestSameBuild', () => {
  it('finds nothing for another Build hash', () => {
    expect(latestSameBuild([rec()], 'b'.repeat(64), scope)).toBeNull()
  })

  it('a record for another Account is never a Same Build (OS-FR-20: a Signs-for change)', () => {
    const forX = rec({ account: 'rX' })
    // A record with no account was signed for the key's own address.
    const legacy = rec({ sequence: 7 })
    expect(latestSameBuild([forX, legacy], 'a'.repeat(64), { account: 'rY', keyAddress: KEY })).toBeNull()
    expect(latestSameBuild([forX, legacy], 'a'.repeat(64), { account: 'rX', keyAddress: KEY })).toBe(forX)
    expect(latestSameBuild([forX, legacy], 'a'.repeat(64), scope)).toBe(legacy)
  })

  it('isSignedRecord accepts an Account and refuses a non-string one', () => {
    expect(isSignedRecord(rec({ account: 'rX' }))).toBe(true)
    expect(isSignedRecord({ ...rec(), account: 5 })).toBe(false)
  })

  it('takes the highest Sequence, then the highest LastLedgerSequence (after a case (c) re-sign)', () => {
    const a = rec({ sequence: 10, lastLedgerSequence: 1150, hash: '1'.repeat(64) })
    const c = rec({ sequence: 10, lastLedgerSequence: 1250, hash: '2'.repeat(64) })
    const other = rec({ buildHash: 'b'.repeat(64), sequence: 99 })
    expect(latestSameBuild([c, a, other], 'a'.repeat(64), scope)).toBe(c)
    const n = rec({ sequence: 11, lastLedgerSequence: 1200, hash: '3'.repeat(64) })
    expect(latestSameBuild([a, n, c], 'a'.repeat(64), scope)).toBe(n)
  })
})

describe('retryCaseOf', () => {
  const earlier = rec()
  it.each([
    ['(a) higher Sequence, window open', { sequence: 11, ledger_index: 1100 }, { case: 'higher' }],
    ['(a) higher Sequence, window passed', { sequence: 11, ledger_index: 2000 }, { case: 'higher' }],
    ['(b) same Sequence, index past', { sequence: 10, ledger_index: 1151 }, { case: 'passed', sequence: 10 }],
    ['(b) same Sequence, index equal to the earlier LastLedgerSequence', { sequence: 10, ledger_index: 1150 }, { case: 'passed', sequence: 10 }],
    ['(c) same Sequence, index below', { sequence: 10, ledger_index: 1149 }, { case: 'same-sequence', sequence: 10 }],
    ['lower Sequence, window open → the earlier Sequence', { sequence: 9, ledger_index: 1100 }, { case: 'same-sequence', sequence: 10 }],
    ['lower Sequence, an inflated index → still the earlier Sequence', { sequence: 9, ledger_index: 99_999_999 }, { case: 'same-sequence', sequence: 10 }],
  ])('%s', (_name, received, expected) => {
    expect(retryCaseOf(earlier, received)).toEqual(expected)
  })
})

describe('isSignedRecord', () => {
  it('accepts a record and refuses a malformed one', () => {
    expect(isSignedRecord(rec())).toBe(true)
    expect(isSignedRecord({ ...rec(), hash: 'a'.repeat(64) })).toBe(false)
    expect(isSignedRecord({ ...rec(), sequence: -1 })).toBe(false)
    expect(isSignedRecord({ ...rec(), signedAt: Number.NaN })).toBe(false)
    expect(isSignedRecord(null)).toBe(false)
  })
})
