import { describe, expect, it, vi } from 'vitest'
import type { Extractor } from '../_shared/extraction/types'
import { handleExtract, type ExtractDeps } from './handler'

// T4.3: JWT check, membership, server-side hash, raw write only (via apply_extraction), never stock.

const SHOP = '11111111-1111-4111-8111-111111111111'
const DOC = '22222222-2222-4222-8222-222222222222'
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const extractor = (result: Awaited<ReturnType<Extractor['extract']>> | Error): Extractor => ({
  provider: 'demo',
  extract: vi.fn(async () => {
    if (result instanceof Error) throw result
    return result
  }),
})

const done = { status: 'done', provider: 'demo', lines: [] } as unknown as Awaited<ReturnType<Extractor['extract']>>

function deps(over: Partial<ExtractDeps> = {}): ExtractDeps {
  return {
    getUserFromToken: vi.fn(async (t: string) => (t === 'good' ? { id: USER } : null)),
    getDocument: vi.fn(async () => ({ id: DOC, shop_id: SHOP, status: 'draft', file_path: `${SHOP}/${DOC}/invoice.png`, file_mime: 'image/png' })),
    isMember: vi.fn(async () => true),
    download: vi.fn(async () => new Uint8Array([1, 2, 3])),
    sha256: vi.fn(async () => 'f'.repeat(64)),
    extractor: extractor(done),
    apply: vi.fn(async () => ({ status: 'done', lines_added: 4 })),
    ...over,
  }
}

const req = (body: unknown, authorization: string | null = 'Bearer good') => ({ method: 'POST', authorization, body })

describe('handleExtract', () => {
  it('needs a session', async () => {
    expect((await handleExtract(req({ document_id: DOC }, null), deps())).status).toBe(401)
    expect((await handleExtract(req({ document_id: DOC }, 'Bearer bad'), deps())).status).toBe(401)
  })

  it('needs a valid document id', async () => {
    expect((await handleExtract(req({ document_id: 'x' }), deps())).status).toBe(400)
  })

  it('hides documents of other shops', async () => {
    const d = deps({ isMember: vi.fn(async () => false) })
    expect((await handleExtract(req({ document_id: DOC }), d)).status).toBe(404)
    expect(d.download).not.toHaveBeenCalled()
  })

  it('refuses a posted document', async () => {
    const d = deps({ getDocument: vi.fn(async () => ({ id: DOC, shop_id: SHOP, status: 'posted', file_path: `${SHOP}/${DOC}/a.png`, file_mime: 'image/png' })) })
    expect((await handleExtract(req({ document_id: DOC }), d)).status).toBe(409)
  })

  it('refuses a file path outside the document folder', async () => {
    const d = deps({ getDocument: vi.fn(async () => ({ id: DOC, shop_id: SHOP, status: 'draft', file_path: `${SHOP}/other/a.png`, file_mime: 'image/png' })) })
    expect((await handleExtract(req({ document_id: DOC }), d)).status).toBe(400)
    expect(d.download).not.toHaveBeenCalled()
  })

  it('hashes on the server, extracts, and applies raw results', async () => {
    const d = deps()
    const res = await handleExtract(req({ document_id: DOC }), d)
    expect(res).toEqual({ status: 200, body: { status: 'done', provider: 'demo', lines_added: 4, message: null } })
    expect(d.sha256).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]))
    expect(d.apply).toHaveBeenCalledWith(DOC, 'f'.repeat(64), done)
  })

  it('records an extractor crash as failed, still with the hash', async () => {
    const d = deps({ extractor: extractor(new Error('provider key wrong')), apply: vi.fn(async () => ({ status: 'failed', lines_added: 0 })) })
    const res = await handleExtract(req({ document_id: DOC }), d)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ status: 'failed', lines_added: 0 })
    expect(JSON.stringify(res.body)).not.toMatch(/provider key/)
    expect(d.apply).toHaveBeenCalledWith(DOC, 'f'.repeat(64), expect.objectContaining({ status: 'failed' }))
  })

  it('passes the not-available message through', async () => {
    const d = deps({
      extractor: extractor({ status: 'not_available', provider: 'demo', message: 'Enter the lines by hand.' }),
      apply: vi.fn(async () => ({ status: 'not_available', lines_added: 0 })),
    })
    const res = await handleExtract(req({ document_id: DOC }), d)
    expect(res.body).toMatchObject({ status: 'not_available', message: 'Enter the lines by hand.' })
  })
})
