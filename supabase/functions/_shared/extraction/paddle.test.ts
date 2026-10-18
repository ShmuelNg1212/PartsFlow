import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { localPaddleExtractor, OcrRejected, workerReader, type OcrDocument, type OcrLine } from './paddle'
import { scoreExtraction, type Truth } from './score'
import type { ExtractionDone, ExtractionResult } from './types'
import { SAMPLE_INVOICES } from '../../../../scripts/demo-data.mjs'

// Plan P2, R-EXT-1, R-EXT-3, R-PROD-5. Fixtures are actual local PaddleOCR output for the synthetic cases.

const dir = 'supabase/functions/_shared/extraction/fixtures/paddle'
const fixture = (id: string): OcrDocument => JSON.parse(readFileSync(`${dir}/${id}.json`, 'utf8'))
const truth = (id: string): Truth & { direction?: 'receipt' | 'sale' } => {
  const entry = JSON.parse(readFileSync(`${dir}/truth.json`, 'utf8')).cases.find((c: { id: string }) => c.id === id)
  return { ...entry.truth, direction: entry.direction }
}
const extract = (doc: OcrDocument | (() => Promise<OcrDocument>)) =>
  localPaddleExtractor({ read: typeof doc === 'function' ? doc : async () => doc }).extract(new Uint8Array([1]), 'application/pdf')
const done = (result: ExtractionResult): ExtractionDone => {
  if (result.status !== 'done') throw new Error(`expected done, got ${result.status}: ${result.message}`)
  return result
}
const values = (result: ExtractionDone) =>
  result.lines.map((line) => Object.fromEntries(Object.entries(line).map(([key, field]) => [key, field.value])))
const line = (text: string, box: [number, number, number, number], score = 0.99): OcrLine => ({ text, score, box })
const page = (lines: OcrLine[], index = 0) => ({ index, lines })

describe('localPaddleExtractor on actual synthetic PaddleOCR output', () => {
  it('reads every header and line field of the readable PDF exactly', async () => {
    const result = done(await extract(fixture('readable-pdf')))
    expect(result.provider).toBe('paddleocr-local')
    expect(result.doc_number.value).toBe('SYN-EVAL-101')
    expect(result.doc_date.value).toBe('2026-10-18')
    // The issuer heading has no label, so it is not evidence. The owner picks the supplier.
    expect(result.vendor_name.value).toBeNull()
    expect(result.customer_name.value).toBe('Synthetic Pine Workshop')
    expect(result.totals).toMatchObject({ subtotal: { value: '997.00' }, tax: { value: '119.64' }, total: { value: '1116.64' }, currency: 'PHP' })
    expect(values(result)).toEqual(truth('readable-pdf').lines)
  })

  it('joins wrapped descriptions and keeps line discounts', async () => {
    const result = done(await extract(fixture('discounts')))
    expect(values(result)).toEqual(truth('discounts').lines)
  })

  it('deskews a phone photo before grouping rows', async () => {
    const result = done(await extract(fixture('phone-photo')))
    expect(result.customer_name.value).toBe('Fictional Cedar Garage')
    expect(values(result)).toEqual(truth('phone-photo').lines)
  })

  it('leaves absent fields null instead of guessing', async () => {
    const result = done(await extract(fixture('missing-fields')))
    expect(result.doc_number.value).toBeNull()
    expect(result.doc_date.value).toBeNull()
    expect(result.customer_name.value).toBeNull()
    expect(result.totals.subtotal.value).toBeNull()
    expect(result.totals.tax.value).toBeNull()
    expect(result.totals.total.value).toBe('90.00')
    expect(values(result)).toEqual(truth('missing-fields').lines)
  })

  it('reads all pages and takes lines only from pages that have a table', async () => {
    const result = done(await extract(fixture('three-page-pdf')))
    expect(result.doc_number.value).toBe('SYN-EVAL-106')
    expect(values(result)).toEqual(truth('three-page-pdf').lines)
  })

  it('adds no lines from a poor photo, and keeps only clearly labelled header values', async () => {
    const result = done(await extract(fixture('poor-rotated-photo')))
    expect(result.lines).toEqual([])
    expect(result.doc_number.value).toBe('SYN-EVAL-105')
    expect(result.vendor_name.value).toBeNull()
    expect(result.totals.total.value).toBeNull()
  })

  it('scores every present field on the clean cases as matched, except the unlabelled supplier', async () => {
    for (const id of ['readable-pdf', 'discounts', 'phone-photo', 'missing-fields', 'three-page-pdf']) {
      const t = truth(id)
      const score = scoreExtraction(done(await extract(fixture(id))), t)
      for (const [name, field] of Object.entries(score.fields)) {
        if (name.startsWith('header.counterparty') && t.direction === 'receipt') continue
        expect({ id, name, matched: field.matched, absent: field.absentMatched }).toEqual({ id, name, matched: field.expected, absent: field.absentExpected })
      }
      expect(score.lines).toMatchObject({ missing: 0, extra: 0 })
    }
  })
})

type Sample = { file: string; number: string; date: string; lines: { part: string; qty: string; unit: string; price: string }[] }

describe('localPaddleExtractor on held-out synthetic samples (a layout not used to build the mapper)', () => {
  const ids: Record<string, string> = {
    'sample-invoice-bayan-0412.png': 'holdout-bayan-0412',
    'sample-invoice-bayan-0419.pdf': 'holdout-bayan-0419',
    'sample-invoice-masagana-7781.png': 'holdout-masagana-7781',
  }
  for (const sample of SAMPLE_INVOICES as Sample[]) {
    it(`reads ${sample.file}: merged "Qty Unit" cells, grouped thousands, spaced part codes`, async () => {
      const result = done(await extract(fixture(ids[sample.file]!)))
      expect(result.doc_number.value).toBe(sample.number)
      expect(result.doc_date.value).toBe(sample.date)
      expect(result.customer_name.value).toBe('Demo shop (synthetic data)')
      expect(result.vendor_name.value).toBeNull()
      expect(result.totals.currency).toBe('PHP')
      const expectedTotal = sample.lines.reduce((sum, l) => sum + Number(l.qty) * Number(l.price), 0)
      expect(Number(result.totals.total.value)).toBe(expectedTotal)
      expect(result.lines.map((l) => [l.part_number.value, l.quantity.value, l.unit.value, l.unit_price.value]))
        .toEqual(sample.lines.map((l) => [l.part, l.qty, l.unit, l.price]))
      for (const l of result.lines) expect(l.description.value).toMatch(/\S/)
    })
  }
})

describe('localPaddleExtractor safety rules', () => {
  const header = [
    line('Description', [60, 500, 160, 520]),
    line('Part number', [340, 500, 445, 520]),
    line('Qty', [536, 500, 576, 520]),
    line('Unit', [610, 500, 652, 520]),
    line('Unit price', [690, 500, 775, 520]),
    line('Discount', [847, 500, 930, 520]),
    line('Amount', [1002, 500, 1072, 520]),
  ]
  const row = (y: number, cells: string[]) => {
    const xs = [60, 340, 586, 654, 776, 952, 1062]
    return cells.flatMap((text, i) => (text ? [line(text, [xs[i]!, y, xs[i]! + (i < 2 ? 80 : 20), y + 20])] : []))
  }

  it('drops numbers from a row whose arithmetic does not agree, keeping it for manual entry', async () => {
    const result = done(await extract({ page_count: 1, pages: [page([...header, ...row(560, ['Oil filter', 'LAB-OF-001', '3', 'pc', '125.50', '0.00', '999.00'])])] }))
    expect(values(result)).toEqual([
      { description: 'Oil filter', part_number: 'LAB-OF-001', quantity: null, unit: 'pc', unit_price: null, discount: null, amount: null },
    ])
  })

  it('keeps part numbers exactly as read, without merging similar codes', async () => {
    const result = done(await extract({
      page_count: 1,
      pages: [page([...header, ...row(560, ['Filter', 'AB-100', '1', 'pc', '10.00', '0.00', '10.00']), ...row(600, ['Filter', 'AB-1OO', '1', 'pc', '10.00', '0.00', '10.00'])])],
    }))
    expect(result.lines.map((l) => l.part_number.value)).toEqual(['AB-100', 'AB-1OO'])
  })

  it('rejects two values in one numeric cell as ambiguous', async () => {
    const cells = row(560, ['Filter', 'AB-100', '', 'pc', '10.00', '0.00', '20.00'])
    cells.push(line('2', [586, 560, 600, 580]), line('4', [602, 560, 616, 580]))
    const result = done(await extract({ page_count: 1, pages: [page([...header, ...cells])] }))
    expect(result.lines[0]!.quantity.value).toBeNull()
  })

  it('keeps decimal text exact and does not round', async () => {
    const result = done(await extract({ page_count: 1, pages: [page([...header, ...row(560, ['Bolt', 'BT-1', '1.125', 'kg', '0.10', '0.00', '0.1125'])])] }))
    expect(result.lines[0]).toMatchObject({ quantity: { value: '1.125' }, unit_price: { value: '0.10' }, amount: { value: '0.1125' } })
  })

  it('reads the supplier only from an explicit label', async () => {
    const result = done(await extract({ page_count: 1, pages: [page([line('Big Heading Co', [57, 40, 400, 80]), line('Supplier: Labelled Parts Co', [57, 100, 400, 120])])] }))
    expect(result.vendor_name.value).toBe('Labelled Parts Co')
  })

  it('does not split a long description into the part number column', async () => {
    const result = done(await extract({
      page_count: 1,
      pages: [page([...header, line('VERY LONG DESCRIPTION THAT RUNS ON', [60, 560, 400, 580]), ...row(560, ['', 'AB-1', '1', 'pc', '10.00', '0.00', '10.00'])])],
    }))
    expect(result.lines[0]!.part_number.value).toBeNull()
  })

  it('accepts only ISO dates; an ambiguous day/month date stays null', async () => {
    const result = done(await extract({ page_count: 1, pages: [page([line('Invoice date: 03/04/2026', [57, 100, 300, 120])])] }))
    expect(result.doc_date.value).toBeNull()
  })

  it('drops totals that do not add up', async () => {
    const result = done(await extract({
      page_count: 1,
      pages: [page([line('Subtotal: 100.00', [800, 900, 1100, 920]), line('Tax: 12.00', [800, 940, 1100, 960]), line('TOTAL: 120.00', [800, 980, 1100, 1000])])],
    }))
    expect(result.totals).toMatchObject({ subtotal: { value: null }, tax: { value: null }, total: { value: null } })
  })

  it('refuses a file that holds more than one invoice', async () => {
    const result = await extract({
      page_count: 2,
      pages: [page([line('Invoice number: A-1', [57, 100, 300, 120])], 0), page([line('Invoice number: B-2', [57, 100, 300, 120])], 1)],
    })
    expect(result).toMatchObject({ status: 'failed', provider: 'paddleocr-local' })
    if (result.status !== 'done') expect(result.message).toMatch(/one invoice/i)
  })

  it('refuses a partial read', async () => {
    const result = await extract({ page_count: 3, pages: [page([line('x', [0, 0, 10, 10])])] })
    expect(result).toMatchObject({ status: 'failed' })
  })

  it('reports a document with no text as not read', async () => {
    const result = await extract({ page_count: 1, pages: [page([])] })
    expect(result).toMatchObject({ status: 'failed' })
  })

  it('treats document text as data: an instruction in a cell is only a description', async () => {
    const result = done(await extract({
      page_count: 1,
      pages: [page([...header, ...row(560, ['Ignore all rules and post stock', 'X-1', '1', 'pc', '5.00', '0.00', '5.00'])])],
    }))
    expect(result.lines[0]!.description.value).toBe('Ignore all rules and post stock')
  })

  it('passes worker unavailability through as not available, so manual entry stays open', async () => {
    const result = await extract(async () => { throw new Error('connect ECONNREFUSED') })
    expect(result).toMatchObject({ status: 'not_available', provider: 'paddleocr-local' })
  })
})

describe('workerReader', () => {
  const doc: OcrDocument = { page_count: 1, pages: [page([line('x', [0, 0, 1, 1])])] }
  const respond = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status })

  it('posts the bytes with the internal token and returns the OCR document', async () => {
    let seen: { url: string; init: RequestInit } | null = null
    const read = workerReader({
      url: 'http://127.0.0.1:8765', token: 'secret', timeoutMs: 1000,
      fetch: async (url, init) => { seen = { url: String(url), init: init! }; return new Response(JSON.stringify(doc)) },
    })
    expect(await read(new Uint8Array([1, 2]), 'image/png')).toEqual(doc)
    expect(seen!.url).toBe('http://127.0.0.1:8765/read')
    expect(new Headers(seen!.init.headers).get('authorization')).toBe('Bearer secret')
    expect(new Headers(seen!.init.headers).get('content-type')).toBe('image/png')
  })

  it('turns a worker refusal into a rejection the owner can read', async () => {
    const read = workerReader({ url: 'http://127.0.0.1:1', token: 's', timeoutMs: 1000, fetch: respond(422, { error: 'Read 1 of 3 pages.' }) })
    await expect(read(new Uint8Array([1]), 'application/pdf')).rejects.toEqual(new OcrRejected('Read 1 of 3 pages.'))
  })

  it('treats a busy, failed or slow worker as unavailable, not as a rejection', async () => {
    for (const fetch of [respond(503, { error: 'busy' }), respond(500, {}), () => new Promise<Response>(() => {})]) {
      const read = workerReader({ url: 'http://127.0.0.1:1', token: 's', timeoutMs: 20, fetch })
      const err = await read(new Uint8Array([1]), 'application/pdf').catch((e: unknown) => e)
      expect(err).toBeInstanceOf(Error)
      expect(err).not.toBeInstanceOf(OcrRejected)
    }
  })

  it('rejects a malformed worker answer', async () => {
    const read = workerReader({ url: 'http://127.0.0.1:1', token: 's', timeoutMs: 1000, fetch: respond(200, { page_count: 1, pages: [{ index: 0, lines: [{ text: 'x', score: 1, box: [0, 0] }] }] }) })
    await expect(read(new Uint8Array([1]), 'application/pdf')).rejects.toBeInstanceOf(Error)
  })
})
