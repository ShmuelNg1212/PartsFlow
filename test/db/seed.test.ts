import { beforeAll, describe, expect, it } from 'vitest'
import { PRODUCTS, SUPPLIERS } from '../../scripts/demo-data.mjs'
import { seedDemoShop, seedLiveShop } from '../../scripts/seed-lib.mjs'
import { admin, createUser } from './helpers'

// T5.1: demo shop seed and live shop seed. R-DEMO-1, R-PROD-5, R-PROD-3.

let ownerId: string
let staffId: string
let demoShopId: string

beforeAll(async () => {
  ownerId = await createUser('demo-owner')
  staffId = await createUser('demo-staff')
  const db = await admin()
  demoShopId = (await seedDemoShop(db, { ownerId, staffId })).shopId
})

describe('seedDemoShop (R-DEMO-1)', () => {
  it('creates a demo shop with an owner and a staff member', async () => {
    const db = await admin()
    const shop = await db.query('select is_demo, name from public.shops where id = $1', [demoShopId])
    expect(shop.rows[0].is_demo).toBe(true)
    expect(shop.rows[0].name).toMatch(/synthetic/i)
    const roles = await db.query('select user_id, role from public.memberships where shop_id = $1 order by role', [demoShopId])
    expect(roles.rows).toEqual([
      { user_id: ownerId, role: 'owner' },
      { user_id: staffId, role: 'staff' },
    ])
  })

  it('loads the synthetic catalog with opening quantities as opening movements', async () => {
    const db = await admin()
    const { rows } = await db.query(
      `select p.sku, b.qty::text as qty from public.products p join public.product_balances b on b.product_id = p.id
       where p.shop_id = $1 order by p.sku`,
      [demoShopId],
    )
    expect(rows).toHaveLength(PRODUCTS.length)
    expect(rows[0]).toEqual({ sku: 'DM-0001', qty: '48.000' })
    const sources = await db.query(`select distinct source, actor from public.stock_movements where shop_id = $1`, [demoShopId])
    expect(sources.rows).toEqual([{ source: 'opening', actor: ownerId }])
  })

  it('keeps same-part-number pairs from different brands as separate products (R-PROD-5)', async () => {
    const db = await admin()
    const { rows } = await db.query(
      `select part_number, array_agg(brand order by brand) as brands from public.products
       where shop_id = $1 group by part_number having count(*) > 1 order by part_number`,
      [demoShopId],
    )
    expect(rows).toEqual([
      { part_number: 'BP-1503', brands: ['Akebono', 'Bendix'] },
      { part_number: 'C-1012', brands: ['Sakura', 'VIC'] },
      { part_number: 'H4-12V-60/55W', brands: ['Osram', 'Philips'] },
    ])
  })

  it('creates the two synthetic suppliers', async () => {
    const db = await admin()
    const { rows } = await db.query(`select name from public.counterparties where shop_id = $1 and kind = 'supplier' order by name`, [demoShopId])
    expect(rows.map((r) => r.name)).toEqual([...SUPPLIERS].sort())
  })

  it('is safe to run again: no duplicate shop, products, suppliers, or movements', async () => {
    const db = await admin()
    const again = await seedDemoShop(db, { ownerId, staffId })
    expect(again).toEqual({ shopId: demoShopId, productsInserted: 0 })
    const counts = await db.query(
      `select (select count(*) from public.products where shop_id = $1)::int as products,
              (select count(*) from public.counterparties where shop_id = $1)::int as suppliers,
              (select count(*) from public.stock_movements where shop_id = $1)::int as movements,
              (select count(*) from public.shops where is_demo and name = (select name from public.shops where id = $1))::int as shops`,
      [demoShopId],
    )
    const withStock = PRODUCTS.filter((p) => Number(p[8]) > 0).length
    expect(counts.rows[0]).toEqual({ products: PRODUCTS.length, suppliers: SUPPLIERS.length, movements: withStock, shops: 1 })
  })

  it('leaves the client role unchanged after seeding', async () => {
    const db = await admin()
    const { rows } = await db.query(`select current_user as role, coalesce(current_setting('request.jwt.claims', true), '') as claims`)
    expect(rows[0].role).not.toBe('authenticated')
    expect(rows[0].claims).toBe('')
  })
})

describe('seedLiveShop (R-DEMO-1)', () => {
  it('creates a live shop with its owner and no products', async () => {
    const db = await admin()
    const liveOwner = await createUser('live-owner')
    const shopId = await seedLiveShop(db, { name: 'Live seed test shop', ownerId: liveOwner })
    const shop = await db.query('select is_demo, currency, timezone from public.shops where id = $1', [shopId])
    expect(shop.rows[0]).toEqual({ is_demo: false, currency: 'PHP', timezone: 'Asia/Manila' })
    const members = await db.query('select user_id, role from public.memberships where shop_id = $1', [shopId])
    expect(members.rows).toEqual([{ user_id: liveOwner, role: 'owner' }])
    const products = await db.query('select count(*)::int as n from public.products where shop_id = $1', [shopId])
    expect(products.rows[0].n).toBe(0)

    expect(await seedLiveShop(db, { name: 'Live seed test shop', ownerId: liveOwner })).toBe(shopId)
  })
})
