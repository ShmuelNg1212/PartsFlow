import type { Direction, DocStatus } from '@/api/types'

export function formatDate(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '—'
  // A plain date (yyyy-mm-dd) has no time zone; show it as written.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone }).format(new Date(iso))
}

export function formatDateTime(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(iso))
}

export const directionLabel: Record<Direction, string> = { receipt: 'Receive stock', sale: 'Record a sale' }
export const directionNoun: Record<Direction, string> = { receipt: 'Receipt', sale: 'Sale' }
export const statusLabel: Record<DocStatus, string> = { draft: 'Draft', posted: 'Posted', reversed: 'Reversed' }
