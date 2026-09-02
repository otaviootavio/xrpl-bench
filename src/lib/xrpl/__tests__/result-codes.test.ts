import { describe, expect, it } from 'vitest'
import { describeResultCode } from '../result-codes'

describe('describeResultCode', () => {
  it('maps known codes to plain language', () => {
    expect(describeResultCode('tesSUCCESS')).toBe('Success.')
    expect(describeResultCode('tecNO_LINE')).toMatch(/trust line/i)
  })

  it('falls back to the raw code for unknown results', () => {
    expect(describeResultCode('tecWHATEVER')).toContain('tecWHATEVER')
  })
})
