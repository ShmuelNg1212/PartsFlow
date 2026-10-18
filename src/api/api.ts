import { supabase } from '@/lib/supabase'
import type { Json } from '@/lib/database.types'
import type {
  Counterparty,
  Direction,
  DocumentDetail,
  DocumentLine,
  DocumentSummary,
  Membership,
  Movement,
  ProductStock,
  Shop,
  Suggestion,
} from './types'

// Thin data layer over supabase-js. Every numeric column is selected as ::text (R-DATA-3).
// Errors are thrown as the raw Supabase error; callers map them with toAppError().

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error
  return res.data
}

function one<T>(res: { data: T; error: unknown }): NonNullable<T> {
  const data = check(res)
  if (data === null) throw { code: 'PGRST116', message: 'The server returned no row.' }
  return data as NonNullable<T>
}

// Decimal strings go to numeric RPC arguments as JSON strings; Postgres parses them exactly.
const asNumeric = (value: string) => value as unknown as number

export const keys = {
  memberships: ['memberships'] as const,
  shop: (shopId: string) => ['shop', shopId] as const,
  products: (shopId: string, q: string) => ['shop', shopId, 'products', q] as const,
  product: (shopId: string, id: string) => ['shop', shopId, 'product', id] as const,
  documents: (shopId: string, filter: string) => ['shop', shopId, 'documents', filter] as const,
  document: (shopId: string, id: string) => ['shop', shopId, 'document', id] as const,
  movements: (shopId: string, productId: string | null) => ['shop', shopId, 'movements', productId ?? 'all'] as const,
  counterparties: (shopId: string, kind: string) => ['shop', shopId, 'counterparties', kind] as const,
  overview: (shopId: string) => ['shop', shopId, 'overview'] as const,
}

// --- Shops and memberships ---------------------------------------------------

export async function listMemberships(userId: string): Promise<Membership[]> {
  const rows = check(
    await supabase.from('memberships').select('role, shop:shops(id, name, currency, timezone, is_demo)').eq('user_id', userId),
  )
  return (rows ?? [])
    .filter((r) => r.shop)
    .map((r) => ({ role: r.role as Membership['role'], shop: r.shop as unknown as Shop }))
    .sort((a, b) => Number(a.shop.is_demo) - Number(b.shop.is_demo) || a.shop.name.localeCompare(b.shop.name))
}

// --- Products ----------------------------------------------------------------

export async function searchProducts(shopId: string, query: string): Promise<ProductStock[]> {
  const rows = check(await supabase.rpc('search_products', { p_shop_id: shopId, p_query: query }))
  return (rows ?? []) as ProductStock[]
}

export async function getProduct(id: string): Promise<ProductStock | null> {
  const row = check(await supabase.from('product_stock').select('*').eq('id', id).maybeSingle())
  return row as ProductStock | null
}

export async function listLowStock(shopId: string): Promise<ProductStock[]> {
  const rows = check(await supabase.from('product_stock').select('*').eq('shop_id', shopId).eq('is_low', true).order('sku').limit(50))
  return (rows ?? []) as ProductStock[]
}

export type ProductInput = {
  sku: string
  part_number: string
  description: string
  brand: string
  base_unit: string
  selling_price: string
  reorder_threshold: string
  shelf_bin: string | null
}

export async function createProduct(shopId: string, input: ProductInput, openingQty: string | null): Promise<string> {
  const row = one(
    await supabase
      .from('products')
      .insert({
        shop_id: shopId,
        ...input,
        selling_price: asNumeric(input.selling_price),
        reorder_threshold: asNumeric(input.reorder_threshold),
      })
      .select('id')
      .single(),
  )
  if (openingQty !== null && openingQty !== '') {
    check(await supabase.rpc('set_opening_quantity', { p_product_id: row.id, p_qty: asNumeric(openingQty) }))
  }
  return row.id
}

export async function updateProduct(id: string, input: ProductInput): Promise<void> {
  const res = await supabase
    .from('products')
    .update({ ...input, selling_price: asNumeric(input.selling_price), reorder_threshold: asNumeric(input.reorder_threshold) })
    .eq('id', id)
    .select('id')
  const rows = check(res)
  if (!rows || rows.length === 0) throw { code: '42501', message: 'Only an owner can change products.' }
}

export async function setOpeningQuantity(productId: string, qty: string): Promise<void> {
  check(await supabase.rpc('set_opening_quantity', { p_product_id: productId, p_qty: asNumeric(qty) }))
}

// --- Counterparties ----------------------------------------------------------

export async function listCounterparties(shopId: string, kind: Counterparty['kind']): Promise<Counterparty[]> {
  const rows = check(await supabase.from('counterparties').select('id, name, kind').eq('shop_id', shopId).eq('kind', kind).order('name'))
  return (rows ?? []) as Counterparty[]
}

export async function createCounterparty(shopId: string, kind: Counterparty['kind'], name: string): Promise<Counterparty> {
  const row = one(await supabase.from('counterparties').insert({ shop_id: shopId, kind, name: name.trim() }).select('id, name, kind').single())
  return row as Counterparty
}

// --- Documents ---------------------------------------------------------------

export type DocumentFilter = 'drafts' | 'posted' | 'all'

export async function listDocuments(shopId: string, filter: DocumentFilter, limit = 100): Promise<DocumentSummary[]> {
  let q = supabase
    .from('documents')
    .select('id, direction, status, doc_number, doc_date, created_at, posted_at, file_path, extraction_provider, counterparty:counterparties(name), document_lines(count)')
    .eq('shop_id', shopId)
  if (filter === 'drafts') q = q.eq('status', 'draft')
  if (filter === 'posted') q = q.in('status', ['posted', 'reversed'])
  const rows = check(await q.order(filter === 'posted' ? 'posted_at' : 'created_at', { ascending: false }).limit(limit))
  return (rows ?? []).map((r) => {
    const { document_lines, ...rest } = r as typeof r & { document_lines: { count: number }[] }
    return { ...(rest as unknown as Omit<DocumentSummary, 'line_count'>), line_count: document_lines?.[0]?.count ?? 0 }
  })
}

const LINE_COLUMNS =
  'id, line_no, description, part_number, quantity::text, unit, unit_price::text, discount::text, received_quantity::text, conversion_factor::text, product_id, match_source, suggested_product_id, raw, product:products!document_lines_product_id_shop_id_fkey(id, sku, description, brand, base_unit, part_number)'

export async function getDocument(id: string): Promise<DocumentDetail | null> {
  const row = check(
    await supabase
      .from('documents')
      .select(
        `id, shop_id, direction, status, doc_number, doc_date, counterparty_id, total_amount::text, notes,
         raw_doc_number, raw_doc_date, raw_counterparty, raw_extraction, extraction_provider, extraction_status, file_path, file_mime,
         posted_at, reversed_at, reversal_reason, duplicate_override_reason, created_at, updated_at,
         counterparty:counterparties(id, name, kind),
         lines:document_lines(${LINE_COLUMNS})`,
      )
      .eq('id', id)
      .order('line_no', { referencedTable: 'document_lines' })
      .maybeSingle(),
  )
  if (!row) return null
  const doc = row as unknown as DocumentDetail
  doc.lines = [...(doc.lines ?? [])].sort((a, b) => a.line_no - b.line_no)
  return doc
}

export async function createDocument(shopId: string, direction: Direction): Promise<string> {
  const row = one(await supabase.from('documents').insert({ shop_id: shopId, direction }).select('id').single())
  return row.id
}

export async function deleteDraft(id: string): Promise<void> {
  const rows = check(await supabase.from('documents').delete().eq('id', id).eq('status', 'draft').select('id'))
  if (!rows || rows.length === 0) throw { code: '55000', message: 'Only drafts can be deleted.' }
}

export type DraftHeader = {
  doc_number: string
  doc_date: string
  counterparty_id: string
  total_amount: string
  notes: string
}

export type DraftLine = Pick<
  DocumentLine,
  'description' | 'part_number' | 'quantity' | 'unit' | 'unit_price' | 'discount' | 'received_quantity' | 'conversion_factor' | 'product_id' | 'match_source' | 'suggested_product_id'
> & { id: string | null }

export async function saveDraft(
  id: string,
  expectedUpdatedAt: string,
  header: Partial<DraftHeader>,
  lines: DraftLine[],
): Promise<{ updated_at: string; line_ids: string[] }> {
  const result = check(
    await supabase.rpc('save_draft', {
      p_document_id: id,
      p_expected_updated_at: expectedUpdatedAt,
      p_header: header as Json,
      p_lines: lines as unknown as Json,
    }),
  )
  return result as unknown as { updated_at: string; line_ids: string[] }
}

/** T6.1: the first open of a draft starts the pilot timer. The server keeps only the first one. */
export async function recordDocumentOpened(id: string): Promise<void> {
  check(await supabase.rpc('record_document_opened', { p_document_id: id }))
}

export type PostResult = { document_id: string; status: 'posted'; posted_at: string; already_posted: boolean; same_request: boolean }

export async function postDocument(id: string, idempotencyKey: string, overrideReason: string | null): Promise<PostResult> {
  const result = check(
    await supabase.rpc('post_document', {
      p_document_id: id,
      p_idempotency_key: idempotencyKey,
      ...(overrideReason ? { p_duplicate_override_reason: overrideReason } : {}),
    }),
  )
  return result as unknown as PostResult
}

export async function reverseDocument(id: string, reason: string): Promise<void> {
  check(await supabase.rpc('reverse_document', { p_document_id: id, p_reason: reason }))
}

export async function suggestProducts(
  shopId: string,
  counterpartyId: string | null,
  description: string | null,
  partNumber: string | null,
): Promise<Suggestion[]> {
  const rows = check(
    await supabase.rpc('suggest_products', {
      p_shop_id: shopId,
      p_counterparty_id: counterpartyId as string,
      p_description: description as string,
      p_part_number: partNumber as string,
    }),
  )
  return (rows ?? []) as Suggestion[]
}

// --- Movements ---------------------------------------------------------------

export async function listMovements(shopId: string, productId: string | null, limit = 200): Promise<Movement[]> {
  let q = supabase
    .from('stock_movements')
    .select(
      'id, qty::text, source, reason, created_at, product:products(id, sku, description, base_unit), document:documents(id, doc_number, direction, status)',
    )
    .eq('shop_id', shopId)
  if (productId) q = q.eq('product_id', productId)
  const rows = check(await q.order('created_at', { ascending: false }).limit(limit))
  return (rows ?? []) as unknown as Movement[]
}

export type DocumentMovement = { line_id: string | null; product_id: string; qty: string; source: string }

export async function listDocumentMovements(documentId: string): Promise<DocumentMovement[]> {
  const rows = check(
    await supabase.from('stock_movements').select('line_id:document_line_id, product_id, qty::text, source').eq('document_id', documentId),
  )
  return (rows ?? []) as DocumentMovement[]
}

// --- Overview and settings ---------------------------------------------------

export type RecordedSales = { day: string; currency: string; total: string; documents: number; lines_without_price: number }

export async function recordedSales(shopId: string, day: string): Promise<RecordedSales> {
  const result = check(await supabase.rpc('recorded_sales', { p_shop_id: shopId, p_day: day }))
  return result as unknown as RecordedSales
}

export type Member = { user_id: string; email: string; role: 'owner' | 'staff'; created_at: string; last_sign_in_at: string | null }

export async function listMembers(shopId: string): Promise<Member[]> {
  const rows = check(await supabase.rpc('list_members', { p_shop_id: shopId }))
  return (rows ?? []) as Member[]
}

export async function updateShop(shopId: string, input: { name: string; currency: string; timezone: string }): Promise<void> {
  const rows = check(await supabase.from('shops').update(input).eq('id', shopId).select('id'))
  if (!rows || rows.length === 0) throw { code: '42501', message: 'Only an owner can change settings.' }
}

export type InviteResult = { status: 'invited' | 'added'; email: string; role: 'owner' | 'staff' }

/** Calls the invite-member Edge Function; the secret key stays on the server (R-DATA-6). */
export async function inviteMember(shopId: string, email: string, role: 'owner' | 'staff'): Promise<InviteResult> {
  const { data, error } = await supabase.functions.invoke('invite-member', { body: { shop_id: shopId, email, role } })
  if (error) {
    // FunctionsHttpError carries the response; surface the function's own message.
    const response = (error as { context?: Response }).context
    const body = response ? await response.json().catch(() => null) : null
    throw { code: response?.status === 403 ? '42501' : 'INVITE', message: body?.error ?? error.message }
  }
  return data as InviteResult
}

// --- CSV import --------------------------------------------------------------

export async function importProducts(shopId: string, rows: object[]): Promise<{ inserted: number }> {
  const result = check(await supabase.rpc('import_products', { p_shop_id: shopId, p_rows: rows as unknown as Json }))
  return result as unknown as { inserted: number }
}

// --- Document files and extraction --------------------------------------------

/** R-DOC-1: the original goes to private storage under {shop}/{document}/ and is never changed. */
export async function uploadDocumentFile(shopId: string, documentId: string, file: File, type: string, name: string): Promise<void> {
  const path = `${shopId}/${documentId}/${name}`
  const { error } = await supabase.storage.from('documents').upload(path, file, { contentType: type, upsert: false })
  if (error) throw { code: 'UPLOAD', message: error.message }
  check(await supabase.from('documents').update({ file_path: path, file_mime: type, file_size: file.size }).eq('id', documentId).select('id'))
}

export type ExtractResult = { status: 'done' | 'not_available' | 'failed'; provider: string; lines_added: number; message: string | null }

/** Reads the uploaded file on the server. The result is an untrusted draft (R-EXT-3). */
export async function extractDocument(documentId: string): Promise<ExtractResult> {
  const { data, error } = await supabase.functions.invoke('extract-document', { body: { document_id: documentId } })
  if (error) {
    const response = (error as { context?: Response }).context
    const body = response ? await response.json().catch(() => null) : null
    throw { code: 'EXTRACT', message: body?.error ?? error.message }
  }
  return data as ExtractResult
}

/** A short-lived link for viewing a private file. */
export async function signedFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, 600)
  if (error || !data) throw { code: 'STORAGE', message: error?.message ?? 'No link' }
  return data.signedUrl
}
