import { beforeAll, describe, expect, it } from 'vitest'
import { admin, balanceOf, createProduct, expectError, seedShop, type ShopFixture } from './helpers'

// T1.2: opening quantities (R-PROD-3) and product import (R-PROD-2), with audit events (R-DATA-8).

let f: ShopFixture

beforeAll(async () => {
  f = await seedShop()
})

describe('set_opening_quantity (R-PROD-3)', () => {
  it('writes one opening movement and the balance', async () => {
    const productId = await createProduct(f)
    await f.owner.query('select public.set_opening_quantity($1, $2)', [productId, '7.5'])

    expect(await balanceOf(productId)).toBe('7.500')
    const db = await admin()
    const { rows } = await db.query(`select qty::text, source, actor from public.stock_movements where product_id = $1`, [productId])
    expect(rows).toEqual([{ qty: '7.500', source: 'opening', actor: f.ownerId }])
    const audit = await db.query(`select kind from public.audit_events where entity_id = $1 and kind = 'stock.opening'`, [productId])
    expect(audit.rows).toHaveLength(1)
  })

  it('refuses a second opening once the product has movements', async () => {
    const productId = await createProduct(f)
    await f.owner.query('select public.set_opening_quantity($1, $2)', [productId, '3'])
    const err = await expectError(f.owner.query('select public.set_opening_quantity($1, $2)', [productId, '4']))
    expect(err.message).toMatch(/already has stock movements/)
    expect(await balanceOf(productId)).toBe('3.000')
  })

  it('refuses staff and outsiders (R-ROLE-1)', async () => {
    const productId = await createProduct(f)
    for (const actor of [f.staff, f.outsider]) {
      const err = await expectError(actor.query('select public.set_opening_quantity($1, $2)', [productId, '1']))
      expect(err.code).toBe('42501')
    }
    const anonErr = await expectError(f.anon.query('select public.set_opening_quantity($1, $2)', [productId, '1']))
    expect(anonErr.code).toBe('42501')
    expect(await balanceOf(productId)).toBe('0.000')
  })

  it('refuses a negative opening quantity', async () => {
    const productId = await createProduct(f)
    const err = await expectError(f.owner.query('select public.set_opening_quantity($1, $2)', [productId, '-1']))
    expect(err.message).toMatch(/zero or more/)
  })

  it('creates a zero balance row with every new product', async () => {
    const productId = await createProduct(f)
    const { rows } = await f.staff.query('select qty::text from public.product_balances where product_id = $1', [productId])
    expect(rows).toEqual([{ qty: '0.000' }])
  })
})

describe('import_products (R-PROD-2)', () => {
  const row = (n: string, extra: Record<string, unknown> = {}) => ({
    sku: `IMP-${n}`,
    part_number: `0 986 4${n}`,
    description: `Imported part ${n}`,
    brand: 'Bosch',
    base_unit: 'pc',
    selling_price: '250.00',
    reorder_threshold: '2',
    shelf_bin: 'B-3',
    opening_qty: '4',
    ...extra,
  })

  it('writes products and opening movements in one call', async () => {
    const { rows } = await f.owner.query('select public.import_products($1, $2) as result', [
      f.shopId,
      JSON.stringify([row('101'), row('102', { opening_qty: '0' })]),
    ])
    expect(rows[0].result).toMatchObject({ inserted: 2 })

    const db = await admin()
    const products = await db.query(`select id, sku from public.products where shop_id = $1 and sku like 'IMP-10%' order by sku`, [f.shopId])
    expect(products.rows.map((r) => r.sku)).toEqual(['IMP-101', 'IMP-102'])
    expect(await balanceOf(products.rows[0].id)).toBe('4.000')
    expect(await balanceOf(products.rows[1].id)).toBe('0.000')
  })

  it('writes nothing when one row is invalid and names the bad rows', async () => {
    const err = await expectError(
      f.owner.query('select public.import_products($1, $2)', [
        f.shopId,
        JSON.stringify([row('201'), row('202', { selling_price: 'abc' }), row('203', { brand: '' })]),
      ]),
    )
    expect(err.message).toMatch(/2 rows? (are|is) invalid/)
    const detail = JSON.parse(err.detail ?? '[]') as { row: number; errors: string[] }[]
    expect(detail.map((d) => d.row)).toEqual([2, 3])

    const db = await admin()
    const { rows } = await db.query(`select count(*)::int as n from public.products where shop_id = $1 and sku like 'IMP-20%'`, [f.shopId])
    expect(rows[0].n).toBe(0)
  })

  it('rejects a duplicate SKU inside the file', async () => {
    const err = await expectError(
      f.owner.query('select public.import_products($1, $2)', [f.shopId, JSON.stringify([row('301'), row('301', { part_number: 'OTHER' })])]),
    )
    expect(err.message).toMatch(/invalid/)
  })

  it('keeps two brands with the same part number as two products (R-PROD-5)', async () => {
    await f.owner.query('select public.import_products($1, $2)', [
      f.shopId,
      JSON.stringify([
        row('401', { part_number: 'BKR6E', brand: 'NGK' }),
        row('402', { part_number: 'BKR6E', brand: 'Denso' }),
      ]),
    ])
    const db = await admin()
    const { rows } = await db.query(`select brand from public.products where shop_id = $1 and part_number = 'BKR6E' order by brand`, [f.shopId])
    expect(rows.map((r) => r.brand)).toEqual(['Denso', 'NGK'])
  })

  it('refuses staff', async () => {
    const err = await expectError(f.staff.query('select public.import_products($1, $2)', [f.shopId, JSON.stringify([row('501')])]))
    expect(err.code).toBe('42501')
  })
})
