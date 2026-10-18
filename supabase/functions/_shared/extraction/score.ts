// Per-field accuracy of an extraction against hand-entered truth (plan T4.4, R-EXT-2).
// Lines are compared by position. Report only measured results; never fill in numbers by hand.
import type { ExtractionDone } from './types.ts'

export type TruthLine = { description: string; part_number: string; quantity: string; unit_price: string }
export type Truth = { doc_number: string; doc_date: string; vendor_name: string; total: string; lines: TruthLine[] }

export type Score = {
  header: { doc_number: boolean; doc_date: boolean; vendor_name: boolean; total: boolean }
  lines: { expected: number; extracted: number; description: number; part_number: number; quantity: number; unit_price: number }
}

const text = (v: string | null | undefined) => (v ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
const code = (v: string | null | undefined) => (v ?? '').toUpperCase().replace(/[\s\-./]/g, '')
function num(v: string | null | undefined): string {
  const t = (v ?? '').trim()
  if (!/^\d+(\.\d+)?$/.test(t)) return `x:${t}`
  const [i, d = ''] = t.split('.')
  const frac = d.replace(/0+$/, '')
  return `${String(Number(i))}${frac ? `.${frac}` : ''}`
}

export function scoreExtraction(result: ExtractionDone, truth: Truth): Score {
  const lines = { expected: truth.lines.length, extracted: result.lines.length, description: 0, part_number: 0, quantity: 0, unit_price: 0 }
  truth.lines.forEach((t, i) => {
    const r = result.lines[i]
    if (!r) return
    if (text(r.description.value) === text(t.description)) lines.description++
    if (code(r.part_number.value) === code(t.part_number)) lines.part_number++
    if (num(r.quantity.value) === num(t.quantity)) lines.quantity++
    if (num(r.unit_price.value) === num(t.unit_price)) lines.unit_price++
  })
  return {
    header: {
      doc_number: code(result.doc_number.value) === code(truth.doc_number),
      doc_date: (result.doc_date.value ?? '') === truth.doc_date,
      vendor_name: text(result.vendor_name.value) === text(truth.vendor_name),
      total: num(result.totals.total.value) === num(truth.total),
    },
    lines,
  }
}
