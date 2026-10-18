import { describe, expect, it } from 'vitest'
import type { LineProduct } from '@/api/types'
import { emptyLine, isBlankLine, lineIssues, lineTotal, needsFactor, stockSummary, toSavePayload, type EditableLine } from './draft'

const plug: LineProduct = { id: 'p1', sku: 'SP-1', description: 'Spark plug', brand: 'NGK', base_unit: 'pc', part_number: 'BKR6E' }
const filter: LineProduct = { id: 'p2', sku: 'OF-1', description: 'Oil filter', brand: 'Mann-Filter', base_unit: 'pc', part_number: 'W712' }

const line = (over: Partial<EditableLine>): EditableLine => ({ ...emptyLine(), ...over })

describe('lineIssues', () => {
  it('R-DOC-6: a line without a product cannot post', () => {
    expect(lineIssues(line({ quantity: '1', received_quantity: '1' }), 'receipt')).toContain('Select a product.')
  })

  it('R-POST-3: a receipt line needs the received quantity', () => {
    const issues = lineIssues(line({ product: plug, product_id: plug.id, quantity: '5' }), 'receipt')
    expect(issues).toEqual(['Confirm the quantity physically received.'])
  })

  it('a sale line needs a quantity above zero', () => {
    expect(lineIssues(line({ product: plug, product_id: plug.id, quantity: '0' }), 'sale')).toEqual(['Enter the quantity sold.'])
    expect(lineIssues(line({ product: plug, product_id: plug.id, quantity: '2' }), 'sale')).toEqual([])
  })

  it('R-POST-11: a different unit needs a factor; the same unit in another case does not', () => {
    expect(needsFactor(line({ product: plug, unit: 'PC' }))).toBe(false)
    const issues = lineIssues(line({ product: plug, product_id: plug.id, quantity: '2', unit: 'box' }), 'sale')
    expect(issues[0]).toMatch(/Enter how many pc are in one box/)
    expect(lineIssues(line({ product: plug, product_id: plug.id, quantity: '2', unit: 'box', conversion_factor: '10' }), 'sale')).toEqual([])
  })

  it('rejects malformed numbers', () => {
    const issues = lineIssues(line({ product: plug, product_id: plug.id, quantity: '1,5' }), 'sale')
    expect(issues.some((i) => i.startsWith('Quantity must be a number'))).toBe(true)
  })
})

describe('stockSummary (R-POST-2)', () => {
  it('adds received quantities for a receipt, in base units', () => {
    const rows = stockSummary('receipt', [
      line({ product: plug, product_id: plug.id, quantity: '2', received_quantity: '2', unit: 'box', conversion_factor: '10' }),
      line({ product: plug, product_id: plug.id, quantity: '1', received_quantity: '0.5' }),
      line({ product: filter, product_id: filter.id, quantity: '3', received_quantity: '3' }),
    ])
    expect(rows.map((r) => [r.product.sku, r.delta.toString()])).toEqual([
      ['OF-1', '3'],
      ['SP-1', '20.5'],
    ])
  })

  it('subtracts for a sale', () => {
    const rows = stockSummary('sale', [line({ product: plug, product_id: plug.id, quantity: '2' })])
    expect(rows[0]?.delta.toString()).toBe('-2')
  })

  it('skips incomplete lines', () => {
    expect(stockSummary('receipt', [line({ product: plug, product_id: plug.id, quantity: '2' })])).toEqual([])
  })
})

describe('toSavePayload', () => {
  it('drops blank new lines and trims values', () => {
    const payload = toSavePayload({
      header: { doc_number: ' INV-1 ', doc_date: '', counterparty_id: '', total_amount: '', notes: '' },
      lines: [line({ description: ' Plug ', quantity: '1' }), emptyLine()],
    })
    expect(payload.header.doc_number).toBe('INV-1')
    expect(payload.lines).toHaveLength(1)
    expect(payload.lines[0]).toMatchObject({ id: null, description: 'Plug', quantity: '1', unit: null })
  })

  it('keeps an existing line even when emptied', () => {
    expect(isBlankLine(line({ id: 'x' }))).toBe(false)
  })
})

describe('lineTotal', () => {
  it('computes quantity × price − discount exactly', () => {
    expect(lineTotal(line({ quantity: '3', unit_price: '0.10' }))?.toFixed(2)).toBe('0.30')
    expect(lineTotal(line({ quantity: '2', unit_price: '150.00', discount: '20' }))?.toFixed(2)).toBe('280.00')
  })
})
