import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, connectAs, createDraft, createProduct, expectError, seedShop, type Actor, type ShopFixture } from './helpers'

// T6.1: pilot measurement events (spec "Pilot measurement"). Recorded per posted document in audit_events:
// time from first open to post, corrected fields (corrected ≠ raw), and match changes after a suggestion.

let f: ShopFixture
let productA: string
let productB: string
let service: Actor

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
const extraction = {
  status: 'done',
  provider: 'demo',
  doc_number: field('BAS-0412'),
  doc_date: field('2026-03-10'),
  vendor_name: field('Bayan Auto Supply (synthetic)'),
  customer_name: field('Demo shop'),
  totals: { subtotal: field(null, null), tax: field(null, null), total: field('7710.00'), currency: 'PHP' },
  lines: [line(), line({ quantity: field('1O', 0.41), unit_price: field('abc') })],
}

const post = (actor: Actor, documentId: string, key = randomUUID()) =>
  actor.query('select public.post_document($1, $2) as r', [documentId, key]).then((r) => r.rows[0].r)
const opened = (actor: Actor, documentId: string) => actor.query('select public.record_document_opened($1)', [documentId])

async function eventsFor(documentId: string, kind: string) {
  const db = await admin()
  const { rows } = await db.query(`select actor, data, created_at from public.audit_events where entity_id = $1 and kind = $2`, [documentId, kind])
  return rows
}

beforeAll(async () => {
  f = await seedShop()
  productA = await createProduct(f, { brand: 'NGK' })
  productB = await createProduct(f, { brand: 'Denso' })
  service = await connectAs(null)
  await service.query('set role service_role')
  await f.owner.query(`insert into public.counterparties (shop_id, kind, name) values ($1, 'supplier', 'Bayan Auto Supply (synthetic)')`, [f.shopId])
})

describe('record_document_opened', () => {
  it('records the first open of a draft once', async () => {
    const documentId = await createDraft(f.staff, f.shopId, 'receipt', [])
    await opened(f.staff, documentId)
    await opened(f.owner, documentId)
    const rows = await eventsFor(documentId, 'document.opened')
    expect(rows).toHaveLength(1)
    expect(rows[0].actor).toBe(f.staffId)
  })

  it('does nothing for a posted document', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId: productA, quantity: '1' }])
    await post(f.owner, documentId)
    await opened(f.owner, documentId)
    expect(await eventsFor(documentId, 'document.opened')).toHaveLength(0)
  })

  it('refuses outsiders and anon (R-ROLE-1)', async () => {
    const documentId = await createDraft(f.staff, f.shopId, 'receipt', [])
    expect((await expectError(opened(f.outsider, documentId))).code).toBe('42501')
    expect((await expectError(opened(f.anon, documentId))).code).toBe('42501')
    expect(await eventsFor(documentId, 'document.opened')).toHaveLength(0)
  })
})

describe('document.measured on posting', () => {
  it('counts corrected fields, match changes, and the time from first open to post', async () => {
    const documentId = await createDraft(f.staff, f.shopId, 'receipt', [])
    await service.query('select public.apply_extraction($1, $2, $3)', [documentId, 'b'.repeat(64), JSON.stringify(extraction)])
    // Audit events never change, so the first open is written 90 seconds in the past; the app's call then adds nothing.
    const db = await admin()
    await db.query(
      `insert into public.audit_events (shop_id, actor, kind, entity, entity_id, created_at)
       values ($1, $2, 'document.opened', 'document', $3, now() - interval '90 seconds')`,
      [f.shopId, f.staffId, documentId],
    )
    await opened(f.staff, documentId)

    // Line 1: price corrected 95.00 → 90.00; the suggested product kept.
    // Line 2: quantity "1O" → 10 and price "abc" → 95.00 corrected; the suggested product changed to another one.
    const lines = (await f.staff.query('select id, line_no from public.document_lines where document_id = $1 order by line_no', [documentId])).rows
    await f.staff.query(
      `update public.document_lines set unit_price = 90.00, received_quantity = 20, product_id = $2, suggested_product_id = $2 where id = $1`,
      [lines[0].id, productA],
    )
    await f.staff.query(
      `update public.document_lines set quantity = 10, unit_price = 95.00, received_quantity = 10, product_id = $2, suggested_product_id = $3 where id = $1`,
      [lines[1].id, productB, productA],
    )
    await post(f.owner, documentId)

    const rows = await eventsFor(documentId, 'document.measured')
    expect(rows).toHaveLength(1)
    const { open_to_post_seconds, ...data } = rows[0].data
    expect(open_to_post_seconds).toBeGreaterThanOrEqual(89)
    expect(open_to_post_seconds).toBeLessThan(120)
    expect(data).toEqual({
      direction: 'receipt',
      extraction_provider: 'demo',
      extraction_status: 'done',
      lines: 2,
      extracted_lines: 2,
      lines_from_extraction: 2,
      compared_fields: 16,
      corrected_fields: 3,
      suggested_lines: 2,
      match_changes: 1,
    })
    expect(rows[0].actor).toBe(f.ownerId)
  })

  it('treats equal decimals as unchanged and counts a removed value as a correction', async () => {
    const documentId = await createDraft(f.staff, f.shopId, 'receipt', [])
    await service.query('select public.apply_extraction($1, $2, $3)', [documentId, 'c'.repeat(64), JSON.stringify({ ...extraction, doc_number: field('BAS-0413'), lines: [line()] })])
    const [l] = (await f.staff.query('select id from public.document_lines where document_id = $1', [documentId])).rows
    // quantity 20 → 20.000 is the same number; part number removed is a correction.
    await f.staff.query(`update public.document_lines set part_number = null, received_quantity = 20, product_id = $2 where id = $1`, [l.id, productA])
    await post(f.owner, documentId)

    const [row] = await eventsFor(documentId, 'document.measured')
    expect(row.data).toMatchObject({ compared_fields: 10, corrected_fields: 1, suggested_lines: 0, match_changes: 0, open_to_post_seconds: null })
  })

  it('records a hand-entered document with no compared fields', async () => {
    await f.owner.query('select public.set_opening_quantity($1, 5)', [productB]).catch(() => undefined)
    const documentId = await createDraft(f.staff, f.shopId, 'sale', [{ productId: productB, quantity: '1' }])
    await post(f.owner, documentId)
    const [row] = await eventsFor(documentId, 'document.measured')
    expect(row.data).toMatchObject({
      direction: 'sale',
      extraction_status: 'none',
      lines: 1,
      extracted_lines: 0,
      lines_from_extraction: 0,
      compared_fields: 0,
      corrected_fields: 0,
    })
  })

  it('writes one event for a repeated post and none for a reversal', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId: productA, quantity: '2' }])
    const key = randomUUID()
    await post(f.owner, documentId, key)
    await post(f.owner, documentId, key)
    await f.owner.query('select public.reverse_document($1, $2)', [documentId, 'Entered twice'])
    expect(await eventsFor(documentId, 'document.measured')).toHaveLength(1)
  })

  it('refuses a suggested product from another shop', async () => {
    const other = await seedShop()
    const foreign = await createProduct(other)
    const documentId = await createDraft(f.staff, f.shopId, 'receipt', [{ productId: productA }])
    const err = await expectError(
      f.staff.query('update public.document_lines set suggested_product_id = $2 where document_id = $1', [documentId, foreign]),
    )
    expect(err.code).toBe('23503')
  })
})

describe('save_draft keeps the suggested product', () => {
  it('stores suggested_product_id per line', async () => {
    const doc = (await f.staff.query(`insert into public.documents (shop_id, direction) values ($1, 'receipt') returning id, updated_at::text`, [f.shopId])).rows[0]
    await f.staff.query('select public.save_draft($1, $2, $3, $4)', [
      doc.id,
      doc.updated_at,
      '{}',
      JSON.stringify([{ description: 'x', quantity: '1', product_id: productB, suggested_product_id: productA, match_source: 'manual' }]),
    ])
    const db = await admin()
    const { rows } = await db.query('select product_id, suggested_product_id from public.document_lines where document_id = $1', [doc.id])
    expect(rows).toEqual([{ product_id: productB, suggested_product_id: productA }])
  })
})

describe('document_metrics export', () => {
  it('returns one row per measured document for the owner', async () => {
    const { rows } = await f.owner.query('select * from public.document_metrics($1) order by posted_at', [f.shopId])
    expect(rows.length).toBeGreaterThanOrEqual(4)
    const extracted = rows.find((r) => r.corrected_fields === 3)
    expect(extracted).toMatchObject({
      direction: 'receipt',
      doc_number: 'BAS-0412',
      status: 'posted',
      extraction_provider: 'demo',
      compared_fields: 16,
      corrected_fields: 3,
      suggested_lines: 2,
      match_changes: 1,
    })
    expect(Number(extracted.open_to_post_seconds)).toBeGreaterThanOrEqual(89)
    const reversed = rows.find((r) => r.status === 'reversed')
    expect(reversed).toBeDefined()
  })

  it('refuses staff, outsiders, and anon (R-ROLE-1)', async () => {
    for (const actor of [f.staff, f.outsider, f.anon]) {
      const err = await expectError(actor.query('select * from public.document_metrics($1)', [f.shopId]))
      expect(err.code).toBe('42501')
    }
  })
})
