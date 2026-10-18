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
