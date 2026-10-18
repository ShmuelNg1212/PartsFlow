import { describe, expect, it } from 'vitest'
import { scoreExtraction, type Truth } from './score'
import type { ExtractionDone } from './types'

const f = (value: string | null) => ({ value, confidence: 0.9 })
const result: ExtractionDone = {
  status: 'done', provider: 'test-provider', doc_number: f('SI-1'), doc_date: f('2026-03-10'),
  vendor_name: f('ACME PARTS'), customer_name: f('Customer'),
  totals: { subtotal: f(null), tax: f(null), total: f('100.00'), currency: 'PHP' },
  lines: [{ description: f('Spark plug'), part_number: f('AB-12'), quantity: f('2'), unit: f('pc'), unit_price: f('50.00'), discount: f(null), amount: f('100.00') }],
}
const truth: Truth = {
  direction: 'receipt', doc_number: 'SI-1', doc_date: '2026-03-10', vendor_name: 'Acme  Parts', total: '100',
  lines: [{ description: 'Spark plug', part_number: 'AB12', quantity: '2.0', unit_price: '50' }],
}

describe('scoreExtraction (R-EXT-2)', () => {
  it('keeps exact codes separate from normalized text comparisons', () => {
    const score = scoreExtraction(result, truth)
    expect(score.fields['line.part_number']).toMatchObject({ matched: 0, expected: 1 })
    expect(score.fields['header.counterparty']).toMatchObject({ matched: 0, expected: 1 })
    expect(score.fields['header.counterparty.normalized']).toMatchObject({ matched: 1, expected: 1 })
    expect(score.fields['line.quantity']).toMatchObject({ matched: 1, expected: 1 })
  })
})

it('does not round large decimals, infer units, or reward absent fields (R-EXT-2)', () => {
  const actual = structuredClone(result)
  actual.lines[0].quantity = f('9007199254740992.01')
  const score = scoreExtraction(actual, { direction: 'sale', customer_name: 'Customer', tax: null, lines: [{ quantity: '9007199254740993.01', unit: 'box', discount: '5', amount: '100.0', part_number: null }] })
  expect(score.fields['line.quantity']).toMatchObject({ matched: 0, expected: 1 })
  expect(score.fields['line.unit']).toMatchObject({ matched: 0, expected: 1 })
  expect(score.fields['line.discount']).toMatchObject({ matched: 0, expected: 1 })
  expect(score.fields['line.amount']).toMatchObject({ matched: 1, expected: 1 })
  expect(score.fields['line.part_number']).toMatchObject({ matched: 0, expected: 0, absentMatched: 0, absentExpected: 1 })
  expect(score.fields['header.tax']).toMatchObject({ matched: 0, expected: 0, absentMatched: 1, absentExpected: 1 })
  expect(score.fields['header.counterparty']).toMatchObject({ matched: 1, expected: 1 })
})

it('counts missing and extra lines without matching an omitted row as absent (R-EXT-2)', () => {
  expect(scoreExtraction(result, { lines: [] }).lines).toEqual({ expected: 0, extracted: 1, missing: 0, extra: 1 })
  const score = scoreExtraction(result, { lines: [{ quantity: '2' }, { quantity: '1', discount: null }] })
  expect(score.lines).toEqual({ expected: 2, extracted: 1, missing: 1, extra: 0 })
  expect(score.fields['line.quantity']).toMatchObject({ matched: 1, expected: 2 })
  expect(score.fields['line.discount']).toMatchObject({ absentExpected: 1, absentMatched: 0 })
})
