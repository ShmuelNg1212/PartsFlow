// Turns Supabase/PostgREST errors into messages a shop user can act on.
// Codes come from the ledger functions (see supabase/migrations/*post_document.sql).

export type ShortItem = { product_id: string; sku: string; description: string; on_hand: string; requested: string }
export type DuplicateItem = { document_id: string; doc_number: string | null; reason: string }

export type AppError =
  | { kind: 'forbidden'; message: string }
  | { kind: 'insufficient_stock'; message: string; items: ShortItem[] }
  | { kind: 'duplicate'; message: string; items: DuplicateItem[] }
  | { kind: 'not_ready'; message: string }
  | { kind: 'wrong_status'; message: string }
  | { kind: 'invalid'; message: string; rows?: { row: number; errors: string[] }[] }
  | { kind: 'conflict'; message: string }
  | { kind: 'network'; message: string }
  | { kind: 'unknown'; message: string }

type PgLike = { code?: string; message?: string; details?: string | null; hint?: string | null; name?: string }

function parseJsonArray<T>(text: string | null | undefined): T[] {
  if (!text) return []
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value) ? (value as T[]) : []
  } catch {
    return []
  }
}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) return true
  const e = err as PgLike | undefined
  return !!e && typeof e.message === 'string' && /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(e.message)
}

export function toAppError(err: unknown): AppError {
  if (isNetworkError(err)) {
    return { kind: 'network', message: 'No connection to the server. Check the internet connection and try again.' }
  }
  const e = (err ?? {}) as PgLike
  const message = e.message || 'Something went wrong.'
  switch (e.code) {
    case '42501':
      return { kind: 'forbidden', message: /permission denied|row-level security/i.test(message) ? 'You do not have permission to do this.' : message }
    case 'PF001':
      return { kind: 'insufficient_stock', message, items: parseJsonArray<ShortItem>(e.details) }
    case 'PF002':
      return { kind: 'duplicate', message, items: parseJsonArray<DuplicateItem>(e.details) }
    case 'PF003':
      return { kind: 'not_ready', message }
    case '55000':
      return { kind: 'wrong_status', message }
    case '22023':
      return { kind: 'invalid', message, rows: parseJsonArray<{ row: number; errors: string[] }>(e.details) }
    case '23505':
      return { kind: 'conflict', message: uniqueMessage(e.details ?? message) }
    case '23514':
      return { kind: 'invalid', message: 'A value is out of range. Check the numbers and try again.' }
    default:
      return { kind: 'unknown', message }
  }
}

function uniqueMessage(text: string): string {
  if (/sku/i.test(text)) return 'A product with this SKU already exists.'
  if (/brand|part_number/i.test(text)) return 'A product with this brand and part number already exists.'
  if (/counterparties/i.test(text) || /name/i.test(text)) return 'This name already exists.'
  if (/line_no/i.test(text)) return 'Two lines have the same number. Reload the document.'
  return 'This already exists.'
}

export function errorMessage(err: unknown): string {
  return toAppError(err).message
}
