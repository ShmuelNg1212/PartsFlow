import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, balanceOf, createDraft, createProduct, expectError, seedShop, type ShopFixture } from './helpers'

// save_draft: one transaction per save (R-DOC-10), RLS applies, raw values survive (R-DOC-4), drafts never move stock (R-POST-1).

let f: ShopFixture
let productId: string

const save = (actor: ShopFixture['owner'], documentId: string, expected: string, header: object, lines: object[]) =>
  actor
    .query('select public.save_draft($1, $2, $3, $4) as result', [documentId, expected, JSON.stringify(header), JSON.stringify(lines)])
    .then((r) => r.rows[0].result as { updated_at: string; line_ids: string[] })

async function updatedAt(documentId: string) {
  const db = await admin()
  const { rows } = await db.query(`select updated_at::text from public.documents where id = $1`, [documentId])
  return rows[0].updated_at as string
}

async function lines(documentId: string) {
  const db = await admin()
  const { rows } = await db.query(
    `select line_no, description, quantity::text, received_quantity::text, product_id, raw from public.document_lines where document_id = $1 order by line_no`,
    [documentId],
  )
  return rows
}

beforeAll(async () => {
  f = await seedShop()
  productId = await createProduct(f)
})

describe('save_draft', () => {
  it('saves header and lines as staff, with exact decimals, and leaves stock alone', async () => {
    const documentId = await createDraft(f.staff, f.shopId, 'receipt', [])
    const result = await save(f.staff, documentId, await updatedAt(documentId), { doc_number: 'INV-77', doc_date: '2026-10-18', notes: 'Back door' }, [
      { description: 'Spark plug', quantity: '0.1', received_quantity: '0.1', product_id: productId, match_source: 'manual' },
      { description: 'Unknown', quantity: '3', received_quantity: null, product_id: null },
    ])
    expect(result.line_ids).toHaveLength(2)
    const rows = await lines(documentId)
    expect(rows.map((r) => [r.line_no, r.description, r.quantity, r.received_quantity])).toEqual([
      [1, 'Spark plug', '0.100', '0.100'],
      [2, 'Unknown', '3.000', null],
    ])
    const db = await admin()
    const doc = await db.query(`select doc_number, doc_date::text, notes from public.documents where id = $1`, [documentId])
    expect(doc.rows[0]).toEqual({ doc_number: 'INV-77', doc_date: '2026-10-18', notes: 'Back door' })
    expect(await balanceOf(productId)).toBe('0.000')
  })

  it('reorders, edits, and deletes lines in one save', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'sale', [{ description: 'A' }, { description: 'B' }, { description: 'C' }])
    const ids = (await f.owner.query(`select id from public.document_lines where document_id = $1 order by line_no`, [documentId])).rows.map((r) => r.id)
    await save(f.owner, documentId, await updatedAt(documentId), {}, [
      { id: ids[2], description: 'C edited', quantity: '1' },
      { id: ids[0], description: 'A', quantity: '2' },
      { description: 'D new', quantity: '5' },
    ])
    const rows = await lines(documentId)
    expect(rows.map((r) => [r.line_no, r.description])).toEqual([
      [1, 'C edited'],
      [2, 'A'],
      [3, 'D new'],
    ])
  })

  it('keeps raw extracted values of existing lines (R-DOC-4)', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ description: 'Raw line' }])
    const db = await admin()
    await db.query(`update public.document_lines set raw = '{"description":{"value":"RAW TEXT","confidence":0.6}}' where document_id = $1`, [documentId])
    const lineId = (await db.query(`select id from public.document_lines where document_id = $1`, [documentId])).rows[0].id
    await save(f.owner, documentId, await updatedAt(documentId), {}, [{ id: lineId, description: 'Corrected text', quantity: '1' }])
    const rows = await lines(documentId)
    expect(rows[0].description).toBe('Corrected text')
    expect(rows[0].raw.description.value).toBe('RAW TEXT')
  })

  it('refuses a stale save (someone else saved first)', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [])
    const before = await updatedAt(documentId)
    await save(f.staff, documentId, before, { notes: 'first' }, [])
    const err = await expectError(save(f.owner, documentId, before, { notes: 'second' }, []))
    expect(err.code).toBe('PF004')
  })

  it('refuses a posted document', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }])
    await f.owner.query('select public.post_document($1, $2)', [documentId, randomUUID()])
    const err = await expectError(save(f.owner, documentId, await updatedAt(documentId), { notes: 'late' }, []))
    expect(err.code).toBe('55000')
  })

  it('refuses outsiders', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [])
    const err = await expectError(save(f.outsider, documentId, await updatedAt(documentId), { notes: 'x' }, []))
    expect(err.code).toBe('42501')
  })

  it('names the line with a bad number', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [])
    const err = await expectError(save(f.owner, documentId, await updatedAt(documentId), {}, [{ description: 'x', quantity: '1' }, { description: 'y', quantity: '1,5' }]))
    expect(err.code).toBe('22023')
    expect(err.message).toMatch(/Line 2/)
  })

  it('refuses a line id from another document', async () => {
    const a = await createDraft(f.owner, f.shopId, 'receipt', [{ description: 'A' }])
    const b = await createDraft(f.owner, f.shopId, 'receipt', [])
    const lineA = (await f.owner.query(`select id from public.document_lines where document_id = $1`, [a])).rows[0].id
    const err = await expectError(save(f.owner, b, await updatedAt(b), {}, [{ id: lineA, description: 'stolen' }]))
    expect(err.code).toBe('22023')
    expect((await lines(a))[0].description).toBe('A')
  })
})
