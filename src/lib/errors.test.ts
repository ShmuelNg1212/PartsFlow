import { describe, expect, it } from 'vitest'
import { toAppError } from './errors'

describe('toAppError', () => {
  it('maps insufficient stock with its items (R-POST-8)', () => {
    const err = toAppError({
      code: 'PF001',
      message: 'Not enough stock for Oil filter (OF-1): on hand 1, requested 2.',
      details: JSON.stringify([{ product_id: 'p', sku: 'OF-1', description: 'Oil filter', on_hand: '1', requested: '2' }]),
    })
    expect(err.kind).toBe('insufficient_stock')
    expect(err.message).toMatch(/on hand 1, requested 2/)
    expect(err.kind === 'insufficient_stock' && err.items[0]?.sku).toBe('OF-1')
  })

  it('maps duplicates with their items (R-POST-9)', () => {
    const err = toAppError({ code: 'PF002', message: 'Likely duplicate', details: '[{"document_id":"d","doc_number":"INV-1","reason":"same file"}]' })
    expect(err.kind === 'duplicate' && err.items).toEqual([{ document_id: 'd', doc_number: 'INV-1', reason: 'same file' }])
  })

  it('keeps the server message for line problems', () => {
    expect(toAppError({ code: 'PF003', message: 'Line 2 has no confirmed product.' })).toEqual({
      kind: 'not_ready',
      message: 'Line 2 has no confirmed product.',
    })
  })

  it('rewrites raw permission errors', () => {
    expect(toAppError({ code: '42501', message: 'permission denied for table products' }).message).toBe('You do not have permission to do this.')
    expect(toAppError({ code: '42501', message: 'Only an owner of this shop can post documents.' }).message).toMatch(/Only an owner/)
  })

  it('detects network failures', () => {
    expect(toAppError(new TypeError('Failed to fetch')).kind).toBe('network')
    expect(toAppError({ message: 'TypeError: Failed to fetch' }).kind).toBe('network')
  })

  it('tolerates bad details', () => {
    const err = toAppError({ code: 'PF001', message: 'x', details: 'not json' })
    expect(err.kind === 'insufficient_stock' && err.items).toEqual([])
  })

  it('maps unique violations to a plain message', () => {
    expect(toAppError({ code: '23505', message: 'dup', details: 'Key (shop_id, sku)=(…) already exists.' }).message).toMatch(/SKU/)
  })
})
