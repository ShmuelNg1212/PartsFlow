import { beforeAll, describe, expect, it } from 'vitest'
import { admin, balanceOf, connectAs, createDraft, createProduct, expectError, seedShop, type ShopFixture } from './helpers'

// T4.3: apply_extraction writes raw values apart from corrected ones (R-DOC-4), never stock (R-POST-1, R-EXT-3),
// and only the service role can call it.

let f: ShopFixture
let productId: string
let service: Awaited<ReturnType<typeof connectAs>>

const field = (value: string | null, confidence: number | null = 0.9) => ({ value, confidence })
const line = (over: Record<string, unknown> = {}) => ({
  description: field('NGK SPARK PLUG BKR6E-11'),
  part_number: field('BKR6E-11'),
  quantity: field('20'),
  unit: field('pc'),
  unit_price: field('95.00'),
  discount: field(null, null),
  amount: field('1900.00'),
  ...over,
})
const result = (over: Record<string, unknown> = {}) => ({
  status: 'done',
  provider: 'demo',
  doc_number: field('BAS-0412'),
  doc_date: field('2026-03-10'),
  vendor_name: field('Bayan Auto Supply (synthetic)'),
  customer_name: field('Demo shop'),
  totals: { subtotal: field(null, null), tax: field(null, null), total: field('7710.00'), currency: 'PHP' },
  lines: [line(), line({ quantity: field('1O', 0.41), unit_price: field('abc') })],
  ...over,
})

const apply = (documentId: string, hash: string, r: object) =>
  service.query('select public.apply_extraction($1, $2, $3) as r', [documentId, hash, JSON.stringify(r)]).then((x) => x.rows[0].r)

beforeAll(async () => {
  f = await seedShop()
  productId = await createProduct(f)
  service = await connectAs(null)
  await service.query('set role service_role')
  await f.owner.query(`insert into public.counterparties (shop_id, kind, name) values ($1, 'supplier', 'Bayan Auto Supply (synthetic)')`, [f.shopId])
})

describe('apply_extraction', () => {
  it('stores raw values and pre-fills only clean corrected values', async () => {
    const documentId = await createDraft(f.staff, f.shopId, 'receipt', [])
    const r = await apply(documentId, 'a'.repeat(64), result())
    expect(r).toEqual({ status: 'done', lines_added: 2 })

    const db = await admin()
    const doc = (
      await db.query(
        `select file_sha256, extraction_provider, extraction_status, raw_doc_number, raw_doc_date, raw_counterparty,
                doc_number, doc_date::text, total_amount::text, counterparty_id is not null as matched
         from public.documents where id = $1`,
        [documentId],
      )
    ).rows[0]
    expect(doc).toEqual({
      file_sha256: 'a'.repeat(64),
      extraction_provider: 'demo',
      extraction_status: 'done',
      raw_doc_number: 'BAS-0412',
      raw_doc_date: '2026-03-10',
      raw_counterparty: 'Bayan Auto Supply (synthetic)',
      doc_number: 'BAS-0412',
      doc_date: '2026-03-10',
      total_amount: '7710.00',
      matched: true,
    })
    const lines = (
      await db.query(
        `select line_no, description, quantity::text, unit_price::text, received_quantity, product_id, raw from public.document_lines where document_id = $1 order by line_no`,
        [documentId],
      )
    ).rows
    expect(lines[0]).toMatchObject({ description: 'NGK SPARK PLUG BKR6E-11', quantity: '20.000', unit_price: '95.00', received_quantity: null, product_id: null })
    // R-DOC-4: unreadable numbers stay empty in the corrected column; the raw text survives.
    expect(lines[1]).toMatchObject({ quantity: null, unit_price: null })
    expect(lines[1].raw.quantity).toEqual({ value: '1O', confidence: 0.41 })
    expect(await balanceOf(productId)).toBe('0.000')
  })

  it('does not overwrite a draft that already has lines or corrected values', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ description: 'typed by hand' }], { docNumber: 'MY-NUMBER' })
    const r = await apply(documentId, 'b'.repeat(64), result())
    expect(r).toEqual({ status: 'done', lines_added: 0 })
    const db = await admin()
    const doc = (await db.query(`select doc_number, raw_doc_number from public.documents where id = $1`, [documentId])).rows[0]
    expect(doc).toEqual({ doc_number: 'MY-NUMBER', raw_doc_number: 'BAS-0412' })
    const n = (await db.query(`select count(*)::int as n from public.document_lines where document_id = $1`, [documentId])).rows[0].n
    expect(n).toBe(1)
  })

  it('records "not available" with the hash and no lines', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [])
    const r = await apply(documentId, 'c'.repeat(64), { status: 'not_available', provider: 'demo', message: 'x' })
    expect(r).toEqual({ status: 'not_available', lines_added: 0 })
    const db = await admin()
    const doc = (await db.query(`select file_sha256, extraction_status from public.documents where id = $1`, [documentId])).rows[0]
    expect(doc).toEqual({ file_sha256: 'c'.repeat(64), extraction_status: 'not_available' })
  })

  it('refuses a posted document', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }])
    await f.owner.query('select public.post_document($1, gen_random_uuid())', [documentId])
    const err = await expectError(apply(documentId, 'd'.repeat(64), result()))
    expect(err.code).toBe('55000')
  })

  it('is not callable by clients (R-DATA-7)', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [])
    const err = await expectError(f.owner.query('select public.apply_extraction($1, $2, $3)', [documentId, 'e'.repeat(64), JSON.stringify(result())]))
    expect(err.code).toBe('42501')
  })

  it('caps the number of lines', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [])
    const many = result({ lines: Array.from({ length: 501 }, () => line()) })
    const err = await expectError(apply(documentId, 'f'.repeat(64), many))
    expect(err.code).toBe('22023')
  })
})
