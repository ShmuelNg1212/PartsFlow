import { beforeAll, describe, expect, it } from 'vitest'
import { admin, createDraft, createProduct, expectError, seedShop, type ShopFixture } from './helpers'

// T1.1: schema, grants, RLS, and the draft-only edit guard.

let f: ShopFixture
let productId: string

beforeAll(async () => {
  f = await seedShop()
  productId = await createProduct(f)
})

async function markPosted(documentId: string) {
  // Arrange a posted document without the posting function: only a superuser with the ledger flag can do this.
  const db = await admin()
  await db.query('begin')
  await db.query(`select set_config('partsflow.ledger_write', 'on', true)`)
  await db.query(`update public.documents set status = 'posted', posted_at = now() where id = $1`, [documentId])
  await db.query('commit')
}

describe('R-DATA-5 row-level security', () => {
  it('is enabled on every table in public', async () => {
    const db = await admin()
    const { rows } = await db.query(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`)
    expect(rows.map((r) => r.relname)).toEqual([])
  })

  it('shows an outsider no rows of another shop', async () => {
    await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }])
    for (const table of ['shops', 'memberships', 'products', 'documents', 'document_lines', 'product_balances', 'stock_movements', 'audit_events']) {
      const { rows } = await f.outsider.query(`select * from public.${table}`)
      expect(rows, table).toEqual([])
    }
  })

  it('gives anon nothing', async () => {
    for (const table of ['shops', 'products', 'documents']) {
      const err = await expectError(f.anon.query(`select * from public.${table}`))
      expect(err.code, table).toBe('42501') // insufficient_privilege
    }
  })

  it('lets members read their own shop', async () => {
    const { rows } = await f.staff.query('select id from public.products where id = $1', [productId])
    expect(rows).toHaveLength(1)
  })
})

describe('R-ROLE-1 product writes are owner only', () => {
  it('refuses a product insert by staff', async () => {
    const err = await expectError(
      f.staff.query(
        `insert into public.products (shop_id, sku, part_number, description, brand, base_unit, selling_price, reorder_threshold)
         values ($1, 'S-STAFF', 'X1', 'Staff part', 'NGK', 'pc', 1, 0)`,
        [f.shopId],
      ),
    )
    expect(err.code).toBe('42501')
  })

  it('refuses a product update by staff (no row changes)', async () => {
    const res = await f.staff.query(`update public.products set description = 'changed by staff' where id = $1`, [productId])
    expect(res.rowCount).toBe(0)
  })

  it('writes an audit event for a product change (R-DATA-8)', async () => {
    await f.owner.query(`update public.products set shelf_bin = 'A-1' where id = $1`, [productId])
    const db = await admin()
    const { rows } = await db.query(`select kind, actor from public.audit_events where entity_id = $1 order by created_at`, [productId])
    expect(rows.map((r) => r.kind)).toEqual(['product.created', 'product.updated'])
    expect(rows[1].actor).toBe(f.ownerId)
  })

  it('refuses a product in another shop for an outsider', async () => {
    const err = await expectError(
      f.outsider.query(
        `insert into public.products (shop_id, sku, part_number, description, brand, base_unit, selling_price, reorder_threshold)
         values ($1, 'S-OUT', 'X2', 'Outsider part', 'NGK', 'pc', 1, 0)`,
        [f.shopId],
      ),
    )
    expect(err.code).toBe('42501')
  })
})

describe('R-DATA-7 clients cannot write the ledger', () => {
  it.each(['stock_movements', 'product_balances', 'audit_events', 'supplier_aliases'])('refuses inserts into %s', async (table) => {
    const err = await expectError(f.owner.query(`insert into public.${table} default values`))
    expect(err.code).toBe('42501')
  })

  it('refuses a client setting status = posted', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }])
    const err = await expectError(f.owner.query(`update public.documents set status = 'posted' where id = $1`, [documentId]))
    expect(err.code).toBe('42501')
  })

  it('refuses a client writing raw extracted values or the file hash (R-DOC-4, R-POST-9)', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }])
    for (const col of ['raw_doc_number', 'file_sha256', 'posted_by']) {
      const err = await expectError(f.owner.query(`update public.documents set ${col} = null where id = $1`, [documentId]))
      expect(err.code, col).toBe('42501')
    }
    const err = await expectError(f.owner.query(`update public.document_lines set raw = '{}' where document_id = $1`, [documentId]))
    expect(err.code).toBe('42501')
  })

  it('creates documents as draft for staff', async () => {
    const documentId = await createDraft(f.staff, f.shopId, 'sale', [{ productId, quantity: '1' }])
    const { rows } = await f.staff.query('select status, created_by from public.documents where id = $1', [documentId])
    expect(rows[0]).toEqual({ status: 'draft', created_by: f.staffId })
  })
})

describe('R-POST-10 posted documents do not change', () => {
  it('blocks edits to a posted document and its lines', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }])
    await markPosted(documentId)

    // RLS update policy is draft-only, so the header update matches no rows.
    const header = await f.owner.query(`update public.documents set notes = 'x' where id = $1`, [documentId])
    expect(header.rowCount).toBe(0)

    const line = await expectError(f.owner.query(`update public.document_lines set quantity = 9 where document_id = $1`, [documentId]))
    expect(line.message).toMatch(/not a draft/)

    const insert = await expectError(
      f.owner.query(`insert into public.document_lines (document_id, line_no, description, quantity) values ($1, 99, 'late', 1)`, [documentId]),
    )
    expect(insert.message).toMatch(/not a draft/)

    // Delete is filtered by RLS (draft only), so nothing goes.
    const del = await f.owner.query(`delete from public.document_lines where document_id = $1`, [documentId])
    expect(del.rowCount).toBe(0)
    const delDoc = await f.owner.query(`delete from public.documents where id = $1`, [documentId])
    expect(delDoc.rowCount).toBe(0)
  })

  it('blocks a superuser status change without the ledger flag', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }])
    const db = await admin()
    const err = await expectError(db.query(`update public.documents set status = 'posted' where id = $1`, [documentId]))
    expect(err.message).toMatch(/only the posting and reversal functions/i)
  })
})

describe('shop scoping', () => {
  it('rejects a line that points at a product of another shop', async () => {
    const other = await seedShop()
    const otherProduct = await createProduct(other)
    const err = await expectError(createDraft(f.owner, f.shopId, 'sale', [{ productId: otherProduct, quantity: '1' }]))
    expect(err.code).toBe('23503') // foreign_key_violation
  })

  it('keeps line shop_id equal to the document shop', async () => {
    const documentId = await createDraft(f.staff, f.shopId, 'sale', [{ productId, quantity: '1' }])
    const { rows } = await f.staff.query('select shop_id from public.document_lines where document_id = $1', [documentId])
    expect(rows[0].shop_id).toBe(f.shopId)
  })
})
