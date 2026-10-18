import { describe, expect, it } from 'vitest'
import { emptyProduct, productSchema } from './productSchema'

const valid = { ...emptyProduct, sku: 'SP-1', part_number: 'BKR6E', description: 'Spark plug', brand: 'NGK' }

describe('productSchema (R-PROD-1)', () => {
  it('accepts a complete product', () => {
    expect(productSchema.safeParse(valid).success).toBe(true)
  })

  it('requires a brand', () => {
    const r = productSchema.safeParse({ ...valid, brand: '  ' })
    expect(r.success).toBe(false)
  })

  it('rejects money with three decimals and negative numbers', () => {
    expect(productSchema.safeParse({ ...valid, selling_price: '1.005' }).success).toBe(false)
    expect(productSchema.safeParse({ ...valid, reorder_threshold: '-1' }).success).toBe(false)
  })

  it('allows an empty opening quantity but not text', () => {
    expect(productSchema.safeParse({ ...valid, opening_qty: '' }).success).toBe(true)
    expect(productSchema.safeParse({ ...valid, opening_qty: 'five' }).success).toBe(false)
  })
})
