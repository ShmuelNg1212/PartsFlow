// Evaluates Azure prebuilt-invoice against hand-entered truth (plan T4.4, R-EXT-2). Run only with real credentials
// and representative invoices the shop agreed to share. Prints and saves measured per-field accuracy; nothing else.
//
// Usage: AZURE_DOCINTEL_ENDPOINT=... AZURE_DOCINTEL_KEY=... node scripts/eval-extraction.ts <folder>
// The folder holds the invoice files and truth.json: [{ "file": "...", "truth": { doc_number, doc_date, vendor_name, total, lines: [...] } }]
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { azureExtractor } from '../supabase/functions/_shared/extraction/azure.ts'
import { scoreExtraction, type Score, type Truth } from '../supabase/functions/_shared/extraction/score.ts'

const folder = process.argv[2]
const endpoint = process.env.AZURE_DOCINTEL_ENDPOINT
const key = process.env.AZURE_DOCINTEL_KEY
if (!folder || !endpoint || !key) {
  console.error('Usage: AZURE_DOCINTEL_ENDPOINT=... AZURE_DOCINTEL_KEY=... node scripts/eval-extraction.ts <folder>')
  process.exit(1)
}

const cases = JSON.parse(readFileSync(join(folder, 'truth.json'), 'utf8')) as { file: string; truth: Truth }[]
const extractor = azureExtractor({ endpoint, key })
const results: { file: string; status: string; score?: Score }[] = []
for (const c of cases) {
  const bytes = new Uint8Array(readFileSync(join(folder, c.file)))
  const r = await extractor.extract(bytes, c.file.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')
  results.push(r.status === 'done' ? { file: c.file, status: 'done', score: scoreExtraction(r, c.truth) } : { file: c.file, status: r.status })
  console.log(`${c.file}: ${r.status}`)
}

const scored = results.filter((r) => r.score)
const pct = (n: number, d: number) => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}% (${n}/${d})`)
const header = (k: keyof Score['header']) => pct(scored.filter((r) => r.score!.header[k]).length, scored.length)
const lineTotal = scored.reduce((s, r) => s + r.score!.lines.expected, 0)
const line = (k: 'description' | 'part_number' | 'quantity' | 'unit_price') => pct(scored.reduce((s, r) => s + r.score!.lines[k], 0), lineTotal)

const report = [
  `# Extraction evaluation (measured)`,
  ``,
  `Date: ${new Date().toISOString()}. Provider: Azure prebuilt-invoice. Documents: ${cases.length}; read: ${scored.length}.`,
  ``,
  `| Field | Exact match |`,
  `|---|---|`,
  `| Document number | ${header('doc_number')} |`,
  `| Document date | ${header('doc_date')} |`,
  `| Supplier name | ${header('vendor_name')} |`,
  `| Total | ${header('total')} |`,
  `| Line description | ${line('description')} |`,
  `| Line part number | ${line('part_number')} |`,
  `| Line quantity | ${line('quantity')} |`,
  `| Line unit price | ${line('unit_price')} |`,
  ``,
  `Lines are compared by position. A missed or extra line shifts the comparison; check the raw results before drawing conclusions.`,
].join('\n')
writeFileSync(join(folder, 'evaluation.md'), report)
writeFileSync(join(folder, 'evaluation.json'), JSON.stringify(results, null, 2))
console.log(report)
