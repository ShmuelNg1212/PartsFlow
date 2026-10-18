import { describe, expect, it } from 'vitest'
import { baseQuantity, formatMoney, formatQty, isDecimalString } from './decimal'

describe('decimal helpers (R-DATA-3)', () => {
  it('multiplies quantity by factor without float error', () => {
    expect(baseQuantity('0.1', '3')).toBe('0.300')
    expect(baseQuantity('2', '10')).toBe('20.000')
    expect(baseQuantity('1', '0.3333335')).toBe('0.333')
  })

  it('formats quantities without trailing zeros', () => {
    expect(formatQty('5.000')).toBe('5')
    expect(formatQty('2.500')).toBe('2.5')
  })

  it('formats money from a decimal string', () => {
    expect(formatMoney('1234.5', 'PHP', 'en-PH')).toBe('₱1,234.50')
    expect(formatMoney('0.1', 'PHP', 'en-PH')).toBe('₱0.10')
  })

  it('validates decimal text with a scale limit', () => {
    expect(isDecimalString('5', 3)).toBe(true)
    expect(isDecimalString('5.125', 3)).toBe(true)
    expect(isDecimalString('5.1255', 3)).toBe(false)
    expect(isDecimalString('abc', 3)).toBe(false)
    expect(isDecimalString('', 3)).toBe(false)
  })
})
