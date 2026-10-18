import { describe, expect, it } from 'vitest'
import { parseProductCsv } from './productCsv'

// T3.3, R-PROD-2: preview with per-row errors before anything is written. File line numbers count the header as line 1.

describe('parseProductCsv', () => {
  it('maps common header names and fills defaults', () => {
    const csv = '\uFEFFSKU,Part No.,Description,Brand,Unit,Price,Reorder point,Location,Qty\nSP-1,BKR6E-11,Spark plug,NGK,pc,"1,250.50",4,A-1,12\nOF-2,W 712/75,Oil filter,Mann-Filter,,,,,\n'
    const result = parseProductCsv(csv)
    expect(result.missingColumns).toEqual([])
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0]).toMatchObject({
      line: 2,
      errors: [],
      value: { sku: 'SP-1', part_number: 'BKR6E-11', brand: 'NGK', base_unit: 'pc', selling_price: '1250.50', reorder_threshold: '4', shelf_bin: 'A-1', opening_qty: '12' },
    })
    expect(result.rows[1]!.value).toMatchObject({ base_unit: 'pc', selling_price: '0', reorder_threshold: '0', opening_qty: '0', shelf_bin: '' })
    expect(result.validCount).toBe(2)
  })

  it('reports missing required columns', () => {
    const result = parseProductCsv('SKU,Description\nA,B\n')
    expect(result.missingColumns).toEqual(['part_number', 'brand'])
  })

  it('flags each bad row with its file line and reasons', () => {
    const csv = [
      'sku,part_number,description,brand,selling_price,opening_qty',
      'A-1,P1,Good,Bosch,10,1',
      ',P2,No SKU,Bosch,10,1',
      'A-3,P3,Bad price,Bosch,10.005,1',
      'A-4,P4,Negative qty,Bosch,1,-2',
      'A-1,P5,Duplicate SKU,Bosch,1,1',
      'A-6,p-1,Same brand and part number as line 2,bosch,1,1',
      'A-7,P1,Same part number different brand,Denso,1,1',
    ].join('\n')
    const result = parseProductCsv(csv)
    const bad = result.rows.filter((r) => r.errors.length > 0).map((r) => [r.line, r.errors[0]])
    expect(bad).toEqual([
      [3, 'SKU is required.'],
      [4, 'Selling price must be a number, zero or more, with at most 2 decimals.'],
      [5, 'Opening quantity must be a number, zero or more, with at most 3 decimals.'],
      [6, 'SKU A-1 appears more than once in the file (line 2).'],
      [7, 'Brand and part number repeat line 2.'],
    ])
    // R-PROD-5: a different brand with the same part number is a different product.
    expect(result.rows.find((r) => r.line === 8)?.errors).toEqual([])
    expect(result.validCount).toBe(2)
  })

  it('skips empty lines and refuses more than 5000 rows', () => {
    expect(parseProductCsv('sku,part_number,description,brand\n\nA,P,D,B\n\n').rows).toHaveLength(1)
    const big = 'sku,part_number,description,brand\n' + Array.from({ length: 5001 }, (_, i) => `S${i},P${i},D,B`).join('\n')
    expect(parseProductCsv(big).fileError).toMatch(/5000/)
  })

  it('reports an empty file', () => {
    expect(parseProductCsv('').fileError).toMatch(/empty/i)
  })
})
