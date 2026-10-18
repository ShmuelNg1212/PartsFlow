import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

// T3.4, R-ACT-1, R-DATA-3: exact decimal strings; safe text cells.

const columns = [
  { key: 'sku', header: 'SKU', kind: 'text' },
  { key: 'qty', header: 'Quantity', kind: 'decimal' },
  { key: 'note', header: 'Note', kind: 'text' },
] as const

describe('toCsv', () => {
  it('writes a header, CRLF lines, and a BOM for spreadsheet apps', () => {
    const csv = toCsv([...columns], [{ sku: 'SP-1', qty: '5.000', note: null }])
    expect(csv).toBe('\uFEFFSKU,Quantity,Note\r\nSP-1,5.000,\r\n')
  })

  it('quotes commas, quotes, and new lines', () => {
    const csv = toCsv([...columns], [{ sku: 'A,B', qty: '1', note: 'He said "ok"\nthen left' }])
    expect(csv.split('\r\n')[1]).toBe('"A,B",1,"He said ""ok""\nthen left"')
  })

  it('keeps decimals exactly as given, including negatives', () => {
    const csv = toCsv([...columns], [{ sku: 'X', qty: '-0.100', note: '' }])
    expect(csv.split('\r\n')[1]).toBe('X,-0.100,')
  })

  it('neutralizes text that a spreadsheet would run as a formula', () => {
    const csv = toCsv([...columns], [{ sku: '=HYPERLINK("http://x")', qty: '1', note: '-2+3' }])
    expect(csv.split('\r\n')[1]).toBe(`"'=HYPERLINK(""http://x"")",1,'-2+3`)
  })

  it('refuses a non-decimal in a decimal column', () => {
    expect(() => toCsv([...columns], [{ sku: 'X', qty: '1e3', note: '' }])).toThrow(/not a decimal/)
  })
})
