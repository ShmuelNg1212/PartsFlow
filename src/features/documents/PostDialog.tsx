import { useState } from 'react'
import type { Direction } from '@/api/types'
import { StatusBadge } from '@/components/app/StatusBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatQty } from '@/lib/decimal'
import { toAppError, type AppError } from '@/lib/errors'
import { directionNoun } from '@/lib/format'
import { lineIssues, stockSummary, type EditableLine } from './draft'

type Phase = { kind: 'review' } | { kind: 'posting' } | { kind: 'error'; error: AppError } | { kind: 'unknown' }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  direction: Direction
  lines: EditableLine[]
  /** Saves pending edits, then posts with this key. Resolves when the server confirms. */
  onPost: (idempotencyKey: string, overrideReason: string | null) => Promise<void>
  /** After an unknown result: reload the document and report whether it is posted. */
  onCheckStatus: () => Promise<boolean>
}

export function PostDialog({ open, onOpenChange, direction, lines, onPost, onCheckStatus }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'review' })
  const [reason, setReason] = useState('')
  // One key per opening of this dialog (the parent mounts it fresh). Retries reuse it, so the server posts once (R-POST-6).
  const [key] = useState(() => crypto.randomUUID())

  const real = lines.filter((l) => l.id || l.description.trim() || l.product_id || l.quantity.trim())
  const issues = real.flatMap((l, i) => lineIssues(l, direction).map((t) => `Line ${i + 1}: ${t}`))
  const summary = stockSummary(direction, real)
  const duplicate = phase.kind === 'error' && phase.error.kind === 'duplicate' ? phase.error : null
  const blocked = issues.length > 0 || real.length === 0

  const post = async () => {
    setPhase({ kind: 'posting' })
    try {
      await onPost(key, duplicate ? reason.trim() || null : null)
      onOpenChange(false)
    } catch (err) {
      const appError = toAppError(err)
      if (appError.kind === 'network') {
        setPhase({ kind: 'unknown' })
        try {
          if (await onCheckStatus()) onOpenChange(false)
        } catch {
          // Still offline: the dialog keeps "Result unknown" and offers a retry with the same key.
        }
      } else {
        setPhase({ kind: 'error', error: appError })
      }
    }
  }

  const posting = phase.kind === 'posting'

  return (
    <Dialog open={open} onOpenChange={(o) => !posting && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Post this {directionNoun[direction].toLowerCase()}?</DialogTitle>
          <DialogDescription>
            Posting changes stock now. A posted document does not change later; to correct it, an owner reverses it with a reason.
          </DialogDescription>
        </DialogHeader>

        {blocked ? (
          <div className="rounded-md bg-yellow-bg px-3 py-2 text-sm text-yellow-fg">
            <p className="font-medium">Fix these before posting:</p>
            {real.length === 0 ? (
              <p>Add at least one line.</p>
            ) : (
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {issues.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div>
            <p className="mb-2 text-sm font-medium">Stock changes</p>
            <ul className="divide-y divide-border rounded-md border border-border">
              {summary.map((r) => (
                <li key={r.product.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="num text-xs text-muted-foreground">{r.product.sku}</span>{' '}
                    <span className="break-words">{r.product.description}</span>
                  </span>
                  <span className={r.delta.isPositive() ? 'num shrink-0 text-green-fg' : 'num shrink-0 text-red-fg'}>
                    {r.delta.isPositive() ? '+' : '−'}
                    {formatQty(r.delta.abs())} {r.product.base_unit}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {phase.kind === 'error' && !duplicate && (
          <div role="alert" className="rounded-md bg-red-bg px-3 py-2 text-sm text-red-fg">
            <p className="font-medium">Not posted.</p>
            <p className="break-words">{phase.error.message}</p>
            {phase.error.kind === 'insufficient_stock' && phase.error.items.length > 1 && (
              <ul className="mt-1 list-disc pl-5">
                {phase.error.items.map((it) => (
                  <li key={it.product_id}>
                    {it.description} ({it.sku}): on hand {it.on_hand}, requested {it.requested}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {duplicate && (
          <div role="alert" className="space-y-2 rounded-md bg-yellow-bg px-3 py-2 text-sm text-yellow-fg">
            <p className="font-medium">Possible duplicate. Not posted.</p>
            <ul className="list-disc pl-5">
              {duplicate.items.map((d) => (
                <li key={d.document_id + d.reason}>
                  <a href={`/inbox/${d.document_id}`} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                    {d.doc_number ?? 'Document'}
                  </a>{' '}
                  has the {d.reason}.
                </li>
              ))}
            </ul>
            <div className="space-y-1 pt-1 text-foreground">
              <Label htmlFor="override-reason">Post anyway: reason (owner only)</Label>
              <Textarea id="override-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: the supplier reused the invoice number for a second delivery." />
            </div>
          </div>
        )}

        {phase.kind === 'unknown' && (
          <div role="alert" className="rounded-md bg-yellow-bg px-3 py-2 text-sm text-yellow-fg">
            <p className="font-medium">Result unknown.</p>
            <p>The connection dropped while posting. PartsFlow is checking the status. You can retry safely: the same request posts only once.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={posting}>
            Cancel
          </Button>
          {!blocked && (
            <Button onClick={post} disabled={posting || (!!duplicate && !reason.trim())}>
              {posting ? 'Posting…' : duplicate ? 'Post anyway' : phase.kind === 'unknown' ? 'Retry post' : 'Post'}
            </Button>
          )}
        </DialogFooter>
        {posting && (
          <p className="text-xs text-muted-foreground">
            <StatusBadge tone="neutral">Waiting for the server</StatusBadge> Do not close this window.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
