import { describe, expect, it } from 'vitest'
import { validateAmountString } from '../AmountInput'

describe('validateAmountString', () => {
  it('requires a non-empty, positive amount', () => {
    expect(validateAmountString('', 'xrp').valid).toBe(false)
    expect(validateAmountString('0', 'xrp').valid).toBe(false)
    expect(validateAmountString('0.00', 'xrp').valid).toBe(false)
    expect(validateAmountString('.', 'xrp').valid).toBe(false)
  })

  it('enforces the 6-decimal drop limit for XRP', () => {
    expect(validateAmountString('1.000001', 'xrp').valid).toBe(true)
    expect(validateAmountString('1.0000001', 'xrp').valid).toBe(false)
  })

  it('enforces 15 significant digits for issued currencies', () => {
    expect(validateAmountString('123456789012345', 'issued').valid).toBe(true)
    expect(validateAmountString('1234567890123456', 'issued').valid).toBe(false)
  })

  it('rejects non-numeric input', () => {
    expect(validateAmountString('1e5', 'xrp').valid).toBe(false)
    expect(validateAmountString('-1', 'xrp').valid).toBe(false)
  })
})
