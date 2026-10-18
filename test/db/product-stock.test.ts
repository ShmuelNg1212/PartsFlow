import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createDraft, createProduct, seedShop, type ShopFixture } from './helpers'

// product_stock view and search_products (R-PROD-4, R-STOCK-1, D3).

let f: ShopFixture
let plug: string
let filter: string

beforeAll(async () => {
  f = await seedShop()
  plug = await createProduct(f, { sku: 'SP-001', partNumber: 'BKR6E-11', brand: 'NGK', description: 'Spark plug', reorderThreshold: '4' })
  filter = await createProduct(f, { sku: 'OF-002', partNumber: 'W 712/75', brand: 'Mann-Filter', description: 'Oil filter', reorderThreshold: '2' })
  await f.owner.query('select public.set_opening_quantity($1, 4)', [plug])
  await f.owner.query('select public.set_opening_quantity($1, 10)', [filter])
  const s = await f.owner.query(`insert into public.counterparties (shop_id, kind, name) values ($1, 'supplier', 'Metro') returning id`, [f.shopId])
  const doc = await createDraft(f.owner, f.shopId, 'receipt', [{ productId: filter, quantity: '1', description: 'MANN OELFILTER SPECIAL' }], {
    counterpartyId: s.rows[0].id,
    docNumber: 'X1',
  })
  await f.owner.query('select public.post_document($1, $2)', [doc, randomUUID()])
})

describe('product_stock', () => {
  it('shows quantity as text and the low-stock flag (D3: at or below threshold)', async () => {
    const { rows } = await f.staff.query(`select sku, qty, is_low from public.product_stock where shop_id = $1 order by sku`, [f.shopId])
    expect(rows).toEqual([
      { sku: 'OF-002', qty: '11', is_low: false },
      { sku: 'SP-001', qty: '4', is_low: true },
    ])
  })

  it('shows nothing to outsiders', async () => {
    const { rows } = await f.outsider.query(`select * from public.product_stock where shop_id = $1`, [f.shopId])
    expect(rows).toEqual([])
  })
})

describe('search_products (R-PROD-4)', () => {
  const search = async (q: string) =>
    (await f.staff.query(`select sku from public.search_products($1, $2)`, [f.shopId, q])).rows.map((r) => r.sku)

  it.each([
    ['SP-001', 'SKU'],
    ['bkr6e11', 'normalized part number'],
    ['spark', 'description'],
    ['mann', 'brand'],
    ['oelfilter', 'confirmed supplier alias'],
  ])('finds %s by %s', async (q) => {
    expect((await search(q)).length).toBeGreaterThan(0)
  })

  it('returns everything for an empty query', async () => {
    expect(await search('')).toEqual(['OF-002', 'SP-001'])
  })

  it('refuses outsiders', async () => {
    await expect(f.outsider.query(`select * from public.search_products($1, 'spark')`, [f.shopId])).rejects.toMatchObject({ code: '42501' })
  })
})
