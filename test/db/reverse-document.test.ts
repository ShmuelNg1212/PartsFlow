import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, balanceOf, createDraft, createProduct, expectError, seedShop, type ShopFixture } from './helpers'

// T1.4: reverse_document (R-POST-10, D4, D5).

let f: ShopFixture

const post = (documentId: string) => f.owner.query('select public.post_document($1, $2)', [documentId, randomUUID()])
const reverse = (actor: ShopFixture['owner'], documentId: string, reason: string | null) =>
  actor.query('select public.reverse_document($1, $2) as result', [documentId, reason]).then((r) => r.rows[0].result)

async function stocked(qty: string) {
  const productId = await createProduct(f)
  if (qty !== '0') await f.owner.query('select public.set_opening_quantity($1, $2)', [productId, qty])
  return productId
}

beforeAll(async () => {
  f = await seedShop()
})

afterAll(async () => {
  const db = await admin()
  const { rows } = await db.query('select * from public.balance_reconciliation where shop_id = $1', [f.shopId])
  expect(rows).toEqual([])
})

describe('R-POST-10 reversal', () => {
  it('restores the balance from before the receipt', async () => {
    const productId = await stocked('2')
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '5' }])
    await post(documentId)
    expect(await balanceOf(productId)).toBe('7.000')
    const result = await reverse(f.owner, documentId, 'Wrong supplier invoice')
    expect(result).toMatchObject({ status: 'reversed' })
    expect(await balanceOf(productId)).toBe('2.000')
  })

  it('restores the balance from before a sale', async () => {
    const productId = await stocked('5')
    const documentId = await createDraft(f.owner, f.shopId, 'sale', [{ productId, quantity: '2' }])
    await post(documentId)
    await reverse(f.owner, documentId, 'Customer returned the order before pickup')
    expect(await balanceOf(productId)).toBe('5.000')
  })

  it('links each compensating movement to its original, with the reason', async () => {
    const p1 = await stocked('0')
    const p2 = await stocked('0')
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [
      { productId: p1, quantity: '3' },
      { productId: p2, quantity: '4' },
    ])
    await post(documentId)
    await reverse(f.owner, documentId, 'Entered on the wrong day')

    const db = await admin()
    const { rows } = await db.query(
      `select o.qty::text as original, r.qty::text as compensating, r.source, r.reason, r.actor
       from public.stock_movements r join public.stock_movements o on o.id = r.reverses_movement_id
       where o.document_id = $1 order by o.qty`,
      [documentId],
    )
    expect(rows).toEqual([
      { original: '3.000', compensating: '-3.000', source: 'reversal', reason: 'Entered on the wrong day', actor: f.ownerId },
      { original: '4.000', compensating: '-4.000', source: 'reversal', reason: 'Entered on the wrong day', actor: f.ownerId },
    ])
    const doc = await db.query(`select status, reversal_reason, reversed_by from public.documents where id = $1`, [documentId])
    expect(doc.rows[0]).toEqual({ status: 'reversed', reversal_reason: 'Entered on the wrong day', reversed_by: f.ownerId })
    const audit = await db.query(`select count(*)::int as n from public.audit_events where entity_id = $1 and kind = 'document.reversed'`, [documentId])
    expect(audit.rows[0].n).toBe(1)
  })

  it('requires a reason', async () => {
    const productId = await stocked('0')
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }])
    await post(documentId)
    for (const reason of [null, '', '   ']) {
      const err = await expectError(reverse(f.owner, documentId, reason))
      expect(err.message).toMatch(/reason/i)
    }
    expect(await balanceOf(productId)).toBe('1.000')
  })

  it('refuses to reverse twice', async () => {
    const productId = await stocked('0')
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }])
    await post(documentId)
    await reverse(f.owner, documentId, 'First reversal')
    const err = await expectError(reverse(f.owner, documentId, 'Second reversal'))
    expect(err.code).toBe('55000')
    expect(await balanceOf(productId)).toBe('0.000')
  })

  it('refuses to reverse a draft', async () => {
    const productId = await stocked('0')
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }])
    const err = await expectError(reverse(f.owner, documentId, 'Not posted'))
    expect(err.code).toBe('55000')
  })

  it('D5: blocks reversing a receipt whose stock was sold, naming product, on hand, requested', async () => {
    const productId = await stocked('0')
    const receipt = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '5' }])
    await post(receipt)
    const sale = await createDraft(f.owner, f.shopId, 'sale', [{ productId, quantity: '4' }])
    await post(sale)
    const err = await expectError(reverse(f.owner, receipt, 'Wrong quantity'))
    expect(err.code).toBe('PF001')
    expect(err.message).toMatch(/on hand 1, requested 5/)
    expect(await balanceOf(productId)).toBe('1.000')
  })

  it('allows re-posting the same invoice number after a reversal (D4 correction flow)', async () => {
    const productId = await stocked('0')
    const s = await f.owner.query(`insert into public.counterparties (shop_id, kind, name) values ($1, 'supplier', $2) returning id`, [f.shopId, `Supplier ${randomUUID().slice(0, 4)}`])
    const header = { docNumber: 'INV-900', counterpartyId: s.rows[0].id as string }
    const first = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '5' }], header)
    await post(first)
    await reverse(f.owner, first, 'Quantity was 4, not 5')
    const corrected = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '4' }], header)
    await post(corrected)
    expect(await balanceOf(productId)).toBe('4.000')
  })

  it('R-ROLE-1: refuses staff, outsiders, and anon', async () => {
    const productId = await stocked('0')
    const documentId = await createDraft(f.owner, f.shopId, 'receipt', [{ productId, quantity: '1' }])
    await post(documentId)
    for (const actor of [f.staff, f.outsider, f.anon]) {
      const err = await expectError(reverse(actor, documentId, 'Not allowed'))
      expect(err.code).toBe('42501')
    }
    expect(await balanceOf(productId)).toBe('1.000')
  })
})
