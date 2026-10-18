import { expect, it } from 'vitest'
import { evaluateExtractions } from './evaluation'

it('keeps failed and omitted documents in field denominators and labels synthetic limits (R-EXT-2)', () => {
  const cases = [
    { file: 'failed.pdf', truth: { total: '100', lines: [{ quantity: '2' }] } },
    { file: 'omitted.jpg', truth: { total: '200', lines: [{ quantity: '3' }] } },
  ]
  const report = evaluateExtractions(cases, [{ file: 'failed.pdf', status: 'failed', message: 'Unreadable image' }], { synthetic: true, date: '2026-10-18' })
  expect(report.summary).toMatchObject({ documents: 2, read: 0, failed: 1, omitted: 1 })
  expect(report.fields['header.total']).toMatchObject({ matched: 0, expected: 2 })
  expect(report.fields['line.quantity']).toMatchObject({ matched: 0, expected: 2 })
  expect(report.markdown).toContain('Synthetic')
  expect(report.markdown).toContain('0.0% (0/2)')
  expect(report.markdown).toContain('Real-shop accuracy is unknown')
  expect(report.markdown).toContain('Unreadable image')
})

it('does not label known absence or unspecified references as perfect field accuracy (R-EXT-2)', () => {
  const report = evaluateExtractions([{ file: 'empty.pdf', truth: { tax: null, lines: [] } }], [], { synthetic: false, date: '2026-10-18' })
  expect(report.fields['header.tax']).toEqual({ matched: 0, expected: 0, absentMatched: 0, absentExpected: 1, unscored: 0 })
  expect(report.fields['header.total']).toMatchObject({ expected: 0, unscored: 1 })
  expect(report.markdown).toContain('n/a (no present reference values)')
  expect(report.markdown).toContain('Dataset: Real invoices')
  expect(report.markdown).not.toContain('100.0%')
})

it('rejects duplicate or unreferenced results rather than silently dropping documents (R-EXT-2)', () => {
  const entry = { file: 'a.pdf', truth: { lines: [] } }
  const options = { synthetic: true, date: '2026-10-18' }
  expect(() => evaluateExtractions([entry, entry], [], options)).toThrow('unique')
  expect(() => evaluateExtractions([entry], [{ file: 'b.pdf', status: 'failed' }], options)).toThrow('no reference')
  expect(() => evaluateExtractions([entry], [{ file: 'a.pdf', status: 'failed' }, { file: 'a.pdf', status: 'failed' }], options)).toThrow('unique')
})

it('shows all-document accuracy when a successful read has an extra line (R-EXT-2)', () => {
  const field = (value: string | null) => ({ value, confidence: null })
  const line = { description: field(null), part_number: field(null), quantity: field('2'), unit: field(null), unit_price: field(null), discount: field(null), amount: field(null) }
  const result = {
    status: 'done' as const, provider: 'test-provider', doc_number: field(null), doc_date: field(null), vendor_name: field(null), customer_name: field('Buyer'),
    totals: { subtotal: field(null), tax: field(null), total: field('100.00'), currency: null }, lines: [line, line],
  }
  const report = evaluateExtractions([
    { file: 'read.pdf', direction: 'sale', truth: { customer_name: 'Buyer', total: '100', lines: [{ quantity: '2' }] } },
    { file: 'failed.pdf', truth: { total: '200', lines: [{ quantity: '3' }] } },
  ], [{ file: 'read.pdf', status: 'done', result }, { file: 'failed.pdf', status: 'failed' }], { synthetic: true, date: '2026-10-18' })
  expect(report.summary).toEqual({ documents: 2, read: 1, failed: 1, omitted: 0, expectedLines: 2, extractedLines: 2, missingLines: 1, extraLines: 1 })
  expect(report.fields['header.total']).toMatchObject({ matched: 1, expected: 2 })
  expect(report.fields['header.counterparty']).toMatchObject({ matched: 1, expected: 1 })
  expect(report.fields['line.quantity']).toMatchObject({ matched: 1, expected: 2 })
  expect(report.markdown).toContain('50.0% (1/2)')
  expect(report.markdown).toContain('Provider: test-provider.')
})
