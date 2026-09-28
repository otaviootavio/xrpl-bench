import { describe, expect, it } from 'vitest'
import {
  dropsToXrpString,
  xrpToDropsString,
  formatAmountString,
  formatXrp,
  subtractDrops,
  multiplyDropsByCount,
  isNonNegativeDrops,
  isPositiveDecimalString,
  compareDecimalStrings,
  displayCurrencyCode,
  reserveRequirementDrops,
  spendableAfterReserve,
  amountPlusFeeFits,
  coversOwnerReserve,
} from '../money'

describe('dropsToXrpString', () => {
  it('converts whole and fractional drops exactly', () => {
    expect(dropsToXrpString('1000000')).toBe('1')
    expect(dropsToXrpString('10500000')).toBe('10.5')
    expect(dropsToXrpString('1')).toBe('0.000001')
    expect(dropsToXrpString('0')).toBe('0')
  })

  it('keeps full precision on balances that would lose it as a float', () => {
    // 100 billion XRP in drops exceeds Number.MAX_SAFE_INTEGER; this is the
    // exact case xrpl.js's number-returning dropsToXrp would corrupt.
    expect(dropsToXrpString('100000000000000001')).toBe('100000000000.000001')
  })

  it('handles negative balances', () => {
    expect(dropsToXrpString('-2500000')).toBe('-2.5')
  })
})

describe('xrpToDropsString', () => {
  it('round-trips with dropsToXrpString', () => {
    for (const xrp of ['1', '0.000001', '10.5', '999999.123456']) {
      expect(dropsToXrpString(xrpToDropsString(xrp))).toBe(xrp)
    }
  })
})

describe('formatAmountString', () => {
  it('groups thousands without floating point', () => {
    expect(formatAmountString('1234567.891')).toBe('1,234,567.891')
    expect(formatAmountString('-1000')).toBe('-1,000')
    expect(formatAmountString('999')).toBe('999')
  })

  it('does not truncate 15-significant-digit issued values', () => {
    expect(formatAmountString('123456789012345')).toBe('123,456,789,012,345')
  })
})

describe('formatXrp', () => {
  it('renders drops as a grouped XRP string', () => {
    expect(formatXrp('1234567000000')).toBe('1,234,567 XRP')
  })
})

describe('drops arithmetic', () => {
  it('subtracts and multiplies exactly', () => {
    expect(subtractDrops('1000000', '400000')).toBe('600000')
    expect(multiplyDropsByCount('200000', 3)).toBe('600000')
  })

  it('validates non-negative drops', () => {
    expect(isNonNegativeDrops('0')).toBe(true)
    expect(isNonNegativeDrops('-1')).toBe(false)
    expect(isNonNegativeDrops('nonsense')).toBe(false)
  })
})

describe('isPositiveDecimalString', () => {
  // Regression: the Send tab used BigInt() on these and threw a SyntaxError
  // on any fractional balance, white-screening the whole tab.
  it('accepts fractional balances that BigInt would reject', () => {
    expect(() => BigInt('10.5')).toThrow()
    expect(isPositiveDecimalString('10.5')).toBe(true)
    expect(isPositiveDecimalString('0.000001')).toBe(true)
  })

  it('rejects zero, negative and malformed values', () => {
    expect(isPositiveDecimalString('0')).toBe(false)
    expect(isPositiveDecimalString('0.000')).toBe(false)
    expect(isPositiveDecimalString('-5')).toBe(false)
    expect(isPositiveDecimalString('')).toBe(false)
    expect(isPositiveDecimalString('abc')).toBe(false)
  })
})

describe('compareDecimalStrings', () => {
  it('orders decimal amounts without float drift', () => {
    expect(compareDecimalStrings('10.5', '10.5')).toBe(0)
    expect(compareDecimalStrings('10.50', '10.5')).toBe(0)
    expect(compareDecimalStrings('2', '10')).toBe(-1)
    expect(compareDecimalStrings('10', '2')).toBe(1)
    expect(compareDecimalStrings('0.1', '0.09')).toBe(1)
    expect(compareDecimalStrings('0.30000000000000004', '0.3')).toBe(1)
  })
})

describe('displayCurrencyCode', () => {
  it('passes through 3-char codes', () => {
    expect(displayCurrencyCode('USD')).toBe('USD')
  })

  it('decodes ASCII hex codes and shortens undecodable ones', () => {
    const hex = Buffer.from('TESTCOIN').toString('hex').toUpperCase().padEnd(40, '0')
    expect(displayCurrencyCode(hex)).toBe('TESTCOIN')
    expect(displayCurrencyCode('FF'.repeat(20))).toContain('…')
  })
})

// The spendable/funds rules the screens used to compute inline. Every row of
// the epic-4 I/O matrix is pinned here, because "identical to the drop" is the
// only acceptance this refactor has.
describe('reserveRequirementDrops', () => {
  it('is the base reserve plus one owner reserve per owned object', () => {
    expect(reserveRequirementDrops('1000000', '200000', 0)).toBe('1000000')
    expect(reserveRequirementDrops('1000000', '200000', 3)).toBe('1600000')
  })
})

describe('spendableAfterReserve', () => {
  it('subtracts the reserve requirement from the balance', () => {
    expect(spendableAfterReserve('10000000', '1600000')).toBe('8400000')
  })

  it('clamps to zero when the balance is below the reserve — never a negative string', () => {
    expect(spendableAfterReserve('500000', '1000000')).toBe('0')
    expect(spendableAfterReserve('0', '1000000')).toBe('0')
  })

  it('is exactly zero when the balance equals the reserve', () => {
    expect(spendableAfterReserve('1000000', '1000000')).toBe('0')
  })

  it('keeps full precision on a balance a float would corrupt', () => {
    expect(spendableAfterReserve('100000000000000001', '1000000')).toBe('99999999999000001')
  })
})

describe('amountPlusFeeFits', () => {
  it('requires the fee on top of the amount', () => {
    expect(amountPlusFeeFits('9000000', '12', '10000000')).toBe(true)
    expect(amountPlusFeeFits('10000000', '12', '10000000')).toBe(false)
  })

  it('accepts the exactly-equal case — inclusive, not an off-by-one rejection', () => {
    expect(amountPlusFeeFits('9999988', '12', '10000000')).toBe(true)
  })

  it('treats a zero spendable balance as affording nothing', () => {
    expect(amountPlusFeeFits('1', '0', '0')).toBe(false)
    expect(amountPlusFeeFits('0', '0', '0')).toBe(true)
  })
})

describe('coversOwnerReserve', () => {
  it('is true when spendable is greater than or equal to one owner reserve', () => {
    expect(coversOwnerReserve('200000', '200000')).toBe(true)
    expect(coversOwnerReserve('200001', '200000')).toBe(true)
    expect(coversOwnerReserve('199999', '200000')).toBe(false)
  })

  it('works against the 200000-drop fallback the trust-line tab uses before reserves load', () => {
    expect(coversOwnerReserve('0', '200000')).toBe(false)
    expect(coversOwnerReserve('5000000', '200000')).toBe(true)
  })
})
