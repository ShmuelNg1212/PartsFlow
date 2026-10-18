import { describe, expect, it } from 'vitest'
import { scoreExtraction, type Truth } from './score'
import type { ExtractionDone } from './types'

const f = (value: string | null) => ({ value, confidence: 0.9 })
const result: ExtractionDone = {
  status: 'done',
  provider: 'azure',
  doc_number: f('SI-1'),
  doc_date: f('2026-03-10'),
  vendor_name: f('ACME PARTS'),
  customer_name: f(null),
  totals: { subtotal: f(null), tax: f(null), total: f('100.00'), currency: 'PHP' },
  lines: [
    { description: f('Spark plug'), part_number: f('BKR6E'), quantity: f('2'), unit: f('pc'), unit_price: f('50.00'), discount: f(null), amount: f('100.00') },
  ],
}

describe('scoreExtraction', () => {
  it('counts exact matches per field, ignoring case, spacing, and trailing zeros', () => {
    const truth: Truth = {
      doc_number: 'si-1',
      doc_date: '2026-03-11',
      vendor_name: 'Acme  Parts',
      total: '100',
      lines: [
        { description: 'Spark plug', part_number: 'BKR6E', quantity: '2.0', unit_price: '50' },
        { description: 'Missing line', part_number: 'X', quantity: '1', unit_price: '1' },
      ],
    }
    const s = scoreExtraction(result, truth)
    expect(s.header).toEqual({ doc_number: true, doc_date: false, vendor_name: true, total: true })
    expect(s.lines).toEqual({ expected: 2, extracted: 1, description: 1, part_number: 1, quantity: 1, unit_price: 1 })
  })
})
