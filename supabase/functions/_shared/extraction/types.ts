// Extraction interface (plan T4.2, R-EXT-1, ADR 0002). Output is an untrusted draft (R-EXT-3).
// No Deno or npm imports, so the same files run in Edge Functions and in Vitest.

/** One extracted value. `value` is text as the provider read it, normalized; null when not found. */
export type Field = { value: string | null; confidence: number | null }

export type ExtractedLine = {
  description: Field
  part_number: Field
  quantity: Field
  unit: Field
  unit_price: Field
  discount: Field
  amount: Field
}

export type ExtractionDone = {
  status: 'done'
  provider: string
  doc_number: Field
  doc_date: Field
  vendor_name: Field
  customer_name: Field
  totals: { subtotal: Field; tax: Field; total: Field; currency: string | null }
  lines: ExtractedLine[]
}

export type ExtractionUnavailable = { status: 'not_available' | 'failed'; provider: string; message: string }

export type ExtractionResult = ExtractionDone | ExtractionUnavailable

export interface Extractor {
  readonly provider: string
  extract(file: Uint8Array, mime: string): Promise<ExtractionResult>
}

export const missing = (): Field => ({ value: null, confidence: null })

/**
 * Turns printed numbers such as "₱1,250.50", "1 250.50", "(2)" or "12 pcs" into "1250.50" style text.
 * Returns null when the text is not a plain non-negative decimal after cleaning. Never goes through a float.
 */
export function normalizeDecimal(text: string | null | undefined): string | null {
  if (text === null || text === undefined) return null
  let t = String(text).trim()
  if (!t) return null
  t = t.replace(/[^\d.,-]/g, '')
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '')
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.')
  return /^\d+(\.\d+)?$/.test(t) ? t : null
}

/** Formats a provider float without exponent notation, as a last resort when no printed text exists. */
export function numberToDecimal(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return null
  return n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 6 })
}
