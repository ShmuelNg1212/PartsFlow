import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, balanceOf, connectAs, createDraft, createProduct, expectError, seedShop, type ShopFixture } from './helpers'

// T1.3: post_document. Test names cite spec rule IDs.

let f: ShopFixture
let supplierId: string
let customerId: string

const post = (actor: ShopFixture['owner'], documentId: string, key: string = randomUUID(), override: string | null = null) =>
  actor.query('select public.post_document($1, $2, $3) as result', [documentId, key, override]).then((r) => r.rows[0].result)

async function stocked(qty: string, extra: Parameters<typeof createProduct>[1] = {}) {
  const productId = await createProduct(f, extra)
  if (qty !== '0') await f.owner.query('select public.set_opening_quantity($1, $2)', [productId, qty])
  return productId
}

beforeAll(async () => {
  f = await seedShop()
  const s = await f.owner.query(`insert into public.counterparties (shop_id, kind, name) values ($1, 'supplier', 'Metro Auto Supply') returning id`, [f.shopId])
  supplierId = s.rows[0].id
  const c = await f.owner.query(`insert into public.counterparties (shop_id, kind, name) values ($1, 'customer', 'Walk-in') returning id`, [f.shopId])
  customerId = c.rows[0].id
})

afterAll(async () => {
  const db = await admin()
  const { rows } = await db.query('select * from public.balance_reconciliation where shop_id = $1', [f.shopId])
  expect(rows, 'cached balances must match the ledger').toEqual([])
})

describe('R-POST-1 drafts never change stock', () => {
  it('a saved draft with lines leaves the balance unchanged', async () => {
    const productId = await stocked('4')
    await createDraft(f.owner, f.shopId, 'sale', [{ productId, quantity: '3' }])
    await createDraft(f.staff, f.shopId, 'receipt', [{ productId, quantity: '9' }])
    expect(await balanceOf(productId)).toBe('4.000')
  })
})

describe('R-POST-3 / R-POST-5 receipts', () => {
  it('receive 5: balance +5 exactly, one movement per line, status posted', async () => {
    const productId = await stocked('0')
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '5' }])
    const result = await post(f.owner, documentId)
    expect(result).toMatchObject({ status: 'posted', already_posted: false })
    expect(await balanceOf(productId)).toBe('5.000')

    const db = await admin()
    const mv = await db.query(`select qty::text, source from public.stock_movements where document_id = $1`, [documentId])
    expect(mv.rows).toEqual([{ qty: '5.000', source: 'document_line' }])
    const doc = await db.query(`select status, posted_by from public.documents where id = $1`, [documentId])
    expect(doc.rows[0]).toEqual({ status: 'posted', posted_by: f.ownerId })
  })

  it('posts the received quantity, not the invoice quantity', async () => {
    const productId = await stocked('0')
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '10', receivedQuantity: '8' }])
    await post(f.owner, documentId)
    expect(await balanceOf(productId)).toBe('8.000')
  })

  it('refuses a receipt line without a confirmed received quantity', async () => {
    const productId = await stocked('0')
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '10', receivedQuantity: null }])
    const err = await expectError(post(f.owner, documentId))
    expect(err.message).toMatch(/received quantity/i)
  })

  it('commits nothing when a later line fails (atomic)', async () => {
    const p1 = await stocked('0')
    const p2 = await stocked('0')
    const db = await admin()
    await db.query(`
      create or replace function public._test_fail_on_product() returns trigger language plpgsql as $$
      begin
        if new.product_id = '${p2}' then raise exception 'forced failure on line 2'; end if;
        return new;
      end $$;
      create trigger _test_fail before insert on public.stock_movements for each row execute function public._test_fail_on_product();`)
    try {
      const documentId = await createDraft(f.owner, f.shopId, 'receipt', [
        { productId: p1, quantity: '5' },
        { productId: p2, quantity: '5' },
      ])
      const err = await expectError(post(f.owner, documentId))
      expect(err.message).toMatch(/forced failure/)
      expect(await balanceOf(p1)).toBe('0.000')
      const doc = await db.query(`select status from public.documents where id = $1`, [documentId])
      expect(doc.rows[0].status).toBe('draft')
      const mv = await db.query(`select count(*)::int as n from public.stock_movements where document_id = $1`, [documentId])
      expect(mv.rows[0].n).toBe(0)
    } finally {
      await db.query(`drop trigger _test_fail on public.stock_movements; drop function public._test_fail_on_product();`)
    }
  })

  it('saves a supplier alias for a confirmed receipt line (R-DOC-8)', async () => {
    const productId = await stocked('0')
    const documentId = await createDraft(
      f.owner,
      f.shopId,
      'receipt',
      [{ productId, quantity: '1', description: '  Spark  Plug BKR6E ' }],
      { counterpartyId: supplierId, docNumber: `ALIAS-${randomUUID().slice(0, 4)}` },
    )
    await post(f.owner, documentId)
    const { rows } = await f.staff.query(
      `select product_id, description_norm from public.supplier_aliases where counterparty_id = $1 and product_id = $2`,
      [supplierId, productId],
    )
    expect(rows).toEqual([{ product_id: productId, description_norm: 'spark plug bkr6e' }])
  })
})

describe('R-POST-4 / R-POST-5 sales', () => {
  it('sell 2: balance −2 exactly', async () => {
    const productId = await stocked('5')
    const documentId = await createDraft(f.owner, f.shopId, 'sale', [{ productId, quantity: '2' }], { counterpartyId: customerId })
    await post(f.owner, documentId)
    expect(await balanceOf(productId)).toBe('3.000')
  })

  it('handles two lines for the same product as one check', async () => {
    const productId = await stocked('3')
    const documentId = await createDraft(f.owner, f.shopId, 'sale', [
      { productId, quantity: '2' },
      { productId, quantity: '2' },
    ])
    const err = await expectError(post(f.owner, documentId))
    expect(err.code).toBe('PF001')
    expect(await balanceOf(productId)).toBe('3.000')
  })
})

describe('R-POST-6 idempotent posting', () => {
  it('post twice with the same key: balance changes once', async () => {
    const productId = await stocked('0')
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '5' }])
    const key = randomUUID()
    await post(f.owner, documentId, key)
    const again = await post(f.owner, documentId, key)
    expect(again).toMatchObject({ status: 'posted', already_posted: true })
    const other = await post(f.owner, documentId, randomUUID())
    expect(other).toMatchObject({ status: 'posted', already_posted: true })
    expect(await balanceOf(productId)).toBe('5.000')
  })

  it('two concurrent posts of one document: balance changes once', async () => {
    const productId = await stocked('0')
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '5' }])
    const a = await connectAs(f.ownerId)
    const b = await connectAs(f.ownerId)

    await a.query('begin')
    await a.query('select public.post_document($1, $2)', [documentId, randomUUID()])
    // b blocks on the document row lock until a commits.
    const bPost = b.query('select public.post_document($1, $2) as result', [documentId, randomUUID()])
    await new Promise((r) => setTimeout(r, 150))
    await a.query('commit')
    const bResult = (await bPost).rows[0].result
    expect(bResult).toMatchObject({ already_posted: true })
    expect(await balanceOf(productId)).toBe('5.000')
  })
})

describe('R-POST-7 concurrent sales cannot oversell', () => {
  it('stock 3, two concurrent sales of 2: one succeeds, one fails, balance 1', async () => {
    const productId = await stocked('3')
    const sale1 = await createDraft(f.owner, f.shopId, 'sale', [{ productId, quantity: '2' }])
    const sale2 = await createDraft(f.owner, f.shopId, 'sale', [{ productId, quantity: '2' }])
    const a = await connectAs(f.ownerId)
    const b = await connectAs(f.ownerId)

    await a.query('begin')
    await a.query('select public.post_document($1, $2)', [sale1, randomUUID()])
    const bPost = b.query('select public.post_document($1, $2)', [sale2, randomUUID()]).then(
      () => null,
      (e: Error & { code?: string }) => e,
    )
    await new Promise((r) => setTimeout(r, 150))
    await a.query('commit')
    const bErr = await bPost
    expect(bErr?.code).toBe('PF001')
    expect(await balanceOf(productId)).toBe('1.000')
  })

  it('races without explicit transactions also end at or above zero', async () => {
    const productId = await stocked('3')
    const docs = await Promise.all([1, 2, 3].map(() => createDraft(f.owner, f.shopId, 'sale', [{ productId, quantity: '2' }])))
    const actors = await Promise.all(docs.map(() => connectAs(f.ownerId)))
    const results = await Promise.allSettled(docs.map((d, i) => actors[i]!.query('select public.post_document($1, $2)', [d, randomUUID()])))
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await balanceOf(productId)).toBe('1.000')
  })
})

describe('R-POST-8 insufficient stock', () => {
  it('blocks the sale and names product, on hand, and requested', async () => {
    const productId = await stocked('1', { sku: `LOW-${randomUUID().slice(0, 4)}`, description: 'Oil filter W 712/75' })
    const documentId = await createDraft(f.owner, f.shopId, 'sale', [{ productId, quantity: '2' }])
    const err = await expectError(post(f.owner, documentId))
    expect(err.code).toBe('PF001')
    expect(err.message).toMatch(/Oil filter W 712\/75/)
    expect(err.message).toMatch(/on hand 1/)
    expect(err.message).toMatch(/requested 2/)
    expect(JSON.parse(err.detail ?? '[]')).toEqual([{ product_id: productId, sku: expect.any(String), description: 'Oil filter W 712/75', on_hand: '1', requested: '2' }])
    expect(await balanceOf(productId)).toBe('1.000')
  })
})

describe('R-POST-9 duplicates', () => {
  it('blocks the same number + counterparty + direction', async () => {
    const productId = await stocked('0')
    const number = `INV-${randomUUID().slice(0, 6)}`
    const first = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }], { docNumber: number, counterpartyId: supplierId })
    await post(f.owner, first)
    const second = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }], { docNumber: ` ${number.toLowerCase()}`, counterpartyId: supplierId })
    const err = await expectError(post(f.owner, second))
    expect(err.code).toBe('PF002')
    expect(await balanceOf(productId)).toBe('1.000')
  })

  it('does not treat a sale with the same number as a duplicate of a receipt', async () => {
    const productId = await stocked('5')
    const number = `INV-${randomUUID().slice(0, 6)}`
    const r = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }], { docNumber: number, counterpartyId: supplierId })
    await post(f.owner, r)
    const s = await createDraft(f.owner, f.shopId, 'sale', [{ productId, quantity: '1' }], { docNumber: number, counterpartyId: supplierId })
    await expect(post(f.owner, s)).resolves.toMatchObject({ status: 'posted' })
  })

  it('blocks the same file hash', async () => {
    const productId = await stocked('0')
    const db = await admin()
    const hash = randomUUID().replaceAll('-', '')
    const first = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }])
    const second = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }])
    await db.query(`update public.documents set file_sha256 = $1 where id in ($2, $3)`, [hash, first, second])
    await post(f.owner, first)
    const err = await expectError(post(f.owner, second))
    expect(err.code).toBe('PF002')
    expect(err.message).toMatch(/same file/i)
  })

  it('owner override with a reason passes and writes an audit event', async () => {
    const productId = await stocked('0')
    const number = `INV-${randomUUID().slice(0, 6)}`
    const first = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }], { docNumber: number, counterpartyId: supplierId })
    await post(f.owner, first)
    const second = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }], { docNumber: number, counterpartyId: supplierId })
    await expect(post(f.owner, second, randomUUID(), '   ')).rejects.toMatchObject({ code: 'PF002' })
    await post(f.owner, second, randomUUID(), 'Supplier reused the invoice number for a second delivery')
    expect(await balanceOf(productId)).toBe('2.000')
    const db = await admin()
    const { rows } = await db.query(`select data from public.audit_events where entity_id = $1 and kind = 'document.duplicate_override'`, [second])
    expect(rows).toHaveLength(1)
    expect(rows[0].data.reason).toMatch(/second delivery/)
  })

  it('staff cannot override (staff cannot post at all)', async () => {
    const productId = await stocked('0')
    const documentId = await createDraft(f.staff, f.shopId, 'receipt', [{ productId, quantity: '1' }])
    const err = await expectError(post(f.staff, documentId, randomUUID(), 'staff reason'))
    expect(err.code).toBe('42501')
  })
})

describe('R-POST-11 unit conversion', () => {
  it('refuses a different unit without a factor', async () => {
    const productId = await stocked('0', { baseUnit: 'pc' })
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '2', unit: 'box' }])
    const err = await expectError(post(f.owner, documentId))
    expect(err.message).toMatch(/conversion factor/i)
  })

  it('factor 10 on 2 boxes adds 20', async () => {
    const productId = await stocked('0', { baseUnit: 'pc' })
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '2', unit: 'box', conversionFactor: '10' }])
    await post(f.owner, documentId)
    expect(await balanceOf(productId)).toBe('20.000')
  })

  it('treats the same unit in another case as the base unit', async () => {
    const productId = await stocked('0', { baseUnit: 'pc' })
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '2', unit: 'PC' }])
    await post(f.owner, documentId)
    expect(await balanceOf(productId)).toBe('2.000')
  })
})

describe('R-DOC-6 lines need a confirmed product', () => {
  it('refuses a line with no product', async () => {
    const productId = await stocked('0')
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [
      { productId, quantity: '1' },
      { productId: null, quantity: '1', description: 'Unknown part' },
    ])
    const err = await expectError(post(f.owner, documentId))
    expect(err.message).toMatch(/line 2/i)
    expect(err.message).toMatch(/product/i)
    expect(await balanceOf(productId)).toBe('0.000')
  })

  it('refuses a document with no lines', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [])
    const err = await expectError(post(f.owner, documentId))
    expect(err.message).toMatch(/no lines/i)
  })
})

describe('R-ROLE-1 only owners post', () => {
  it('refuses staff, outsiders, and anon', async () => {
    const productId = await stocked('0')
    const documentId = await createDraft(f.staff, f.shopId, 'receipt', [{ productId, quantity: '1' }])
    for (const actor of [f.staff, f.outsider, f.anon]) {
      const err = await expectError(post(actor, documentId))
      expect(err.code).toBe('42501')
    }
    expect(await balanceOf(productId)).toBe('0.000')
  })
})
