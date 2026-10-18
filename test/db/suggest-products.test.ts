import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createDraft, createProduct, expectError, seedShop, type ShopFixture } from './helpers'

// T1.6: suggest_products. R-DOC-6 (ambiguous needs review), R-PROD-5 (never merge brands or similar part numbers).

let f: ShopFixture
let supplierId: string
let ngk: string
let denso: string
let similar: string

type Suggestion = { product_id: string; source: string; confident: boolean }

const suggest = async (args: { counterparty?: string | null; description?: string | null; partNumber?: string | null; brand?: string | null }) => {
  const { rows } = await f.staff.query('select * from public.suggest_products($1, $2, $3, $4, $5)', [
    f.shopId,
    args.counterparty ?? null,
    args.description ?? null,
    args.partNumber ?? null,
    args.brand ?? null,
  ])
  return rows as Suggestion[]
}

beforeAll(async () => {
  f = await seedShop()
  ngk = await createProduct(f, { partNumber: 'BKR6E-11', brand: 'NGK', description: 'Spark plug BKR6E-11' })
  denso = await createProduct(f, { partNumber: 'BKR6E 11', brand: 'Denso', description: 'Spark plug K20PR-U11 equivalent' })
  similar = await createProduct(f, { partNumber: 'BKR5E-11', brand: 'NGK', description: 'Spark plug BKR5E-11' })
  const s = await f.owner.query(`insert into public.counterparties (shop_id, kind, name) values ($1, 'supplier', 'Metro Auto Supply') returning id`, [f.shopId])
  supplierId = s.rows[0].id
})

describe('suggest_products', () => {
  it('R-PROD-5: two brands with the same normalized part number give two candidates, not confident', async () => {
    const rows = await suggest({ partNumber: 'bkr6e11' })
    const ids = rows.filter((r) => r.source === 'part_number').map((r) => r.product_id)
    expect(ids.sort()).toEqual([ngk, denso].sort())
    expect(rows.some((r) => r.confident)).toBe(false)
  })

  it('exact part number plus brand gives one confident candidate', async () => {
    const rows = await suggest({ partNumber: 'BKR5E-11', brand: 'ngk' })
    const confident = rows.filter((r) => r.confident)
    expect(confident.map((r) => r.product_id)).toEqual([similar])
  })

  it('brand on the invoice does not settle a part number that two brands share', async () => {
    const rows = await suggest({ partNumber: 'BKR6E-11', brand: 'NGK' })
    expect(rows.some((r) => r.confident)).toBe(false)
  })

  it('exact part number without brand is not confident even with one match', async () => {
    const rows = await suggest({ partNumber: 'BKR5E-11' })
    expect(rows.find((r) => r.product_id === similar)?.source).toBe('part_number')
    expect(rows.some((r) => r.confident)).toBe(false)
  })

  it('a similar part number (one character different) is never confident', async () => {
    const rows = await suggest({ partNumber: 'BKR7E-11', brand: 'NGK', description: 'Spark plug BKR7E-11' })
    expect(rows.some((r) => r.confident)).toBe(false)
    expect(rows.every((r) => r.source === 'description')).toBe(true)
  })

  it('an alias match gives one confident candidate', async () => {
    const productId = await createProduct(f, { partNumber: 'W712/75', brand: 'Mann-Filter', description: 'Oil filter' })
    const documentId = await createDraft(
      f.owner,
      f.shopId,
      'receipt',
      [{ productId, quantity: '1', description: 'MANN OIL FILTER W712/75' }],
      { counterpartyId: supplierId, docNumber: `A-${randomUUID().slice(0, 4)}` },
    )
    await f.owner.query('select public.post_document($1, $2)', [documentId, randomUUID()])

    const rows = await suggest({ counterparty: supplierId, description: 'Mann  oil filter w712/75' })
    expect(rows[0]).toMatchObject({ product_id: productId, source: 'alias', confident: true })
    expect(rows.filter((r) => r.confident)).toHaveLength(1)
  })

  it('an alias that conflicts with another exact part number is ambiguous', async () => {
    const aliasProduct = await createProduct(f, { partNumber: 'CONFLICT-1', brand: 'Bosch', description: 'Brake pad set front' })
    await createProduct(f, { partNumber: 'CONFLICT-2', brand: 'Brembo', description: 'Brake pad set' })
    const documentId = await createDraft(
      f.owner,
      f.shopId,
      'receipt',
      [{ productId: aliasProduct, quantity: '1', description: 'Brake pads front' }],
      { counterpartyId: supplierId, docNumber: `B-${randomUUID().slice(0, 4)}` },
    )
    await f.owner.query('select public.post_document($1, $2)', [documentId, randomUUID()])

    const rows = await suggest({ counterparty: supplierId, description: 'Brake pads front', partNumber: 'CONFLICT-2' })
    expect(rows.map((r) => r.source)).toEqual(expect.arrayContaining(['alias', 'part_number']))
    expect(rows.some((r) => r.confident)).toBe(false)
  })

  it('refuses outsiders', async () => {
    const err = await expectError(f.outsider.query('select * from public.suggest_products($1, null, $2, null, null)', [f.shopId, 'spark plug']))
    expect(err.code).toBe('42501')
  })
})
