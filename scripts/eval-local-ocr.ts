// Usage: OCR_WORKER_TOKEN=... node scripts/eval-local-ocr.ts [case-directory] [report.md]
// Sends every synthetic case to the running local OCR worker and writes the measured report (plan P2).
// Two sets: the generated cases (used while building the mapper) and the bundled demo samples (held out).
// Reads come from actual PaddleOCR inference. No fixture or canned result is used here.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { evaluateExtractions, type EvaluationCase, type EvaluationRead } from '../supabase/functions/_shared/extraction/evaluation.ts'
import { localPaddleExtractor, workerReader } from '../supabase/functions/_shared/extraction/paddle.ts'
import Decimal from 'decimal.js'
import { SAMPLE_INVOICES } from './demo-data.mjs'

const dir = process.argv[2] ?? '/private/tmp/partsflow-extraction-cases'
const out = process.argv[3] ?? '/private/tmp/partsflow-paddle-eval.md'
const token = process.env.OCR_WORKER_TOKEN
if (!token) throw new Error('Set OCR_WORKER_TOKEN to the token the worker was started with.')

const reference = JSON.parse(readFileSync(join(dir, 'truth.json'), 'utf8')) as { synthetic: boolean; cases: (EvaluationCase & { id: string })[] }
if (!reference.synthetic) throw new Error('This runner is for the synthetic case set only.')

const extractor = localPaddleExtractor({
  read: workerReader({ url: process.env.OCR_WORKER_URL ?? 'http://127.0.0.1:8765', token, timeoutMs: 120_000 }),
})

type Sample = { file: string; format: string; supplier: string; number: string; date: string; lines: { wording: string; part: string; qty: string; unit: string; price: string }[] }
const heldOut: EvaluationCase[] = (SAMPLE_INVOICES as Sample[]).map((s) => {
  const lines = s.lines.map((l) => ({ description: l.wording, part_number: l.part, quantity: l.qty, unit: l.unit, unit_price: l.price, amount: new Decimal(l.qty).times(l.price).toFixed(2) }))
  return {
    file: s.file, mime_type: s.format === 'pdf' ? 'application/pdf' : 'image/png', direction: 'receipt', expected_outcome: 'extract',
    truth: { doc_number: s.number, doc_date: s.date, vendor_name: s.supplier, customer_name: 'Demo shop (synthetic data)', currency: 'PHP', subtotal: null, tax: null,
      total: lines.reduce((sum, l) => sum.plus(l.amount), new Decimal(0)).toFixed(2), lines },
  }
})

async function run(cases: EvaluationCase[], folder: string, title: string) {
  const reads: EvaluationRead[] = []
  const timings: string[] = []
  for (const entry of cases) {
    const started = performance.now()
    const result = await extractor.extract(new Uint8Array(readFileSync(join(folder, entry.file))), entry.mime_type ?? 'application/octet-stream')
    const seconds = ((performance.now() - started) / 1000).toFixed(1)
    timings.push(`| ${entry.file} | ${result.status} | ${result.status === 'done' ? result.lines.length : 0} | ${seconds} |`)
    reads.push(result.status === 'done' ? { file: entry.file, status: 'done', result } : { file: entry.file, status: result.status, message: result.message })
    console.log(entry.file, result.status, `${seconds}s`)
  }
  const report = evaluateExtractions(cases, reads, { synthetic: true, date: new Date().toISOString().slice(0, 10) })
  return { reads, report, markdown: [`## ${title}`, '', report.markdown.replace(/^# .*\n\n/, ''), '', '| Document | Status | Lines | Seconds |', '|---|---|---|---|', ...timings, ''].join('\n') }
}

const built = await run(reference.cases, dir, 'Generated cases (used while building the mapper)')
const held = await run(heldOut, 'public/samples', 'Bundled demo samples (held out; a different layout)')
writeFileSync(out, ['# Local PaddleOCR extraction evaluation (measured)', '', built.markdown, held.markdown].join('\n'))
writeFileSync(out.replace(/\.md$/, '.json'), JSON.stringify({ built: { reads: built.reads, summary: built.report.summary }, heldOut: { reads: held.reads, summary: held.report.summary } }, null, 1))
console.log(`Report: ${out}`)
