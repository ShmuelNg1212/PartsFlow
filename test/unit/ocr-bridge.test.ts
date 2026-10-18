import { describe, expect, it, vi } from 'vitest'
import { checkDevConfig, makeBridgeHandler, DEV_PROJECT_REF } from '../../scripts/ocr-bridge-lib'
import type { ExtractDeps } from '../../supabase/functions/extract-document/handler'
import type { ExtractionResult, Extractor } from '../../supabase/functions/_shared/extraction/types'

// Plan P3, ADR 0002, R-EXT-3, R-DATA-6. The local bridge reuses handleExtract; these tests cover its own gate and wiring.

const devEnv = {
  VITE_SUPABASE_URL: `https://${DEV_PROJECT_REF}.supabase.co`,
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
  SUPABASE_PROJECT_REF: DEV_PROJECT_REF,
  SUPABASE_DB_URL: `postgresql://postgres.${DEV_PROJECT_REF}:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`,
  OCR_WORKER_TOKEN: 'w'.repeat(48),
}

describe('checkDevConfig', () => {
  it('accepts the development project', () => {
    expect(checkDevConfig(devEnv).supabaseUrl).toBe(devEnv.VITE_SUPABASE_URL)
  })

  it.each([
    ['a production URL', { VITE_SUPABASE_URL: 'https://piijtyewolwrnfimmhnf.supabase.co' }],
    ['a production project ref', { SUPABASE_PROJECT_REF: 'piijtyewolwrnfimmhnf' }],
    ['a database URL for another project', { SUPABASE_DB_URL: 'postgresql://postgres.piijtyewolwrnfimmhnf:pw@host:5432/postgres' }],
    ['a database URL that only mentions the ref in its password', { SUPABASE_DB_URL: `postgresql://postgres.piijtyewolwrnfimmhnf:${DEV_PROJECT_REF}@host:5432/postgres` }],
    ['a missing worker token', { OCR_WORKER_TOKEN: '' }],
    ['a short worker token', { OCR_WORKER_TOKEN: 'short' }],
    ['a non-loopback worker URL', { OCR_WORKER_URL: 'http://10.0.0.5:8765' }],
  ])('refuses %s', (_, change) => {
    expect(() => checkDevConfig({ ...devEnv, ...change })).toThrow()
  })
})

const DOC = '11111111-1111-4111-8111-111111111111'
const SHOP = '22222222-2222-4222-8222-222222222222'
const done: ExtractionResult = {
  status: 'done', provider: 'paddleocr-local',
  doc_number: { value: 'A-1', confidence: 0.99 }, doc_date: { value: null, confidence: null },
  vendor_name: { value: null, confidence: null }, customer_name: { value: null, confidence: null },
  totals: { subtotal: { value: null, confidence: null }, tax: { value: null, confidence: null }, total: { value: null, confidence: null }, currency: null },
  lines: [],
}

function setup(over: Partial<ExtractDeps> = {}, extractor: Extractor = { provider: 'paddleocr-local', extract: async () => done }) {
  const apply = vi.fn(async (_id: string, _sha: string, result: ExtractionResult) => ({ status: result.status, lines_added: 0 }))
  const seenTokens: string[] = []
  const handler = makeBridgeHandler({
    allowedOrigins: ['http://localhost:5173'],
    workerHealth: async () => true,
    makeDeps: (token) => {
      seenTokens.push(token)
      return {
        getUserFromToken: async (t) => (t === 'good' ? { id: 'user-1' } : null),
        getDocument: async (id) => (id === DOC ? { id: DOC, shop_id: SHOP, status: 'draft', file_path: `${SHOP}/${DOC}/a.pdf`, file_mime: 'application/pdf' } : null),
        isMember: async () => true,
        download: async () => new Uint8Array([1]),
        sha256: async () => 'a'.repeat(64),
        extractor,
        apply,
        ...over,
      }
    },
  })
  const post = (body: unknown, headers: Record<string, string | undefined> = {}) =>
    handler({ method: 'POST', path: '/extract', origin: 'http://localhost:5173', authorization: 'Bearer good', rawBody: JSON.stringify(body), ...headers })
  return { handler, post, apply, seenTokens }
}

describe('makeBridgeHandler', () => {
  it('reads a draft through the local extractor and applies the result server-side', async () => {
    const { post, apply, seenTokens } = setup()
    const res = await post({ document_id: DOC })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'done', provider: 'paddleocr-local' })
    expect(apply).toHaveBeenCalledWith(DOC, 'a'.repeat(64), done)
    expect(seenTokens).toEqual(['good'])
  })

  it('refuses an expired session', async () => {
    const { post, apply } = setup()
    expect((await post({ document_id: DOC }, { authorization: 'Bearer expired' })).status).toBe(401)
    expect(apply).not.toHaveBeenCalled()
  })

  it("answers 404 for another shop's document", async () => {
    const { post } = setup({ isMember: async () => false })
    expect((await post({ document_id: DOC })).status).toBe(404)
  })

  it('refuses a posted document', async () => {
    const { post } = setup({ getDocument: async () => ({ id: DOC, shop_id: SHOP, status: 'posted', file_path: `${SHOP}/${DOC}/a.pdf`, file_mime: 'application/pdf' }) })
    expect((await post({ document_id: DOC })).status).toBe(409)
  })

  it('refuses a file path outside the document folder', async () => {
    const { post } = setup({ getDocument: async () => ({ id: DOC, shop_id: SHOP, status: 'draft', file_path: `other/${DOC}/a.pdf`, file_mime: 'application/pdf' }) })
    expect((await post({ document_id: DOC })).status).toBe(400)
  })

  it('records "not available" when the scanner is down, leaving manual entry open', async () => {
    const { post, apply } = setup({}, { provider: 'paddleocr-local', extract: async () => ({ status: 'not_available', provider: 'paddleocr-local', message: 'The local scanner is not running. Enter the lines by hand.' }) })
    const res = await post({ document_id: DOC })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'not_available', message: expect.stringMatching(/by hand/) })
    expect(apply.mock.calls[0]![2].status).toBe('not_available')
  })

  it('refuses another browser origin', async () => {
    const { post } = setup()
    expect((await post({ document_id: DOC }, { origin: 'https://evil.example' })).status).toBe(403)
  })

  it('answers CORS preflight only for an allowed origin', async () => {
    const { handler } = setup()
    const ok = await handler({ method: 'OPTIONS', path: '/extract', origin: 'http://localhost:5173', authorization: undefined, rawBody: '' })
    expect(ok.status).toBe(204)
    expect(ok.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
    const bad = await handler({ method: 'OPTIONS', path: '/extract', origin: 'https://evil.example', authorization: undefined, rawBody: '' })
    expect(bad.status).toBe(403)
  })

  it('refuses an oversized request body', async () => {
    const { post } = setup()
    expect((await post({ document_id: DOC, pad: 'x'.repeat(5000) })).status).toBe(413)
  })

  it('reports readiness without a session', async () => {
    const { handler } = setup()
    const res = await handler({ method: 'GET', path: '/health', origin: undefined, authorization: undefined, rawBody: '' })
    expect(res).toMatchObject({ status: 200, body: { bridge: true, scanner: true } })
  })

  it('answers 404 for other paths', async () => {
    const { handler } = setup()
    expect((await handler({ method: 'POST', path: '/other', origin: undefined, authorization: 'Bearer good', rawBody: '{}' })).status).toBe(404)
  })
})
