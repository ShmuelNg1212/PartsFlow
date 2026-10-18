import Decimal from 'decimal.js'
import type { DraftHeader, DraftLine } from '@/api/api'
import type { Direction, DocumentDetail, LineProduct, RawField } from '@/api/types'
import { isDecimalString, toDecimal } from '@/lib/decimal'

// Client-side model of a draft. The server re-checks everything at save and post (R-DATA-4).

export type EditableLine = {
  key: string
  id: string | null
  description: string
  part_number: string
  quantity: string
  unit: string
  unit_price: string
  discount: string
  received_quantity: string
  conversion_factor: string
  product_id: string | null
  match_source: string | null
  // T6.1: the top suggestion when the product was picked. Measurement only.
  suggested_product_id: string | null
  product: LineProduct | null
  raw: Record<string, RawField> | null
}

export type EditableHeader = DraftHeader

export type DraftState = { header: EditableHeader; lines: EditableLine[] }

let keySeq = 0
export const newKey = () => `l${Date.now().toString(36)}${(keySeq++).toString(36)}`

export function emptyLine(): EditableLine {
  return {
    key: newKey(),
    id: null,
    description: '',
    part_number: '',
    quantity: '',
    unit: '',
    unit_price: '',
    discount: '',
    received_quantity: '',
    conversion_factor: '',
    product_id: null,
    match_source: null,
    suggested_product_id: null,
    product: null,
    raw: null,
  }
}

const s = (v: string | null | undefined) => v ?? ''

/** Trailing zeros from numeric(…)::text ("5.000") are display noise in an input. */
export function trimDecimal(v: string | null | undefined): string {
  if (v === null || v === undefined || v === '') return ''
  return isDecimalString(v, 6) ? new Decimal(v).toString() : v
}

export function fromDocument(doc: DocumentDetail): DraftState {
  return {
    header: {
      doc_number: s(doc.doc_number),
      doc_date: s(doc.doc_date),
      counterparty_id: s(doc.counterparty_id),
      total_amount: trimDecimal(doc.total_amount),
      notes: s(doc.notes),
    },
    lines: doc.lines.map((l) => ({
      key: l.id,
      id: l.id,
      description: s(l.description),
      part_number: s(l.part_number),
      quantity: trimDecimal(l.quantity),
      unit: s(l.unit),
      unit_price: trimDecimal(l.unit_price),
      discount: trimDecimal(l.discount),
      received_quantity: trimDecimal(l.received_quantity),
      conversion_factor: trimDecimal(l.conversion_factor),
      product_id: l.product_id,
      match_source: l.match_source,
      suggested_product_id: l.suggested_product_id,
      product: l.product,
      raw: l.raw,
    })),
  }
}

/** The workspace view of a document: an empty draft starts with one blank line to type into. */
export function editableFrom(doc: DocumentDetail): DraftState {
  const state = fromDocument(doc)
  return state.lines.length === 0 ? { ...state, lines: [emptyLine()] } : state
}

/** A line the user left completely empty is not saved. */
export function isBlankLine(l: EditableLine): boolean {
  return !l.id && !l.description.trim() && !l.part_number.trim() && !l.quantity.trim() && !l.product_id
}

export function toSavePayload(state: DraftState): { header: DraftHeader; lines: DraftLine[] } {
  const t = (v: string) => v.trim()
  return {
    header: {
      doc_number: t(state.header.doc_number),
      doc_date: t(state.header.doc_date),
      counterparty_id: t(state.header.counterparty_id),
      total_amount: t(state.header.total_amount),
      notes: t(state.header.notes),
    },
    lines: state.lines
      .filter((l) => !isBlankLine(l))
      .map((l) => ({
        id: l.id,
        description: t(l.description) || null,
        part_number: t(l.part_number) || null,
        quantity: t(l.quantity) || null,
        unit: t(l.unit) || null,
        unit_price: t(l.unit_price) || null,
        discount: t(l.discount) || null,
        received_quantity: t(l.received_quantity) || null,
        conversion_factor: t(l.conversion_factor) || null,
        product_id: l.product_id,
        match_source: l.match_source,
        suggested_product_id: l.suggested_product_id,
      })),
  }
}

export function sameDraft(a: DraftState, b: DraftState): boolean {
  return JSON.stringify(toSavePayload(a)) === JSON.stringify(toSavePayload(b))
}

/** R-POST-11: a factor is needed when the line unit is set and differs from the product's base unit. */
export function needsFactor(l: EditableLine): boolean {
  if (!l.product || !l.unit.trim()) return false
  return l.unit.trim().toLowerCase() !== l.product.base_unit.trim().toLowerCase()
}

/** The quantity that moves stock: received quantity for receipts (R-POST-3), quantity for sales (R-POST-4). */
export function postedQuantity(l: EditableLine, direction: Direction): string {
  return direction === 'receipt' ? l.received_quantity.trim() : l.quantity.trim()
}

/** Base-unit quantity, or null when the line is not complete. Rounded to 3 places like post_document. */
export function baseQuantity(l: EditableLine, direction: Direction): Decimal | null {
  const q = postedQuantity(l, direction)
  if (!isDecimalString(q, 3)) return null
  let factor = new Decimal(1)
  if (needsFactor(l)) {
    if (!isDecimalString(l.conversion_factor, 6) || toDecimal(l.conversion_factor).isZero()) return null
    factor = toDecimal(l.conversion_factor)
  }
  return toDecimal(q).times(factor).toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
}

export function lineIssues(l: EditableLine, direction: Direction): string[] {
  const issues: string[] = []
  const check = (value: string, scale: number, label: string) => {
    if (value.trim() && (!isDecimalString(value, scale) || value.trim().startsWith('-'))) {
      issues.push(`${label} must be a number, zero or more, with at most ${scale} decimals.`)
    }
  }
  check(l.quantity, 3, 'Quantity')
  check(l.received_quantity, 3, 'Received quantity')
  check(l.unit_price, 2, 'Price')
  check(l.discount, 2, 'Discount')
  check(l.conversion_factor, 6, 'Conversion factor')

  if (!l.product_id) issues.push('Select a product.')
  if (direction === 'receipt') {
    if (!l.received_quantity.trim()) issues.push('Confirm the quantity physically received.')
  } else if (!l.quantity.trim() || toDecimal(isDecimalString(l.quantity, 3) ? l.quantity : '0').isZero()) {
    issues.push('Enter the quantity sold.')
  }
  if (needsFactor(l) && (!l.conversion_factor.trim() || (isDecimalString(l.conversion_factor, 6) && toDecimal(l.conversion_factor).isZero()))) {
    issues.push(`Unit "${l.unit.trim()}" differs from the product unit "${l.product!.base_unit}". Enter how many ${l.product!.base_unit} are in one ${l.unit.trim()}.`)
  }
  return issues
}

export type SummaryRow = { product: LineProduct; delta: Decimal }

/** R-POST-2: each stock increase and decrease that posting will make, per product. */
export function stockSummary(direction: Direction, lines: EditableLine[]): SummaryRow[] {
  const sign = direction === 'receipt' ? 1 : -1
  const byProduct = new Map<string, SummaryRow>()
  for (const l of lines) {
    if (isBlankLine(l) || !l.product) continue
    const q = baseQuantity(l, direction)
    if (!q) continue
    const row = byProduct.get(l.product.id) ?? { product: l.product, delta: new Decimal(0) }
    row.delta = row.delta.plus(q.times(sign))
    byProduct.set(l.product.id, row)
  }
  return [...byProduct.values()].filter((r) => !r.delta.isZero()).sort((a, b) => a.product.sku.localeCompare(b.product.sku))
}

export function lineTotal(l: EditableLine): Decimal | null {
  if (!isDecimalString(l.quantity, 3) || !isDecimalString(l.unit_price, 2)) return null
  const gross = toDecimal(l.quantity).times(toDecimal(l.unit_price))
  const discount = isDecimalString(l.discount, 2) ? toDecimal(l.discount) : new Decimal(0)
  return gross.minus(discount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
}
