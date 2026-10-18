import type { DocumentDetail, RawField } from '@/api/types'
import { StatusBadge } from '@/components/app/StatusBadge'
import { isDecimalString, toDecimal } from '@/lib/decimal'
import { cn } from '@/lib/utils'

export const UNCERTAIN_BELOW = 0.8

/** "17070.00" and "17070" are the same value; text compares as text. */
export function sameValue(raw: string, current: string): boolean {
  if (isDecimalString(raw, 6) && isDecimalString(current, 6)) return toDecimal(raw).equals(toDecimal(current))
  return raw.trim() === current.trim()
}

/** What read the document, and what the user must still check (R-DOC-5, R-EXT-3, R-EXT-4). */
export function ExtractionBanner({ doc }: { doc: DocumentDetail }) {
  const status = doc.extraction_status
  if (status === 'none' || status === 'pending') return null
  const demo = doc.extraction_provider === 'demo'
  if (status === 'done') {
    return (
      <div key={status} role="status" className="motion-enter mb-4 rounded-lg border border-blue-fg/20 bg-blue-bg px-4 py-3 text-sm text-blue-fg">
        {demo ? (
          <>
            <StatusBadge tone="blue" className="mr-2 bg-card">Demo extractor</StatusBadge>
            These values are prepared results for a bundled synthetic sample. Nothing was read from the image.
          </>
        ) : (
          <>Read automatically ({doc.extraction_provider}). </>
        )}{' '}
        Check every line, select the products, and enter what you received. Fields marked in yellow were uncertain or not found.
      </div>
    )
  }
  const message = doc.raw_extraction?.message ?? (status === 'failed' ? 'The document could not be read.' : 'Automatic reading is not available.')
  return (
    <div key={status} role="status" className="motion-enter mb-4 rounded-lg border border-yellow-fg/20 bg-yellow-bg px-4 py-3 text-sm text-yellow-fg">
      {message} {/enter/i.test(message) ? '' : 'Enter the lines by hand.'}
    </div>
  )
}

/** Small mark under a header field: the raw value when it differs, and uncertain or missing state. */
export function FieldMark({ raw, current, extracted }: { raw: RawField | undefined; current: string; extracted: boolean }) {
  if (!extracted) return null
  if (!raw || raw.value === null || raw.value === undefined) return <p className="text-[11px] text-yellow-fg">Not found on the document</p>
  const low = typeof raw.confidence === 'number' && raw.confidence < UNCERTAIN_BELOW
  const differs = !sameValue(String(raw.value), current)
  if (!low && !differs) return null
  return (
    <p className={cn('truncate text-[11px]', low ? 'text-yellow-fg' : 'text-muted-foreground')} title={`Extracted: ${raw.value}`}>
      {low ? 'Uncertain. ' : ''}Extracted: {String(raw.value)}
    </p>
  )
}
