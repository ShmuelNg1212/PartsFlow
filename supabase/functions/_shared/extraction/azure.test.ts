import { describe, expect, it } from 'vitest'
import { azureExtractor, mapAzureInvoice } from './azure'
import { normalizeDecimal } from './types'
import fixture from './fixtures/azure-invoice-2024-11-30.json'

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
})

describe('azureExtractor', () => {
  it('posts the file, polls the operation, and maps the result', async () => {
    const calls: string[] = []
    const fake = async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      if (init?.method === 'POST') return new Response(null, { status: 202, headers: { 'operation-location': 'https://x.test/op/1' } })
      return new Response(JSON.stringify(calls.length < 3 ? { status: 'running' } : fixture), { status: 200 })
    }
    const ex = azureExtractor({ endpoint: 'https://x.test/', key: 'k', fetch: fake, pollMs: 1 })
    const result = await ex.extract(new Uint8Array([1, 2, 3]), 'application/pdf')
    expect(calls[0]).toBe('POST https://x.test/documentintelligence/documentModels/prebuilt-invoice:analyze?api-version=2024-11-30')
    expect(result.status).toBe('done')
  })

  it('fails cleanly when Azure refuses or takes too long', async () => {
    const refused = azureExtractor({ endpoint: 'https://x.test', key: 'k', fetch: async () => new Response('no', { status: 401 }), pollMs: 1 })
    expect(await refused.extract(new Uint8Array(), 'image/png')).toMatchObject({ status: 'failed' })
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
    expect(await slow.extract(new Uint8Array(), 'image/png')).toMatchObject({ status: 'failed', message: expect.stringMatching(/too long/) })
  })
})
