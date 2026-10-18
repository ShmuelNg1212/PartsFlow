// Local PaddleOCR extractor (plan P2, ADR 0005, R-EXT-1, R-EXT-3). No Deno or npm imports.
// The Python worker returns text lines with boxes. This file maps them to invoice fields
// from explicit evidence only: labels, a detected header row, and row arithmetic.
// Anything missing, ambiguous or inconsistent stays null for the owner to enter.
// OCR text is data. It is never interpreted as an instruction.
import type { ExtractedLine, ExtractionDone, ExtractionResult, Extractor, Field } from './types.ts'

export type OcrLine = { text: string; score: number; box: [number, number, number, number] }
export type OcrPage = { index: number; lines: OcrLine[] }
export type OcrDocument = { page_count: number; pages: OcrPage[] }

/** The worker understood the file and refused it (unsupported, too large, incomplete). */
export class OcrRejected extends Error {}
/** The worker is running but cannot read now (busy, still starting). */
export class OcrBusy extends Error {}

const PROVIDER = 'paddleocr-local'
const LABEL_MIN_SCORE = 0.9
const UNVERIFIED_CAP = 0.5
const MAX_SLOPE = 0.18 // about 10 degrees
const POOR_LINE_SCORE = 0.8
const POOR_PAGE_SHARE = 0.25

export function localPaddleExtractor(deps: { read(file: Uint8Array, mime: string): Promise<OcrDocument> }): Extractor {
  return {
    provider: PROVIDER,
    async extract(file, mime) {
      let doc: OcrDocument
      try {
        doc = await deps.read(file, mime)
      } catch (err) {
        if (err instanceof OcrRejected) return { status: 'failed', provider: PROVIDER, message: err.message }
        if (err instanceof OcrBusy) return { status: 'not_available', provider: PROVIDER, message: `${err.message} Or enter the lines by hand.` }
        return { status: 'not_available', provider: PROVIDER, message: 'The local scanner is not running. Enter the lines by hand.' }
      }
      return mapOcrDocument(doc)
    },
  }
}

type WorkerOptions = { url: string; token: string; timeoutMs: number; fetch?: typeof fetch }

/** Reads a file through the loopback worker. A refusal becomes OcrRejected; anything else is "unavailable". */
export function workerReader({ url, token, timeoutMs, fetch: doFetch = fetch }: WorkerOptions) {
  return async (file: Uint8Array, mime: string): Promise<OcrDocument> => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('OCR worker timed out')) }, timeoutMs)
    })
    try {
      const res = await Promise.race([
        doFetch(`${url}/read`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': mime }, body: new Uint8Array(file), signal: controller.signal }),
        timeout,
      ])
      const body = await Promise.race([res.json().catch(() => null), timeout])
      const message = typeof body?.error === 'string' ? body.error : null
      if (res.status === 422 || res.status === 413) throw new OcrRejected(message ?? 'The file could not be read.')
      if (res.status === 503) throw new OcrBusy(message ?? 'The scanner is busy. Try again shortly.')
      if (!res.ok) throw new Error(`OCR worker answered ${res.status}`)
      if (!isOcrDocument(body)) throw new Error('OCR worker answer is malformed')
      return body
    } finally {
      clearTimeout(timer)
    }
  }
}

const isOcrDocument = (body: unknown): body is OcrDocument => {
  const doc = body as OcrDocument | null
  return !!doc && Number.isInteger(doc.page_count) && Array.isArray(doc.pages) && doc.pages.every((p) =>
    Array.isArray(p?.lines) && p.lines.every((l) =>
      typeof l?.text === 'string' && typeof l.score === 'number' && Array.isArray(l.box) && l.box.length === 4 && l.box.every(Number.isFinite)))
}

const failed = (message: string): ExtractionResult => ({ status: 'failed', provider: PROVIDER, message })
const field = (value: string | null, confidence: number | null = null): Field => ({ value, confidence: value === null ? null : confidence })
const round2 = (n: number) => Math.round(n * 100) / 100

export function mapOcrDocument(doc: OcrDocument): ExtractionResult {
  if (!Array.isArray(doc.pages) || doc.pages.length !== doc.page_count || doc.page_count < 1) {
    return failed('Not every page was read. Enter the lines by hand.')
  }
  if (doc.pages.every((p) => p.lines.length === 0)) return failed('No text was found. Enter the lines by hand.')

  const headers = readLabels(doc.pages)
  if (headers === 'several') return failed('This file seems to hold more than one invoice. Upload one invoice per file.')

  const lines: ExtractedLine[] = []
  for (const page of doc.pages) if (!isPoor(page)) lines.push(...readTable(page))

  const result: ExtractionDone = {
    status: 'done',
    provider: PROVIDER,
    doc_number: headers.doc_number ?? field(null),
    doc_date: headers.doc_date ?? field(null),
    // Only a labelled supplier counts. An unlabelled heading is not evidence of who issued the invoice.
    vendor_name: headers.vendor ?? field(null),
    customer_name: headers.customer ?? field(null),
    totals: checkTotals(headers.subtotal ?? field(null), headers.tax ?? field(null), headers.total ?? field(null), currency(headers)),
    lines,
  }
  return result
}

/** A currency code from "Currency:" or a totals label. Two different codes leave it empty. */
function currency(labels: Labels): string | null {
  const codes = [labels.currency?.value, labels.totalCurrency?.value].filter((c): c is string => !!c)
  return new Set(codes).size === 1 ? codes[0]! : null
}

// ---------- values ----------

const DECIMAL = /^\d+(\.\d+)?$/
const GROUPED = /^\d{1,3}(,\d{3})+(\.\d+)?$/
// Single internal spaces are kept: some makers print codes as "0 986 494 524". Codes are never normalized (R-PROD-5).
const CODE = /^[A-Za-z0-9](?:[A-Za-z0-9\-/.]| (?=[A-Za-z0-9]))*$/

function decimal(text: string): string | null {
  const t = text.trim()
  if (DECIMAL.test(t)) return t
  if (GROUPED.test(t)) return t.replace(/,/g, '')
  return null
}

function isoDate(text: string): string | null {
  const t = text.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  const d = new Date(`${t}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t ? t : null
}

/** Exact decimal as a scaled integer. */
function scaled(value: string): { n: bigint; scale: number } {
  const [i, f = ''] = value.split('.')
  return { n: BigInt(`${i}${f}`), scale: f.length }
}

function rescale(v: { n: bigint; scale: number }, scale: number): bigint {
  return v.n * 10n ** BigInt(scale - v.scale)
}

/** qty * price - discount, rounded half-up to the amount's scale, equals the amount. */
function rowAgrees(qty: string, price: string, discount: string | null, amount: string): boolean {
  const q = scaled(qty), p = scaled(price), a = scaled(amount)
  const d = scaled(discount ?? '0')
  const scale = Math.max(q.scale + p.scale, d.scale, a.scale)
  const net = rescale({ n: q.n * p.n, scale: q.scale + p.scale }, scale) - rescale(d, scale)
  const step = 10n ** BigInt(scale - a.scale)
  const rounded = net >= 0n ? (net + step / 2n) / step : -((-net + step / 2n) / step)
  return rounded === a.n
}

function sumAgrees(parts: string[], total: string): boolean {
  const all = [...parts, total].map(scaled)
  const scale = Math.max(...all.map((v) => v.scale))
  const sum = all.slice(0, -1).reduce((s, v) => s + rescale(v, scale), 0n)
  return sum === rescale(all[all.length - 1]!, scale)
}

function checkTotals(subtotal: Field, tax: Field, total: Field, currency: string | null): ExtractionDone['totals'] {
  if (subtotal.value !== null && tax.value !== null && total.value !== null && !sumAgrees([subtotal.value, tax.value], total.value)) {
    return { subtotal: field(null), tax: field(null), total: field(null), currency }
  }
  return { subtotal, tax, total, currency }
}

// ---------- labelled header values ----------

type Labels = Partial<Record<'doc_number' | 'doc_date' | 'customer' | 'vendor' | 'currency' | 'subtotal' | 'tax' | 'total' | 'totalCurrency', Field>>

const LABELS: { key: keyof Labels; re: RegExp; parse: (v: string) => string | null }[] = [
  { key: 'doc_number', re: /^invoice\s*(?:number|no\.?|#)\s*:?\s*(\S.*)$/i, parse: (v) => (CODE.test(v.trim()) ? v.trim() : null) },
  { key: 'doc_date', re: /^(?:invoice\s+)?date\s*:?\s*(\S.*)$/i, parse: isoDate },
  { key: 'customer', re: /^(?:customer|bill\s+to|sold\s+to)\s*:\s*(\S.*)$/i, parse: (v) => v.trim() || null },
  { key: 'vendor', re: /^(?:supplier|vendor|seller|sold\s+by)\s*:\s*(\S.*)$/i, parse: (v) => v.trim() || null },
  { key: 'currency', re: /^currency\s*:?\s*([A-Za-z]{3})$/i, parse: (v) => (/^[A-Z]{3}$/.test(v) ? v : null) },
  // Amount labels: the word, an optional currency code and rate, an optional colon, then the number.
  { key: 'subtotal', re: /^sub\s*-?\s*total(?:\s+[A-Z]{3})?\s*:?\s*([\d.,]+)$/i, parse: decimal },
  { key: 'tax', re: /^(?:tax|vat)(?:\s+[A-Z]{3})?(?:\s*\(\d+(?:\.\d+)?%\))?\s*:?\s*([\d.,]+)$/i, parse: decimal },
  { key: 'total', re: /^(?:grand\s+)?total(?:\s+[A-Z]{3})?\s*:?\s*([\d.,]+)$/i, parse: decimal },
  { key: 'totalCurrency', re: /^(?:grand\s+)?total\s+([a-z]{3})\s*:?\s*[\d.,]+$/i, parse: (v) => (/^[A-Z]{3}$/.test(v) ? v : null) },
]

const labelOf = (text: string) => LABELS.find((l) => l.re.test(text.trim()))

function readLabels(pages: OcrPage[]): Labels | 'several' {
  const seen = new Map<keyof Labels, Field[]>()
  for (const page of pages) {
    for (const line of page.lines) {
      if (line.score < LABEL_MIN_SCORE) continue
      for (const label of LABELS.filter((l) => l.re.test(line.text.trim()))) {
        const value = label.parse(line.text.trim().match(label.re)![1]!)
        seen.set(label.key, [...(seen.get(label.key) ?? []), field(value, round2(line.score))])
      }
    }
  }
  const labels: Labels = {}
  for (const [key, fields] of seen) {
    const distinct = new Set(fields.map((f) => f.value))
    if (distinct.size === 1) labels[key] = { value: fields[0]!.value, confidence: Math.min(...fields.map((f) => f.confidence ?? 0)) }
    else if (key === 'doc_number' && !distinct.has(null)) return 'several'
    else labels[key] = field(null)
  }
  return labels
}

// ---------- table ----------

type Column = keyof ExtractedLine
const HEADER_WORDS: Record<string, Column> = {
  description: 'description', item: 'description', particulars: 'description', 'item description': 'description',
  'part number': 'part_number', 'part no': 'part_number', 'part #': 'part_number', sku: 'part_number', 'item code': 'part_number',
  qty: 'quantity', quantity: 'quantity',
  unit: 'unit', uom: 'unit',
  'unit price': 'unit_price', price: 'unit_price',
  discount: 'discount', disc: 'discount',
  amount: 'amount', 'line total': 'amount',
}
const NUMERIC: Column[] = ['quantity', 'unit_price', 'discount', 'amount']

const headerColumn = (text: string): Column | undefined =>
  HEADER_WORDS[text.toLowerCase().replace(/[^a-z# ]/g, '').replace(/\s+/g, ' ').trim()]

/** A photo with many low-confidence lines is not used for table lines. */
function isPoor(page: OcrPage): boolean {
  if (page.lines.length === 0) return false
  return page.lines.filter((l) => l.score < POOR_LINE_SCORE).length / page.lines.length > POOR_PAGE_SHARE
}

const cx = (l: OcrLine) => (l.box[0] + l.box[2]) / 2
const cy = (l: OcrLine) => (l.box[1] + l.box[3]) / 2
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!

type Header = { columns: { column: Column; left: number }[]; slope: number; y: number; height: number }

/** Estimated boxes for each word of a line, by character position. */
function words(line: OcrLine): OcrLine[] {
  const [x0, y0, x1, y1] = line.box
  const n = line.text.length || 1
  return [...line.text.matchAll(/\S+/g)].map((m) => ({
    text: m[0],
    score: line.score,
    box: [x0 + ((x1 - x0) * m.index) / n, y0, x0 + ((x1 - x0) * (m.index + m[0].length)) / n, y1] as OcrLine['box'],
  }))
}

/** Header labels, splitting a merged item such as "Qty Unit" only when each word is a label by itself. */
function headerCandidates(page: OcrPage): OcrLine[] {
  return page.lines.flatMap((l) => {
    if (headerColumn(l.text)) return [l]
    const parts = words(l)
    return parts.length > 1 && parts.every((w) => headerColumn(w.text)) ? parts : []
  })
}

function findHeader(page: OcrPage): Header | null {
  const candidates = headerCandidates(page)
  for (const anchor of candidates.filter((l) => headerColumn(l.text) === 'description')) {
    const picked = new Map<Column, OcrLine>([['description', anchor]])
    for (const l of candidates) {
      const column = headerColumn(l.text)!
      if (l === anchor || cx(l) <= cx(anchor) || picked.has(column)) continue
      if (Math.abs((cy(l) - cy(anchor)) / (cx(l) - cx(anchor))) < MAX_SLOPE) picked.set(column, l)
    }
    if (!picked.has('quantity') || !(picked.has('unit_price') || picked.has('amount'))) continue
    const row = [...picked.values()]
    const slope = fitSlope(row)
    const height = median(row.map((l) => l.box[3] - l.box[1]))
    const rotated = row.map((l) => ({ l, ...rotate(cx(l), cy(l), slope) }))
    const y = median(rotated.map((r) => r.y))
    if (rotated.some((r) => Math.abs(r.y - y) > height * 0.6)) continue
    const columns = [...picked.entries()].map(([column, l]) => ({ column, left: rotate(l.box[0], cy(l), slope).x })).sort((a, b) => a.left - b.left)
    return { columns, slope, y, height }
  }
  return null
}

function fitSlope(lines: OcrLine[]): number {
  const xs = lines.map(cx), ys = lines.map(cy)
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i]! - my), 0)
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  return den === 0 ? 0 : num / den
}

/** Rotate a point so the header row becomes horizontal. */
function rotate(x: number, y: number, slope: number) {
  const t = Math.atan(slope), c = Math.cos(t), s = Math.sin(t)
  return { x: x * c + y * s, y: -x * s + y * c }
}

type Placed = { line: OcrLine; x: number; left: number; right: number; y: number }

function readTable(page: OcrPage): ExtractedLine[] {
  const header = findHeader(page)
  if (!header) return []
  const { columns, slope } = header
  const bandOf = (x: number) => {
    let band = 0
    columns.forEach((c, i) => { if (x >= c.left) band = i })
    return band
  }

  const placed: Placed[] = page.lines
    .map((line) => {
      const p = rotate(cx(line), cy(line), slope)
      return { line, x: p.x, y: p.y, left: rotate(line.box[0], cy(line), slope).x, right: rotate(line.box[2], cy(line), slope).x }
    })
    .filter((p) => p.y > header.y + header.height * 0.6)
    .sort((a, b) => a.y - b.y)

  // The table ends at a totals label, a footnote, or a line that spans three or more columns.
  const end = placed.findIndex((p) => labelOf(p.line.text) || p.line.text.trim().startsWith('*') || bandOf(p.right) - bandOf(p.left) >= 2)
  // A fragment that crosses one column boundary ("20 pc") is split by word. Each word goes to the column under its centre.
  const body = (end === -1 ? placed : placed.slice(0, end)).flatMap((p) => {
    if (bandOf(p.left) === bandOf(p.right)) return [p]
    const groups: { band: number; parts: OcrLine[] }[] = []
    for (const w of words(p.line)) {
      const band = bandOf(rotate(cx(w), cy(w), slope).x)
      const last = groups[groups.length - 1]
      if (last?.band === band) last.parts.push(w)
      else groups.push({ band, parts: [w] })
    }
    return groups.map(({ parts }) => {
      const merged: OcrLine = { text: parts.map((w) => w.text).join(' '), score: p.line.score, box: [parts[0]!.box[0], p.line.box[1], parts[parts.length - 1]!.box[2], p.line.box[3]] }
      return { ...p, line: merged, x: rotate(cx(merged), cy(merged), slope).x }
    })
  })

  const clusters: Placed[][] = []
  for (const p of body) {
    const last = clusters[clusters.length - 1]
    if (last && p.y - median(last.map((q) => q.y)) <= header.height * 0.5) last.push(p)
    else clusters.push([p])
  }

  const rows: Row[] = []
  for (const cluster of clusters) {
    const cells = new Map<Column, OcrLine[]>()
    for (const p of cluster.sort((a, b) => a.x - b.x)) {
      const column = columns[bandOf(p.x)]!.column
      cells.set(column, [...(cells.get(column) ?? []), p.line])
    }
    const onlyDescription = [...cells.keys()].every((k) => k === 'description')
    const previous = rows[rows.length - 1]
    // A wrapped description continues the line above.
    if (onlyDescription && previous) previous.wrapped.push(cells.get('description')!)
    else if (!onlyDescription) rows.push({ cells, wrapped: [] })
  }
  return rows.map(toLine)
}

type Row = { cells: Map<Column, OcrLine[]>; wrapped: OcrLine[][] }
const joinText = (lines: OcrLine[]) => lines.map((l) => l.text.trim()).join(' ')

function toLine({ cells, wrapped }: Row): ExtractedLine {
  const conf = (ls: OcrLine[]) => round2(Math.min(...ls.map((l) => l.score)))
  const single = (column: Column, parse: (t: string) => string | null): Field => {
    const ls = cells.get(column)
    if (!ls || ls.length !== 1) return field(null)
    return field(parse(ls[0]!.text), conf(ls))
  }
  const desc = [cells.get('description') ?? [], ...wrapped].filter((ls) => ls.length > 0)
  const line: ExtractedLine = {
    description: desc.length ? field(desc.map(joinText).join('\n') || null, conf(desc.flat())) : field(null),
    part_number: single('part_number', (t) => (CODE.test(t.trim()) ? t.trim() : null)),
    quantity: single('quantity', decimal),
    unit: single('unit', (t) => t.trim() || null),
    unit_price: single('unit_price', decimal),
    discount: single('discount', decimal),
    amount: single('amount', decimal),
  }
  const { quantity: q, unit_price: p, discount: d, amount: a } = line
  if (q.value !== null && p.value !== null && a.value !== null) {
    if (!rowAgrees(q.value, p.value, d.value, a.value)) for (const k of NUMERIC) line[k] = field(null)
  } else {
    // The row cannot be checked, so every number is marked uncertain.
    for (const k of NUMERIC) if (line[k].value !== null) line[k] = field(line[k].value, Math.min(line[k].confidence ?? 0, UNVERIFIED_CAP))
  }
  return line
}
