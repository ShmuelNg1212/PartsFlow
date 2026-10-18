import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, connectAs, createDraft, createProduct, expectError, seedShop, type ShopFixture } from './helpers'

// T3.1 recorded_sales (spec Overview: "Recorded sales", shop timezone) and T3.2 list_members / user_id_by_email.

let f: ShopFixture
let productId: string

async function sale(lines: { quantity: string; unitPrice: string }[], postedAt?: string) {
  const documentId = await createDraft(f.owner, f.shopId, 'sale', lines.map((l) => ({ productId, quantity: l.quantity, unitPrice: l.unitPrice })))
  await f.owner.query('select public.post_document($1, $2)', [documentId, randomUUID()])
  if (postedAt) {
    const db = await admin()
    await db.query('begin')
    await db.query(`select set_config('partsflow.ledger_write', 'on', true)`)
    await db.query('update public.documents set posted_at = $2 where id = $1', [documentId, postedAt])
    await db.query('commit')
  }
  return documentId
}

beforeAll(async () => {
  f = await seedShop()
  productId = await createProduct(f)
  await f.owner.query('select public.set_opening_quantity($1, 100)', [productId])
})

describe('recorded_sales', () => {
  it('sums quantity × price − discount of posted sales on the shop day, as exact text', async () => {
    const db = await admin()
    await db.query(`update public.shops set timezone = 'Asia/Manila' where id = $1`, [f.shopId])
    // 2026-03-10 in Manila runs from 2026-03-09T16:00Z to 2026-03-10T16:00Z.
    await sale([{ quantity: '3', unitPrice: '0.10' }, { quantity: '1', unitPrice: '199.99' }], '2026-03-09T16:30:00Z')
    await sale([{ quantity: '2', unitPrice: '50.00' }], '2026-03-10T15:59:00Z')
    await sale([{ quantity: '9', unitPrice: '1000.00' }], '2026-03-10T16:01:00Z') // next Manila day
    const reversed = await sale([{ quantity: '1', unitPrice: '500.00' }], '2026-03-10T05:00:00Z')
    await f.owner.query('select public.reverse_document($1, $2)', [reversed, 'Test reversal'])

    const { rows } = await f.staff.query(`select public.recorded_sales($1, '2026-03-10') as r`, [f.shopId])
    expect(rows[0].r).toEqual({ day: '2026-03-10', total: '300.29', documents: 2, lines_without_price: 0, currency: 'PHP' })
  })

  it('counts lines without a price instead of guessing', async () => {
    const documentId = await createDraft(f.owner, f.shopId, 'sale', [{ productId, quantity: '1' }])
    const db = await admin()
    await db.query(`update public.document_lines set unit_price = null where document_id = $1`, [documentId])
    await f.owner.query('select public.post_document($1, $2)', [documentId, randomUUID()])
    await db.query('begin')
    await db.query(`select set_config('partsflow.ledger_write', 'on', true)`)
    await db.query(`update public.documents set posted_at = '2026-04-02T02:00:00Z' where id = $1`, [documentId])
    await db.query('commit')
    const { rows } = await f.owner.query(`select public.recorded_sales($1, '2026-04-02') as r`, [f.shopId])
    expect(rows[0].r).toMatchObject({ total: '0.00', documents: 1, lines_without_price: 1 })
  })

  it('refuses outsiders', async () => {
    const err = await expectError(f.outsider.query(`select public.recorded_sales($1, '2026-03-10')`, [f.shopId]))
    expect(err.code).toBe('42501')
  })
})

describe('list_members', () => {
  it('lists members with email and role for any member', async () => {
    const { rows } = await f.staff.query(`select user_id, email, role from public.list_members($1) order by role`, [f.shopId])
    expect(rows.map((r) => [r.user_id, r.role])).toEqual([
      [f.ownerId, 'owner'],
      [f.staffId, 'staff'],
    ])
    expect(rows[0].email).toMatch(/@test\.local$/)
  })

  it('refuses outsiders', async () => {
    const err = await expectError(f.outsider.query(`select * from public.list_members($1)`, [f.shopId]))
    expect(err.code).toBe('42501')
  })
})

describe('user_id_by_email', () => {
  it('is not callable by clients', async () => {
    const err = await expectError(f.owner.query(`select public.user_id_by_email('x@test.local')`))
    expect(err.code).toBe('42501')
  })

  it('finds a user case-insensitively for the service role', async () => {
    const db = await admin()
    const { rows: u } = await db.query('select email from auth.users where id = $1', [f.staffId])
    const service = await connectAs(null)
    await service.query('set role service_role')
    const { rows } = await service.query(`select public.user_id_by_email($1) as id`, [u[0].email.toUpperCase()])
    expect(rows[0].id).toBe(f.staffId)
  })
})

describe('shop settings (D1)', () => {
  it('lets owners change name, currency, timezone and refuses staff', async () => {
    const ok = await f.owner.query(`update public.shops set name = 'Renamed', currency = 'USD', timezone = 'UTC' where id = $1`, [f.shopId])
    expect(ok.rowCount).toBe(1)
    const staff = await f.staff.query(`update public.shops set name = 'Staff rename' where id = $1`, [f.shopId])
    expect(staff.rowCount).toBe(0)
    const flag = await expectError(f.owner.query(`update public.shops set is_demo = true where id = $1`, [f.shopId]))
    expect(flag.code).toBe('42501')
  })

  it('rejects an unknown time zone', async () => {
    const err = await expectError(f.owner.query(`update public.shops set timezone = 'Mars/Olympus' where id = $1`, [f.shopId]))
    expect(err.code).toBe('22023')
  })
})
