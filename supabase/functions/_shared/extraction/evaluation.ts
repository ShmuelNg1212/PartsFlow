// Evaluation includes every reference document, even when its read failed or was omitted.
import { scoreExtraction, type FieldScore, type Truth } from './score.ts'
import type { ExtractionDone } from './types.ts'

export type EvaluationCase = { file: string; mime_type?: string; direction?: 'receipt' | 'sale'; expected_outcome?: string; truth: Truth }
export type EvaluationRead = { file: string; status: string; message?: string; result?: ExtractionDone }
const percent = (matched: number, expected: number) => expected ? `${(100 * matched / expected).toFixed(1)}% (${matched}/${expected})` : 'n/a (no present reference values)'
const cell = (value: string) => value.replace(/[\r\n|]/g, ' ')

export function evaluateExtractions(cases: EvaluationCase[], reads: EvaluationRead[], options: { synthetic: boolean; date: string }) {
  if (new Set(cases.map((entry) => entry.file)).size !== cases.length) throw new Error('Reference file names must be unique.')
  if (new Set(reads.map((entry) => entry.file)).size !== reads.length) throw new Error('Read file names must be unique.')
  if (reads.some((read) => !cases.some((entry) => entry.file === read.file))) throw new Error('A read has no reference document.')
  const fields: Record<string, FieldScore> = {}
  const summary = { documents: cases.length, read: 0, failed: 0, omitted: 0, expectedLines: 0, extractedLines: 0, missingLines: 0, extraLines: 0 }
  const documents = cases.map((entry) => {
    const read = reads.find((candidate) => candidate.file === entry.file)
    const result = read?.status === 'done' ? read.result ?? null : null
    if (result) summary.read++
    else if (!read) summary.omitted++
    else summary.failed++
    const score = scoreExtraction(result, { ...entry.truth, direction: entry.truth.direction ?? entry.direction })
    summary.expectedLines += score.lines.expected
    summary.extractedLines += score.lines.extracted
    summary.missingLines += score.lines.missing
    summary.extraLines += score.lines.extra
    for (const [name, scoreField] of Object.entries(score.fields)) {
      const total = fields[name] ??= { matched: 0, expected: 0, absentMatched: 0, absentExpected: 0, unscored: 0 }
      for (const key of ['matched', 'expected', 'absentMatched', 'absentExpected', 'unscored'] as const) total[key] += scoreField[key]
    }
    return { file: entry.file, mime_type: entry.mime_type, expected_outcome: entry.expected_outcome, status: result ? 'done' : read?.status === 'done' ? 'failed' : read?.status ?? 'omitted', message: read?.message ?? (read?.status === 'done' && !result ? 'Read output was omitted.' : undefined), score }
  })
  const markdown = [
    '# Extraction evaluation (measured)', '',
    `Date: ${options.date}. Provider: Azure prebuilt-invoice. Dataset: ${options.synthetic ? 'Synthetic' : 'Real invoices'}.`,
    `Documents: ${summary.documents}; read: ${summary.read}; failed/unavailable: ${summary.failed}; omitted: ${summary.omitted}.`,
    `Lines: expected ${summary.expectedLines}; extracted ${summary.extractedLines}; missing ${summary.missingLines}; extra ${summary.extraLines}.`, '',
    '| Field | Present-value match | Expected absent: correctly absent | Unspecified reference values |',
    '|---|---|---|---|',
    ...Object.entries(fields).map(([name, value]) => `| ${name} | ${percent(value.matched, value.expected)} | ${value.absentMatched}/${value.absentExpected} | ${value.unscored} |`), '',
    '| Document | Status | Expected outcome | Error |', '|---|---|---|---|',
    ...documents.map((entry) => `| ${cell(entry.file)} | ${entry.status} | ${cell(entry.expected_outcome ?? 'extract')} | ${cell(entry.message ?? '')} |`), '',
    'Every reference document is included in the field denominators. Failed and omitted reads earn no matches, including absent-field matches.',
    'Exact text comparisons preserve case, punctuation, and spacing. Only rows marked normalized ignore text case and repeated whitespace. Product codes are never normalized. Decimal values compare without rounding; trailing zeros do not change their value.',
    'Null means a known absent reference field. Omitted reference fields are unscored. Correct absences do not increase present-value accuracy. A missing line is not a correctly absent field.',
    'Lines are compared by position. Missing or extra lines can shift later comparisons. Extra lines are counted separately and must be reviewed.',
    'Counterparty means supplier for receipts and customer for sales. Legacy references without direction use supplier.',
    'The invoice adapter does not extract brand or discount. A printed reference discount counts as a missed value. No brand, discount, product match, or unit conversion is inferred.',
    options.synthetic ? 'Synthetic results test this dataset only. Real-shop accuracy is unknown.' : 'Results apply only to the supplied reference invoices. No broader accuracy claim is established.',
  ].join('\n')
  return { summary, fields, documents, markdown }
}
