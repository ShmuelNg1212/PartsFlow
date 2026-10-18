// R-EXT-2: measured field comparisons. Lines are compared by position.
import type { ExtractionDone } from './types.ts'

type Reference = string | null
export type TruthLine = Partial<Record<'description' | 'part_number' | 'quantity' | 'unit' | 'unit_price' | 'discount' | 'amount', Reference>>
export type Truth = Partial<Record<'doc_number' | 'doc_date' | 'vendor_name' | 'customer_name' | 'subtotal' | 'tax' | 'total' | 'currency', Reference>> & {
  direction?: 'receipt' | 'sale'
  lines: TruthLine[]
}
// Absent reference fields are tracked separately and never increase present-value accuracy.
export type FieldScore = { matched: number; expected: number; absentMatched: number; absentExpected: number; unscored: number }
export type Score = { read: boolean; fields: Record<string, FieldScore>; lines: { expected: number; extracted: number; missing: number; extra: number } }
const normalizedText = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()
const decimal = (value: string) => {
  if (!/^\d+(\.\d+)?$/.test(value)) return null
  const [integer, fraction = ''] = value.split('.')
  const significantFraction = fraction.replace(/0+$/, '')
  return `${integer.replace(/^0+(?=\d)/, '')}${significantFraction ? `.${significantFraction}` : ''}`
}

export function scoreExtraction(result: ExtractionDone | null, truth: Truth): Score {
  const fields: Record<string, FieldScore> = {}
  const add = (name: string, actual: Reference | undefined, expected: Reference | undefined, comparison: 'exact' | 'decimal' | 'text' = 'exact', observed = result !== null) => {
    const field = fields[name] ??= { matched: 0, expected: 0, absentMatched: 0, absentExpected: 0, unscored: 0 }
    if (expected === undefined) { field.unscored++; return }
    if (expected === null) {
      field.absentExpected++
      if (observed && actual === null) field.absentMatched++
      return
    }
    field.expected++
    if (!observed || actual === null || actual === undefined) return
    const transform = comparison === 'decimal' ? decimal : comparison === 'text' ? normalizedText : (value: string) => value
    const reference = transform(expected)
    if (reference !== null && transform(actual) === reference) field.matched++
  }
  add('header.doc_number', result?.doc_number.value, truth.doc_number)
  add('header.doc_date', result?.doc_date.value, truth.doc_date)
  const counterparty = truth.direction === 'sale' ? 'customer_name' : 'vendor_name'
  add('header.counterparty', result?.[counterparty].value, truth[counterparty])
  add('header.counterparty.normalized', result?.[counterparty].value, truth[counterparty], 'text')
  for (const key of ['subtotal', 'tax', 'total'] as const) add(`header.${key}`, result?.totals[key].value, truth[key], 'decimal')
  add('header.currency', result?.totals.currency, truth.currency)
  truth.lines.forEach((line, index) => {
    const actual = result?.lines[index]
    for (const key of ['description', 'part_number', 'quantity', 'unit', 'unit_price', 'discount', 'amount'] as const) {
      add(`line.${key}`, actual?.[key].value, line[key], ['quantity', 'unit_price', 'discount', 'amount'].includes(key) ? 'decimal' : 'exact', !!actual)
    }
    add('line.description.normalized', actual?.description.value, line.description, 'text', !!actual)
    add('line.unit.normalized', actual?.unit.value, line.unit, 'text', !!actual)
  })
  const extracted = result?.lines.length ?? 0
  return { read: result !== null, fields, lines: { expected: truth.lines.length, extracted, missing: Math.max(0, truth.lines.length - extracted), extra: Math.max(0, extracted - truth.lines.length) } }
}
