import Papa from 'papaparse'
import { normalizePartNumber } from '@/lib/partNumber'

// Product CSV import (plan T3.3, R-PROD-2). The browser checks rows for a preview; import_products checks again on the server.

export type ProductImportValue = {
  sku: string
  part_number: string
  description: string
  brand: string
  base_unit: string
  selling_price: string
  reorder_threshold: string
  shelf_bin: string
  opening_qty: string
}

export type ImportRow = { line: number; value: ProductImportValue; errors: string[] }

export type ParseResult = {
  rows: ImportRow[]
  validCount: number
  missingColumns: (keyof ProductImportValue)[]
  unknownColumns: string[]
  fileError: string | null
}

export const MAX_ROWS = 5000

const FIELDS: Record<keyof ProductImportValue, string[]> = {
  sku: ['sku', 'item code', 'code'],
  part_number: ['part number', 'part no', 'partno', 'part', 'mpn', 'manufacturer part number', 'pn'],
  description: ['description', 'desc', 'name', 'item'],
  brand: ['brand', 'make', 'manufacturer'],
  base_unit: ['base unit', 'unit', 'uom'],
  selling_price: ['selling price', 'price', 'srp', 'retail price'],
  reorder_threshold: ['reorder threshold', 'reorder point', 'reorder', 'reorder level', 'min'],
  shelf_bin: ['shelf bin', 'shelf', 'bin', 'location'],
  opening_qty: ['opening qty', 'opening quantity', 'opening', 'qty', 'quantity', 'stock', 'on hand'],
}
const REQUIRED: (keyof ProductImportValue)[] = ['sku', 'part_number', 'description', 'brand']

const headerKey = (h: string) =>
  h
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[._/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function fieldFor(header: string): keyof ProductImportValue | null {
  const key = headerKey(header)
  for (const [field, names] of Object.entries(FIELDS) as [keyof ProductImportValue, string[]][]) {
    if (names.includes(key)) return field
  }
  return null
}

/** "1,250.50" → "1250.50". Other text is returned trimmed and checked later. */
function cleanNumber(text: string): string {
  const t = text.trim()
  return /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, '') : t
}

function checkDecimal(value: string, scale: number, label: string, errors: string[]) {
  if (!new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`).test(value)) {
    errors.push(`${label} must be a number, zero or more, with at most ${scale} decimals.`)
  }
}

export function parseProductCsv(text: string): ParseResult {
  const empty: ParseResult = { rows: [], validCount: 0, missingColumns: [], unknownColumns: [], fileError: null }
  if (!text.trim()) return { ...empty, fileError: 'The file is empty.' }

  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ''), { skipEmptyLines: false })
  const [header, ...body] = parsed.data
  if (!header) return { ...empty, fileError: 'The file is empty.' }

  const columns = header.map(fieldFor)
  const unknownColumns = header.filter((_, i) => columns[i] === null).map((h) => h.trim()).filter(Boolean)
  const missingColumns = REQUIRED.filter((f) => !columns.includes(f))

  const dataLines = body
    .map((cells, i) => ({ cells, line: i + 2 }))
    .filter(({ cells }) => cells.some((c) => c.trim() !== ''))
  if (dataLines.length > MAX_ROWS) return { ...empty, missingColumns, unknownColumns, fileError: `The file has more than ${MAX_ROWS} rows. Split it into smaller files.` }

  const seenSku = new Map<string, number>()
  const seenKey = new Map<string, number>()
  const rows: ImportRow[] = dataLines.map(({ cells, line }) => {
    const get = (field: keyof ProductImportValue) => {
      const i = columns.indexOf(field)
      return i >= 0 ? (cells[i] ?? '').trim() : ''
    }
    const value: ProductImportValue = {
      sku: get('sku'),
      part_number: get('part_number'),
      description: get('description'),
      brand: get('brand'),
      base_unit: get('base_unit') || 'pc',
      selling_price: cleanNumber(get('selling_price')) || '0',
      reorder_threshold: cleanNumber(get('reorder_threshold')) || '0',
      shelf_bin: get('shelf_bin'),
      opening_qty: cleanNumber(get('opening_qty')) || '0',
    }
    const errors: string[] = []
    if (!value.sku) errors.push('SKU is required.')
    if (!value.part_number) errors.push('Part number is required.')
    if (!value.description) errors.push('Description is required.')
    if (!value.brand) errors.push('Brand is required. Different brands are different products.')
    if (value.sku.length > 64) errors.push('SKU is longer than 64 characters.')
    if (value.part_number.length > 64) errors.push('Part number is longer than 64 characters.')
    if (value.description.length > 300) errors.push('Description is longer than 300 characters.')
    if (value.brand.length > 80) errors.push('Brand is longer than 80 characters.')
    if (value.base_unit.length > 20) errors.push('Unit is longer than 20 characters.')
    if (value.shelf_bin.length > 40) errors.push('Shelf / bin is longer than 40 characters.')
    checkDecimal(value.selling_price, 2, 'Selling price', errors)
    checkDecimal(value.reorder_threshold, 3, 'Reorder threshold', errors)
    checkDecimal(value.opening_qty, 3, 'Opening quantity', errors)

    if (value.sku) {
      const first = seenSku.get(value.sku.toLowerCase())
      if (first) errors.push(`SKU ${value.sku} appears more than once in the file (line ${first}).`)
      else seenSku.set(value.sku.toLowerCase(), line)
    }
    if (value.brand && value.part_number) {
      const key = `${value.brand.toLowerCase()}|${normalizePartNumber(value.part_number)}`
      const first = seenKey.get(key)
      if (first) errors.push(`Brand and part number repeat line ${first}.`)
      else seenKey.set(key, line)
    }
    return { line, value, errors }
  })

  return { rows, validCount: rows.filter((r) => r.errors.length === 0).length, missingColumns, unknownColumns, fileError: null }
}
