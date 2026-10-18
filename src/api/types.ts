// App-level types. Quantities and money are decimal strings, never JS numbers (R-DATA-3).

export type Role = 'owner' | 'staff'
export type Direction = 'receipt' | 'sale'
export type DocStatus = 'draft' | 'posted' | 'reversed'

export type Shop = {
  id: string
  name: string
  currency: string
  timezone: string
  is_demo: boolean
}

export type Membership = { role: Role; shop: Shop }

export type ProductStock = {
  id: string
  sku: string
  part_number: string
  description: string
  brand: string
  base_unit: string
  selling_price: string
  reorder_threshold: string
  shelf_bin: string | null
  qty: string
  is_low: boolean
  has_movements: boolean
}

export type Counterparty = { id: string; name: string; kind: 'supplier' | 'customer' }

export type LineProduct = { id: string; sku: string; description: string; brand: string; base_unit: string; part_number: string }

export type RawField = { value: string | null; confidence?: number | null }

export type DocumentLine = {
  id: string
  line_no: number
  description: string | null
  part_number: string | null
  quantity: string | null
  unit: string | null
  unit_price: string | null
  discount: string | null
  received_quantity: string | null
  conversion_factor: string | null
  product_id: string | null
  match_source: string | null
  raw: Record<string, RawField> | null
  product: LineProduct | null
}

export type DocumentSummary = {
  id: string
  direction: Direction
  status: DocStatus
  doc_number: string | null
  doc_date: string | null
  created_at: string
  posted_at: string | null
  counterparty: { name: string } | null
  line_count: number
  file_path: string | null
  extraction_provider: string | null
}

export type DocumentDetail = {
  id: string
  shop_id: string
  direction: Direction
  status: DocStatus
  doc_number: string | null
  doc_date: string | null
  counterparty_id: string | null
  counterparty: Counterparty | null
  total_amount: string | null
  notes: string | null
  raw_doc_number: string | null
  raw_doc_date: string | null
  raw_counterparty: string | null
  raw_extraction: RawExtraction | null
  extraction_provider: string | null
  extraction_status: string
  file_path: string | null
  file_mime: string | null
  posted_at: string | null
  reversed_at: string | null
  reversal_reason: string | null
  duplicate_override_reason: string | null
  created_at: string
  updated_at: string
  lines: DocumentLine[]
}

export type Movement = {
  id: string
  qty: string
  source: 'document_line' | 'opening' | 'reversal'
  reason: string | null
  created_at: string
  product: { id: string; sku: string; description: string; base_unit: string } | null
  document: { id: string; doc_number: string | null; direction: Direction; status: DocStatus } | null
}

export type Suggestion = {
  product_id: string
  sku: string
  part_number: string
  description: string
  brand: string
  base_unit: string
  source: 'alias' | 'part_number' | 'description'
  score: number
  confident: boolean
}

/** The stored extraction result (see supabase/functions/_shared/extraction/types.ts). */
export type RawExtraction = {
  status: 'done' | 'not_available' | 'failed'
  provider: string
  message?: string
  doc_number?: RawField
  doc_date?: RawField
  vendor_name?: RawField
  customer_name?: RawField
  totals?: { total?: RawField; currency?: string | null }
}
