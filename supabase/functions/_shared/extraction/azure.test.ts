import { describe, expect, it } from 'vitest'
import { azureExtractor, mapAzureInvoice } from './azure'
import { normalizeDecimal } from './types'
import fixture from './fixtures/azure-invoice-2024-11-30.json'
import { PDFDocument } from 'pdf-lib'

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

// T4.4: mapping of the documented prebuilt-invoice response (api-version 2024-11-30) into raw fields.

describe('normalizeDecimal', () => {
  it.each([
    ['₱1,250.50', '1250.50'],
    ['1,250', '1250'],
    ['12 pcs', '12'],
    ['0.10', '0.10'],
    ['3,5', '3.5'],
    ['', null],
    ['abc', null],
    ['-5', null],
  ])('%s → %s', (input, expected) => {
    expect(normalizeDecimal(input)).toBe(expected)
  })
})

describe('mapAzureInvoice', () => {
  const result = mapAzureInvoice(fixture)

  it('maps header fields with confidence', () => {
    expect(result.status).toBe('done')
    if (result.status !== 'done') return
    expect(result.provider).toBe('azure')
    expect(result.doc_number).toEqual({ value: 'SI-20418', confidence: 0.978 })
    expect(result.doc_date).toEqual({ value: '2026-03-10', confidence: 0.96 })
    expect(result.vendor_name.value).toBe('Kalayaan Auto Parts Trading')
    expect(result.totals).toEqual({
      subtotal: { value: '2750.00', confidence: 0.91 },
      tax: { value: '330.00', confidence: 0.9 },
      total: { value: '3080.00', confidence: 0.95 },
      currency: 'PHP',
    })
  })

  it('maps line items from printed text, not floats', () => {
    if (result.status !== 'done') return
    expect(result.lines).toHaveLength(3)
    expect(result.lines[0]).toEqual({
      description: { value: 'Spark Plug Iridium BKR6EIX', confidence: 0.94 },
      part_number: { value: 'BKR6EIX', confidence: 0.92 },
      quantity: { value: '8', confidence: 0.97 },
      unit: { value: 'pc', confidence: 0.85 },
      unit_price: { value: '250.10', confidence: 0.93 },
      discount: { value: null, confidence: null },
      amount: { value: '2000.80', confidence: 0.95 },
    })
  })

  it('marks missing fields as null and keeps low confidence as given', () => {
    if (result.status !== 'done') return
    const third = result.lines[2]!
    expect(third.part_number).toEqual({ value: null, confidence: null })
    expect(third.quantity.confidence).toBe(0.41)
  })

  it('falls back to the float only when no printed text exists', () => {
    if (result.status !== 'done') return
    expect(result.lines[1]!.quantity.value).toBe('2')
  })

  it('reports a response without a document as failed', () => {
    expect(mapAzureInvoice({ status: 'succeeded', analyzeResult: { documents: [] } }).status).toBe('failed')
  })

  it('R-DOC-3: refuses multiple invoices rather than silently dropping every invoice after the first', () => {
    const multi = structuredClone(fixture)
    multi.analyzeResult.documents.push(multi.analyzeResult.documents[0]!)
    expect(mapAzureInvoice(multi)).toMatchObject({ status: 'failed', message: expect.stringMatching(/multiple invoices/i) })
  })
})

describe('azureExtractor', () => {
  it('R-DOC-1: does not trust an image MIME label on a three-page PDF', async () => {
    const pdf = await PDFDocument.create()
    for (let i = 0; i < 3; i++) pdf.addPage()
    let requests = 0
    const ex = azureExtractor({ endpoint: 'https://x.test', key: 'k', fetch: async () => { requests++; return new Response(null, { status: 401 }) } })
    expect(await ex.extract(await pdf.save(), 'image/jpeg')).toMatchObject({ status: 'failed', message: expect.stringMatching(/contents.*type/) })
    expect(requests).toBe(0)
  })
  it('R-DOC-1: sends an intact two-page PDF and keeps an unreadable PDF out of Azure', async () => {
    const pdf = await PDFDocument.create()
    pdf.addPage()
    pdf.addPage()
    const file = await pdf.save()
    const sent: ArrayBuffer[] = []
    const ex = azureExtractor({ endpoint: 'https://x.test', key: 'k', pollMs: 1, fetch: async (_url, init) => {
      if (init?.method === 'POST') {
        sent.push(init.body as ArrayBuffer)
        return new Response(null, { status: 202, headers: { 'operation-location': 'https://x.test/op' } })
      }
      return new Response(JSON.stringify(fixture))
    } })
    expect((await ex.extract(file, 'application/pdf')).status).toBe('done')
    expect(new Uint8Array(sent[0]!)).toEqual(file)
    expect(await ex.extract(new TextEncoder().encode('%PDF-broken'), 'application/pdf')).toMatchObject({ status: 'failed', message: expect.stringMatching(/PDF could not be checked/) })
    expect(sent).toHaveLength(1)
  })

  it('R-DOC-9: does not submit an empty image as an invoice', async () => {
    let requests = 0
    const ex = azureExtractor({ endpoint: 'https://x.test', key: 'k', fetch: async () => { requests++; return new Response(null, { status: 401 }) } })
    expect(await ex.extract(new Uint8Array(), 'image/png')).toMatchObject({ status: 'failed', message: expect.stringMatching(/empty/i) })
    expect(requests).toBe(0)
  })
  it('R-DOC-1: refuses a three-page PDF instead of silently reading only the first two pages', async () => {
    const pdf = await PDFDocument.create()
    for (let i = 0; i < 3; i++) pdf.addPage()
    let requests = 0
    const ex = azureExtractor({ endpoint: 'https://x.test', key: 'k', fetch: async () => { requests++; return new Response(null, { status: 401 }) } })
    expect(await ex.extract(await pdf.save(), 'application/pdf')).toMatchObject({ status: 'not_available', message: expect.stringMatching(/two pages/) })
    expect(requests).toBe(0)
  })

  it('R-DOC-1: rejects files above the F0 size limit before sending any bytes', async () => {
    let requests = 0
    const ex = azureExtractor({ endpoint: 'https://x.test', key: 'k', fetch: async () => { requests++; return new Response(null, { status: 401 }) } })
    expect(await ex.extract(new Uint8Array(4 * 1024 * 1024 + 1), 'image/png')).toMatchObject({ status: 'not_available', message: expect.stringMatching(/4 MB/) })
    expect(requests).toBe(0)
  })

  it('R-DOC-9: keeps unsupported phone images available for manual entry without sending them to Azure', async () => {
    let requests = 0
    const ex = azureExtractor({ endpoint: 'https://x.test', key: 'k', fetch: async () => { requests++; return new Response(null, { status: 401 }) } })
    const result = await ex.extract(new Uint8Array([1]), 'image/webp')
    expect(result).toMatchObject({ status: 'not_available', message: expect.stringMatching(/JPEG.*PNG.*PDF/) })
    expect(requests).toBe(0)
  })

  it('posts the file, polls the operation, and maps the result', async () => {
    const calls: string[] = []
    const fake = async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (init?.method === 'POST') return new Response(null, { status: 202, headers: { 'operation-location': 'https://x.test/op/1' } })
      return new Response(JSON.stringify(calls.length < 3 ? { status: 'running' } : fixture), { status: 200 })
    }
    const ex = azureExtractor({ endpoint: 'https://x.test/', key: 'k', fetch: fake, pollMs: 1 })
    const result = await ex.extract(png, 'image/png')
    expect(calls[0]).toBe('POST https://x.test/documentintelligence/documentModels/prebuilt-invoice:analyze?api-version=2024-11-30')
    expect(result.status).toBe('done')
  })

  it('fails cleanly when Azure refuses or takes too long', async () => {
    const refused = azureExtractor({ endpoint: 'https://x.test', key: 'k', fetch: async () => new Response('no', { status: 401 }), pollMs: 1 })
    expect(await refused.extract(png, 'image/png')).toMatchObject({ status: 'failed' })
    const slow = azureExtractor({
      endpoint: 'https://x.test',
      key: 'k',
      fetch: async (_u, init) =>
        init?.method === 'POST'
          ? new Response(null, { status: 202, headers: { 'operation-location': 'https://x.test/op' } })
          : new Response('{"status":"running"}'),
      pollMs: 1,
      timeoutMs: 20,
    })
    expect(await slow.extract(png, 'image/png')).toMatchObject({ status: 'failed', message: expect.stringMatching(/too long/) })
  })
})
