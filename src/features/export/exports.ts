import { supabase } from '@/lib/supabase'
import { toCsv, type Column } from './csv'

// R-ACT-1: products, movements, and documents as CSV. Numbers come from the database as text (::text) and stay exact.

const PAGE = 1000

async function fetchAll<Row>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<Row[]> {
  const out: Row[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as Row[]
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

type ProductRow = {
  sku: string
  part_number: string
  description: string
  brand: string
  base_unit: string
  selling_price: string
  reorder_threshold: string
  shelf_bin: string | null
  qty: string
}

export async function exportProducts(shopId: string): Promise<string> {
  const rows = await fetchAll<ProductRow>((from, to) =>
    supabase
      .from('product_stock')
      .select('sku, part_number, description, brand, base_unit, selling_price, reorder_threshold, shelf_bin, qty')
      .eq('shop_id', shopId)
      .order('sku')
      .range(from, to),
  )
  const columns: Column<ProductRow>[] = [
    { key: 'sku', header: 'sku', kind: 'text' },
    { key: 'part_number', header: 'part_number', kind: 'text' },
    { key: 'description', header: 'description', kind: 'text' },
    { key: 'brand', header: 'brand', kind: 'text' },
    { key: 'base_unit', header: 'base_unit', kind: 'text' },
    { key: 'selling_price', header: 'selling_price', kind: 'decimal' },
    { key: 'reorder_threshold', header: 'reorder_threshold', kind: 'decimal' },
    { key: 'shelf_bin', header: 'shelf_bin', kind: 'text' },
    { key: 'qty', header: 'on_hand', kind: 'decimal' },
  ]
  return toCsv(columns, rows)
}

type MovementRow = {
  created_at: string
  sku: string
  description: string
  base_unit: string
  qty: string
  source: string
  doc_direction: string | null
  doc_number: string | null
  document_id: string | null
  reason: string | null
}

export async function exportMovements(shopId: string): Promise<string> {
  type Raw = {
    created_at: string
    qty: string
    source: string
    reason: string | null
    document_id: string | null
    product: { sku: string; description: string; base_unit: string } | null
    document: { doc_number: string | null; direction: string } | null
  }
  const raw = await fetchAll<Raw>((from, to) =>
    supabase
      .from('stock_movements')
      .select('created_at, qty::text, source, reason, document_id, product:products(sku, description, base_unit), document:documents(doc_number, direction)')
      .eq('shop_id', shopId)
      .order('created_at')
      .order('id')
      .range(from, to),
  )
  const rows: MovementRow[] = raw.map((m) => ({
    created_at: m.created_at,
    sku: m.product?.sku ?? '',
    description: m.product?.description ?? '',
    base_unit: m.product?.base_unit ?? '',
    qty: m.qty,
    source: m.source,
    doc_direction: m.document?.direction ?? null,
    doc_number: m.document?.doc_number ?? null,
    document_id: m.document_id,
    reason: m.reason,
  }))
  const columns: Column<MovementRow>[] = [
    { key: 'created_at', header: 'recorded_at_utc', kind: 'text' },
    { key: 'sku', header: 'sku', kind: 'text' },
    { key: 'description', header: 'description', kind: 'text' },
    { key: 'qty', header: 'quantity_change', kind: 'decimal' },
    { key: 'base_unit', header: 'base_unit', kind: 'text' },
    { key: 'source', header: 'source', kind: 'text' },
    { key: 'doc_direction', header: 'document_type', kind: 'text' },
    { key: 'doc_number', header: 'document_number', kind: 'text' },
    { key: 'document_id', header: 'document_id', kind: 'text' },
    { key: 'reason', header: 'reason', kind: 'text' },
  ]
  return toCsv(columns, rows)
}

type DocumentRow = {
  id: string
  direction: string
  status: string
  doc_number: string | null
  doc_date: string | null
  counterparty: string | null
  total_amount: string | null
  lines: number
  created_at: string
  posted_at: string | null
  reversed_at: string | null
  reversal_reason: string | null
  duplicate_override_reason: string | null
}

export async function exportDocuments(shopId: string): Promise<string> {
  type Raw = Omit<DocumentRow, 'counterparty' | 'lines'> & { counterparty: { name: string } | null; document_lines: { count: number }[] }
  const raw = await fetchAll<Raw>((from, to) =>
    supabase
      .from('documents')
      .select(
        'id, direction, status, doc_number, doc_date, total_amount::text, created_at, posted_at, reversed_at, reversal_reason, duplicate_override_reason, counterparty:counterparties(name), document_lines(count)',
      )
      .eq('shop_id', shopId)
      .order('created_at')
      .range(from, to),
  )
  const rows: DocumentRow[] = raw.map(({ counterparty, document_lines, ...d }) => ({ ...d, counterparty: counterparty?.name ?? null, lines: document_lines?.[0]?.count ?? 0 }))
  const columns: Column<DocumentRow>[] = [
    { key: 'id', header: 'document_id', kind: 'text' },
    { key: 'direction', header: 'type', kind: 'text' },
    { key: 'status', header: 'status', kind: 'text' },
    { key: 'doc_number', header: 'document_number', kind: 'text' },
    { key: 'doc_date', header: 'document_date', kind: 'text' },
    { key: 'counterparty', header: 'counterparty', kind: 'text' },
    { key: 'total_amount', header: 'document_total', kind: 'decimal' },
    { key: 'lines', header: 'lines', kind: 'decimal' },
    { key: 'created_at', header: 'created_at_utc', kind: 'text' },
    { key: 'posted_at', header: 'posted_at_utc', kind: 'text' },
    { key: 'reversed_at', header: 'reversed_at_utc', kind: 'text' },
    { key: 'reversal_reason', header: 'reversal_reason', kind: 'text' },
    { key: 'duplicate_override_reason', header: 'duplicate_override_reason', kind: 'text' },
  ]
  return toCsv(columns, rows)
}
