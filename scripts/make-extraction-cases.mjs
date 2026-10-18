// Usage: node scripts/make-extraction-cases.mjs [output-directory]
// Writes synthetic evaluation documents and truth.json outside this checkout.
// No OCR runs here. These documents do not establish real invoice accuracy.
import { mkdirSync, realpathSync, existsSync, writeFileSync, statSync } from 'node:fs'
import { dirname, resolve, join, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import Decimal from 'decimal.js'
import { chromium } from '@playwright/test'

const repo = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'))
const requested = resolve(process.argv[2] ?? '/private/tmp/partsflow-extraction-cases')
if (process.argv.length > 3 || process.argv[2]?.startsWith('-')) {
  throw new Error('Usage: node scripts/make-extraction-cases.mjs [output-directory]')
}
function canonicalDestination(path) {
  if (existsSync(path)) return realpathSync(path)
  return join(canonicalDestination(dirname(path)), relative(dirname(path), path))
}
const out = canonicalDestination(requested)
const within = relative(repo, out)
let ancestor = out
let insideRepository = false
while (true) {
  if (existsSync(join(ancestor, '.git'))) insideRepository = true
  const parent = dirname(ancestor)
  if (parent === ancestor) break
  ancestor = parent
}
if (insideRepository || within === '' || (!within.startsWith('..') && !isAbsolute(within))) {
  throw new Error('Choose an output directory outside the repository. Generated files must not be committed.')
}
mkdirSync(out, { recursive: true })
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const money = (value) => new Decimal(value).toFixed(2)
function line(description, part_number, quantity, unit_price, discount = '0.00') {
  return { description, part_number, quantity, unit: 'pc', unit_price: money(unit_price), discount,
    amount: new Decimal(quantity).times(unit_price).minus(discount).toFixed(2) }
}
function invoice(doc_number, lines, overrides = {}) {
  const subtotal = lines.reduce((sum, item) => sum.plus(item.amount), new Decimal(0)).toFixed(2)
  const tax = new Decimal(subtotal).times('0.12').toFixed(2)
  return { doc_number, doc_date: '2026-10-18', vendor_name: 'Fictional Orbit Parts Lab',
    customer_name: 'Synthetic Pine Workshop', currency: 'PHP', subtotal, tax,
    total: new Decimal(subtotal).plus(tax).toFixed(2), lines, ...overrides }
}
const cases = [
  { id: 'readable-pdf', file: 'readable-invoice.pdf', mime_type: 'application/pdf', direction: 'receipt',
    truth: invoice('SYN-EVAL-101', [line('Oil filter, model A', 'LAB-OF-001', '3', '125.50'), line('Air filter, model B', 'LAB-AF-002', '2', '310.25')]) },
  { id: 'phone-photo', file: 'phone-photo.jpg', mime_type: 'image/jpeg', direction: 'sale', photo: 'phone',
    truth: invoice('SYN-EVAL-102', [line('Brake pad set', 'LAB-BP-030', '2', '850.75')], { vendor_name: 'Synthetic Pine Workshop', customer_name: 'Fictional Cedar Garage' }) },
  { id: 'missing-fields', file: 'missing-fields.pdf', mime_type: 'application/pdf', direction: 'receipt',
    truth: invoice(null, [{ ...line('Unmarked rubber seal', 'unused', '4', '22.50'), part_number: null }], { doc_date: null, customer_name: null, tax: null, subtotal: null, total: '90.00' }) },
  { id: 'discounts', file: 'multi-line-discounts.pdf', mime_type: 'application/pdf', direction: 'receipt',
    truth: invoice('SYN-EVAL-104', [line('Drive belt, reinforced\nFor fictional engine series Z', 'LAB-DB-041', '2', '780.25', '80.50'), line('Spark plug\nPack sold as individual pieces', 'LAB-SP-018', '6', '95.10', '20.60'), line('Coolant hose', 'LAB-CH-020', '1', '399.99', '0.00')]) },
  { id: 'poor-rotated-photo', file: 'poor-rotated-photo.jpg', mime_type: 'image/jpeg', direction: 'receipt', photo: 'poor',
    truth: invoice('SYN-EVAL-105', [line('Wheel bearing', 'LAB-WB-008', '2', '625.40'), line('Hub seal', 'LAB-HS-009', '2', '73.85')]) },
  { id: 'three-page-pdf', file: 'three-page-invoice.pdf', mime_type: 'application/pdf', direction: 'receipt', pages: 3,
    expected_outcome: 'extract', truth: invoice('SYN-EVAL-106', [line('Test axle bushing', 'LAB-AB-010', '1', '210.00')]) },
]
function sheet(inv, pageNumber = 1, pages = 1) {
  const field = (label, value) => value === null ? '' : `<div>${label}: <strong>${esc(value)}</strong></div>`
  return `<section class="sheet"><div class="label">SYNTHETIC TEST INVOICE</div>
    <p class="notice">Invented data. Not a real business or tax document. Do not enter into live stock.</p>
    <h1>${esc(inv.vendor_name)}</h1><div class="meta">${field('Invoice number', inv.doc_number)}${field('Invoice date', inv.doc_date)}${field('Customer', inv.customer_name)}<div>Currency: ${esc(inv.currency)}</div></div>
    ${pageNumber === 1 ? `<table><thead><tr><th>Description</th><th>Part number</th><th>Qty</th><th>Unit</th><th>Unit price</th><th>Discount*</th><th>Amount</th></tr></thead><tbody>${inv.lines.map((item) => `<tr>${['description', 'part_number', 'quantity', 'unit', 'unit_price', 'discount', 'amount'].map((key) => `<td>${item[key] === null ? '' : esc(item[key]).replaceAll('\n', '<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <p class="small">* Discount is a line total in PHP. Amount is after the line discount.</p><div class="totals">${field('Subtotal PHP', inv.subtotal)}${field('Tax PHP (12%)', inv.tax)}${field('TOTAL PHP', inv.total)}</div>` : `<p>Continuation page ${pageNumber}. No additional invoice lines or amounts.</p><p>This three-page document tests complete page coverage.</p>`}
    <footer>SYNTHETIC EVALUATION ONLY · Page ${pageNumber} of ${pages}</footer></section>`
}
function html(testCase) {
  const photo = testCase.photo
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0}body{font-family:Arial,sans-serif;color:#161616;background:#fff;font-size:14px}
    .sheet{width:794px;min-height:1122px;padding:48px 40px;position:relative;background:#fff;break-after:page}.sheet:last-child{break-after:auto}
    .label{font-size:23px;font-weight:700;border:3px solid #9a2323;color:#9a2323;padding:12px;letter-spacing:1px}
    .notice{font-size:12px;color:#713535;line-height:1.5}h1{font-size:26px;margin:38px 0 20px}.meta{line-height:1.9}
    table{width:100%;border-collapse:collapse;margin-top:30px;font-size:12px}th,td{text-align:left;padding:12px 5px;border-bottom:1px solid #777;vertical-align:top}th{font-size:11px;background:#eee}td:first-child{width:26%;line-height:1.5}td:nth-child(n+3){text-align:right}
    .small{font-size:10px}.totals{text-align:right;line-height:2;margin-top:28px;font-size:16px}.totals>div:last-child{font-size:20px;border-top:2px solid #333;margin-top:8px}footer{position:absolute;bottom:44px;left:40px;font-size:12px;color:#713535}
    ${photo ? `body{width:1100px;height:1440px;overflow:hidden;background:#6e7276}.scene{padding:140px 150px}.sheet{transform-origin:50% 50%;transform:${photo === 'poor' ? 'rotate(-12deg) perspective(1800px) rotateY(-8deg)' : 'rotate(4deg) perspective(1800px) rotateY(5deg)'};box-shadow:8px 18px 24px #2228;${photo === 'poor' ? 'filter:blur(1.1px) contrast(.68) brightness(.9);' : ''}}` : ''}
    @page{size:A4;margin:0}
  </style></head><body><main class="${photo ? 'scene' : ''}">${Array.from({ length: testCase.pages ?? 1 }, (_, i) => sheet(testCase.truth, i + 1, testCase.pages ?? 1)).join('')}</main></body></html>`
}
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1440 }, deviceScaleFactor: 1 })
  for (const testCase of cases) {
    const source = html(testCase)
    writeFileSync(join(out, `${testCase.id}.html`), source)
    await page.setContent(source, { waitUntil: 'load' })
    const path = join(out, testCase.file)
    if (testCase.photo) await page.screenshot({ path, type: 'jpeg', quality: testCase.photo === 'poor' ? 42 : 88 })
    else await page.pdf({ path, format: 'A4', printBackground: true, preferCSSPageSize: true })
    if (statSync(path).size >= 4 * 1024 * 1024) throw new Error(`Case exceeds 4 MiB: ${testCase.file}`)
    console.log(`${testCase.file}: ${statSync(path).size} bytes`)
  }
} finally {
  await browser.close()
}
writeFileSync(join(out, 'truth.json'), JSON.stringify({ schema_version: 1, synthetic: true,
  description: 'Synthetic ground truth only. No provider results or measured OCR accuracy.',
  cases: cases.map(({ photo, pages, ...testCase }) => ({ ...testCase, expected_outcome: testCase.expected_outcome ?? 'extract' })) }, null, 2) + '\n')
console.log(`Wrote ${cases.length} synthetic cases and truth.json to ${out}`)
