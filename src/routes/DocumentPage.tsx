import { ArrowLeftIcon, ArrowUUpLeftIcon, CheckCircleIcon, FloppyDiskIcon, TrashIcon } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { deleteDraft, getDocument, getProduct, keys, listDocumentMovements, postDocument, recordDocumentOpened, saveDraft } from '@/api/api'
import type { DocumentDetail, LineProduct } from '@/api/types'
import { PageHeader } from '@/components/app/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/app/states'
import { DocStatusBadge, StatusBadge } from '@/components/app/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AttachDocument } from '@/features/documents/AttachDocument'
import { CounterpartyField } from '@/features/documents/CounterpartyField'
import { DocumentViewer } from '@/features/documents/DocumentViewer'
import { editableFrom, sameDraft, toSavePayload, type DraftState, type EditableLine } from '@/features/documents/draft'
import { ExtractionBanner, FieldMark } from '@/features/documents/ExtractionBanner'
import { LinesEditor } from '@/features/documents/LinesEditor'
import { clearLocalDraft, readLocalDraft, writeLocalDraft, type LocalDraft } from '@/features/documents/localDraft'
import { PostDialog } from '@/features/documents/PostDialog'
import { ReverseDialog } from '@/features/documents/ReverseDialog'
import { ProductDialog } from '@/features/products/ProductDialog'
import { formatMoney, formatQty, isDecimalString, toDecimal } from '@/lib/decimal'
import { errorMessage } from '@/lib/errors'
import { directionLabel, directionNoun, formatDate, formatDateTime } from '@/lib/format'
import { useShop } from '@/shop/ShopProvider'

export function DocumentPage() {
  const { id = '' } = useParams()
  const { shop } = useShop()
  const doc = useQuery({ queryKey: keys.document(shop.id, id), queryFn: () => getDocument(id) })

  const back = (
    <Link to="/inbox" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeftIcon className="size-4" /> Invoices
    </Link>
  )

  if (doc.isPending) return <div className="mx-auto max-w-6xl">{back}<LoadingState rows={6} label="Loading document" /></div>
  if (doc.isError) return <div className="mx-auto max-w-6xl">{back}<ErrorState error={doc.error} onRetry={() => doc.refetch()} /></div>
  if (!doc.data) return <div className="mx-auto max-w-6xl">{back}<EmptyState title="Document not found">It may have been deleted, or it belongs to another shop.</EmptyState></div>

  return (
    <div className="mx-auto max-w-6xl">
      {back}
      {doc.data.status === 'draft' ? <DraftWorkspace key={doc.data.id} doc={doc.data} /> : <PostedDocument doc={doc.data} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Draft workspace
// ---------------------------------------------------------------------------

function DraftWorkspace({ doc }: { doc: DocumentDetail }) {
  const { shop, isOwner } = useShop()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // `base` is the last server state; `state` is what the user sees and edits.
  const [base, setBase] = useState<{ state: DraftState; updatedAt: string }>(() => ({ state: editableFrom(doc), updatedAt: doc.updated_at }))
  const [state, setState] = useState<DraftState>(() => editableFrom(doc))
  const [restore, setRestore] = useState<LocalDraft | null>(() => {
    const local = readLocalDraft(doc.id)
    return local && !sameDraft(local.state, editableFrom(doc)) ? local : null
  })
  const [conflict, setConflict] = useState(false)
  const [showIssues, setShowIssues] = useState(false)
  const [posting, setPosting] = useState(false)
  const [creatingFor, setCreatingFor] = useState<EditableLine | null>(null)
  const dirty = !sameDraft(state, base.state)

  // A newer server version (another session saved, realtime refresh) replaces the view only when nothing is pending here.
  // Adjusting state during render is React's pattern for deriving state from a changed prop.
  if (doc.updated_at !== base.updatedAt && !dirty) {
    const next = editableFrom(doc)
    setBase({ state: next, updatedAt: doc.updated_at })
    setState(next)
  }

  // T6.1: pilot timer. Measurement must never block the draft, so a failure is ignored.
  useEffect(() => {
    recordDocumentOpened(doc.id).catch(() => undefined)
  }, [doc.id])

  // Keep an unsaved copy on this device.
  useEffect(() => {
    if (!dirty) {
      if (!restore) clearLocalDraft(doc.id)
      return
    }
    const t = setTimeout(() => writeLocalDraft(doc.id, { savedAt: new Date().toISOString(), baseUpdatedAt: base.updatedAt, state }), 400)
    return () => clearTimeout(t)
  }, [dirty, state, base.updatedAt, doc.id, restore])

  // Warn before leaving with unsaved edits (in-app navigation and tab close).
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state === 'blocked') {
      if (window.confirm('This draft has unsaved changes. They stay on this device. Leave anyway?')) blocker.proceed()
      else blocker.reset()
    }
  }, [blocker])
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const reload = useCallback(async () => {
    const fresh = await queryClient.fetchQuery({ queryKey: keys.document(shop.id, doc.id), queryFn: () => getDocument(doc.id) })
    return fresh
  }, [queryClient, shop.id, doc.id])

  const applyServer = useCallback((fresh: DocumentDetail) => {
    const next = editableFrom(fresh)
    setBase({ state: next, updatedAt: fresh.updated_at })
    setState(next)
  }, [])

  const save = useMutation({
    mutationFn: async () => {
      const payload = toSavePayload(state)
      await saveDraft(doc.id, base.updatedAt, payload.header, payload.lines)
      const fresh = await reload()
      if (!fresh) throw new Error('The draft is gone.')
      return fresh
    },
    onSuccess: (fresh) => {
      if (fresh.status === 'draft') applyServer(fresh)
      clearLocalDraft(doc.id)
      setConflict(false)
      queryClient.invalidateQueries({ queryKey: keys.documents(shop.id, 'drafts') })
    },
    onError: (err) => {
      if ((err as { code?: string }).code === 'PF004') setConflict(true)
    },
  })

  // Ctrl/Cmd+S saves.
  const onSaveShortcut = useEffectEvent((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      if (!save.isPending && dirty) save.mutate()
    }
  })
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onSaveShortcut(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const remove = useMutation({
    mutationFn: () => deleteDraft(doc.id),
    onSuccess: () => {
      clearLocalDraft(doc.id)
      setBase((b) => ({ ...b, state }))
      queryClient.invalidateQueries({ queryKey: keys.shop(shop.id) })
      navigate('/inbox', { replace: true })
    },
  })

  const onPost = async (idempotencyKey: string, overrideReason: string | null) => {
    if (dirty) {
      const payload = toSavePayload(state)
      await saveDraft(doc.id, base.updatedAt, payload.header, payload.lines)
      // Adopt the saved version now: if the post is refused (duplicate, stock), a retry must not save with a stale version.
      const fresh = await reload()
      if (fresh?.status === 'draft') applyServer(fresh)
    }
    const result = await postDocument(doc.id, idempotencyKey, overrideReason)
    clearLocalDraft(doc.id)
    setBase((b) => ({ ...b, state }))
    await queryClient.invalidateQueries({ queryKey: keys.shop(shop.id) })
    // R-UI-1: the posted view renders from the refetched server document, never from local state.
    toast.success(result.already_posted ? 'This document was already posted.' : 'Posted. Stock is updated.')
  }

  const checkStatus = async () => {
    const fresh = await reload()
    if (fresh && fresh.status !== 'draft') {
      clearLocalDraft(doc.id)
      setBase((b) => ({ ...b, state }))
      await queryClient.invalidateQueries({ queryKey: keys.shop(shop.id) })
      return true
    }
    return false
  }

  const setHeader = (patch: Partial<DraftState['header']>) => setState((s) => ({ ...s, header: { ...s.header, ...patch } }))
  const totalInvalid = state.header.total_amount.trim() !== '' && !isDecimalString(state.header.total_amount, 2)
  const extracted = doc.extraction_status === 'done'

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {directionLabel[doc.direction]} <DocStatusBadge status="draft" />
          </span>
        }
        description={
          <span>
            Created {formatDateTime(doc.created_at, shop.timezone)}. Drafts never change stock.
            {doc.extraction_provider === 'demo' && <StatusBadge tone="blue" className="ml-2">Demo extractor</StatusBadge>}
          </span>
        }
      />

      {restore && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-blue-fg/20 bg-blue-bg px-4 py-3 text-sm text-blue-fg">
          <span className="flex-1">Unsaved changes from {formatDateTime(restore.savedAt, shop.timezone)} are on this device.</span>
          <Button
            size="sm"
            onClick={() => {
              setState(restore.state)
              setRestore(null)
            }}
          >
            Restore them
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="bg-card"
            onClick={() => {
              clearLocalDraft(doc.id)
              setRestore(null)
            }}
          >
            Discard
          </Button>
        </div>
      )}

      {conflict && (
        <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-red-fg/20 bg-red-bg px-4 py-3 text-sm text-red-fg">
          <span className="flex-1">Someone else saved this draft after you opened it. Your changes are kept on this device. Reload to see their version, then restore yours if needed.</span>
          <Button
            size="sm"
            variant="outline"
            className="bg-card"
            onClick={async () => {
              const fresh = await reload()
              if (fresh) applyServer(fresh)
              setConflict(false)
              setRestore(readLocalDraft(doc.id))
            }}
          >
            Reload
          </Button>
        </div>
      )}

      <ExtractionBanner doc={doc} />
      <div className={doc.file_path ? 'lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-6' : undefined}>
      {doc.file_path ? (
        <DocumentViewer path={doc.file_path} mime={doc.file_mime} className="mb-6 lg:sticky lg:top-4" />
      ) : (
        <AttachDocument documentId={doc.id} blocked={dirty} onDone={() => void reload()} />
      )}
      <div className="@container min-w-0">
      <section aria-label="Document details" className="mb-6 grid gap-4 rounded-lg border border-border bg-card p-4 @md:grid-cols-2 @3xl:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="doc-number">Document number</Label>
          <Input id="doc-number" className="num text-base sm:text-sm" value={state.header.doc_number} onChange={(e) => setHeader({ doc_number: e.target.value })} />
          <FieldMark raw={doc.raw_extraction?.doc_number} current={state.header.doc_number} extracted={extracted} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-date">Document date</Label>
          <Input id="doc-date" type="date" className="text-base sm:text-sm" value={state.header.doc_date} onChange={(e) => setHeader({ doc_date: e.target.value })} />
          <FieldMark raw={doc.raw_extraction?.doc_date} current={state.header.doc_date} extracted={extracted} />
        </div>
        <div className="space-y-1.5 @md:col-span-2">
          <Label htmlFor="doc-counterparty">{doc.direction === 'receipt' ? 'Supplier' : 'Customer'}</Label>
          <CounterpartyField id="doc-counterparty" direction={doc.direction} value={state.header.counterparty_id} onChange={(cp) => setHeader({ counterparty_id: cp })} />
          {doc.raw_counterparty && !state.header.counterparty_id && (
            <p className="text-[11px] text-yellow-fg">On the document: {doc.raw_counterparty}. Select it, or add it with "+ Add".</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doc-total">Document total ({shop.currency})</Label>
          <Input
            id="doc-total"
            inputMode="decimal"
            className="num text-base sm:text-sm"
            aria-invalid={totalInvalid}
            value={state.header.total_amount}
            onChange={(e) => setHeader({ total_amount: e.target.value })}
          />
          {totalInvalid ? (
            <p className="text-xs text-red-fg">Enter a number with at most 2 decimals.</p>
          ) : (
            <FieldMark raw={doc.raw_extraction?.totals?.total} current={state.header.total_amount} extracted={extracted} />
          )}
        </div>
        <div className="space-y-1.5 @md:col-span-2 @3xl:col-span-3">
          <Label htmlFor="doc-notes">Notes</Label>
          <Textarea id="doc-notes" rows={1} className="min-h-9 text-base sm:text-sm" value={state.header.notes} onChange={(e) => setHeader({ notes: e.target.value })} />
        </div>
      </section>

      <section aria-label="Lines" className="mb-6">
        <h2 className="mb-1 text-lg font-medium">Lines</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          {doc.direction === 'receipt'
            ? 'Enter what the document says, then the quantity you physically received. Only the received quantity changes stock.'
            : 'Enter the goods released to the customer.'}
        </p>
        <LinesEditor
          direction={doc.direction}
          lines={state.lines}
          onChange={(lines) => setState((s) => ({ ...s, lines }))}
          counterpartyId={state.header.counterparty_id || null}
          showIssues={showIssues}
          onCreateProduct={isOwner ? (line) => setCreatingFor(line) : undefined}
        />
      </section>
      </div>
      </div>

      {/* Action bar: sticky at the bottom, above the phone navigation. */}
      <div className="sticky bottom-16 z-20 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 md:bottom-0 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-sm text-muted-foreground" aria-live="polite">
            {save.isPending ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}
            {save.isError && !conflict && <span className="ml-2 text-red-fg">Not saved: {errorMessage(save.error)}</span>}
          </span>
          <Button
            variant="ghost"
            className="h-10 text-muted-foreground"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm('Delete this draft? This cannot be undone. Stock is not affected.')) remove.mutate()
            }}
          >
            <TrashIcon /> Delete
          </Button>
          <Button variant="outline" className="h-10" disabled={!dirty || save.isPending || totalInvalid} onClick={() => save.mutate()}>
            <FloppyDiskIcon /> Save draft <kbd className="ml-1 hidden rounded border border-border px-1 text-[10px] text-muted-foreground sm:inline">⌘S</kbd>
          </Button>
          {isOwner ? (
            <Button
              className="h-10"
              disabled={conflict || totalInvalid}
              onClick={() => {
                setShowIssues(true)
                setPosting(true)
              }}
            >
              <CheckCircleIcon /> Review and post
            </Button>
          ) : (
            <span className="text-sm text-muted-foreground">An owner posts this document.</span>
          )}
        </div>
        {remove.isError && <p className="mt-1 text-sm text-red-fg">{errorMessage(remove.error)}</p>}
      </div>

      {isOwner && (
        <>
          {posting && (
          <PostDialog
            open={posting}
            onOpenChange={setPosting}
            direction={doc.direction}
            lines={state.lines}
            onPost={async (key, reason) => {
              try {
                await onPost(key, reason)
              } catch (err) {
                if ((err as { code?: string }).code === 'PF004') setConflict(true)
                throw err
              }
            }}
            onCheckStatus={checkStatus}
          />
          )}
          <ProductDialog
            open={!!creatingFor}
            onOpenChange={(o) => !o && setCreatingFor(null)}
            initial={
              creatingFor
                ? { description: creatingFor.description, part_number: creatingFor.part_number, base_unit: creatingFor.unit || 'pc', sku: creatingFor.part_number }
                : undefined
            }
            onSaved={async (productId) => {
              const line = creatingFor
              setCreatingFor(null)
              if (!line) return
              // R-DOC-7: the new product is selected on the line it came from.
              const p = await getProduct(productId)
              if (!p) return
              const product: LineProduct = { id: p.id, sku: p.sku, description: p.description, brand: p.brand, base_unit: p.base_unit, part_number: p.part_number }
              setState((s) => ({ ...s, lines: s.lines.map((l) => (l.key === line.key ? { ...l, product, product_id: p.id, match_source: 'created' } : l)) }))
            }}
          />
        </>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Posted or reversed document (read only)
// ---------------------------------------------------------------------------

function PostedDocument({ doc }: { doc: DocumentDetail }) {
  const { shop, isOwner } = useShop()
  const queryClient = useQueryClient()
  const [reversing, setReversing] = useState(false)
  const movements = useQuery({ queryKey: [...keys.document(shop.id, doc.id), 'movements'], queryFn: () => listDocumentMovements(doc.id) })

  const byLine = useMemo(() => {
    const map = new Map<string, { posted: string; reversed: string }>()
    for (const m of movements.data ?? []) {
      if (!m.line_id) continue
      const entry = map.get(m.line_id) ?? { posted: '0', reversed: '0' }
      if (m.source === 'reversal') entry.reversed = toDecimal(entry.reversed).plus(m.qty).toString()
      else entry.posted = toDecimal(entry.posted).plus(m.qty).toString()
      map.set(m.line_id, entry)
    }
    return map
  }, [movements.data])

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {directionNoun[doc.direction]} {doc.doc_number && <span className="num text-xl break-all">{doc.doc_number}</span>}
            <DocStatusBadge status={doc.status} />
          </span>
        }
        description={`Posted ${formatDateTime(doc.posted_at, shop.timezone)}. Posted documents do not change.`}
        actions={
          isOwner &&
          doc.status === 'posted' && (
            <Button variant="outline" onClick={() => setReversing(true)}>
              <ArrowUUpLeftIcon /> Reverse
            </Button>
          )
        }
      />

      {doc.status === 'reversed' && (
        <div className="mb-4 rounded-lg border border-border bg-secondary px-4 py-3 text-sm">
          Reversed {formatDateTime(doc.reversed_at, shop.timezone)}. Reason: <span className="break-words">{doc.reversal_reason}</span>
        </div>
      )}
      {doc.duplicate_override_reason && (
        <div className="mb-4 rounded-lg border border-yellow-fg/20 bg-yellow-bg px-4 py-3 text-sm text-yellow-fg">
          Posted despite a duplicate warning. Reason: <span className="break-words">{doc.duplicate_override_reason}</span>
        </div>
      )}

      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        {[
          [doc.direction === 'receipt' ? 'Supplier' : 'Customer', doc.counterparty?.name ?? '—'],
          ['Document date', formatDate(doc.doc_date, shop.timezone)],
          ['Document total', doc.total_amount ? formatMoney(doc.total_amount, shop.currency) : '—'],
          ['Notes', doc.notes ?? '—'],
        ].map(([label, value]) => (
          <div key={label} className="bg-card px-4 py-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words">{value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mb-3 text-lg font-medium">Lines and stock movements</h2>
      {movements.isError && <ErrorState error={movements.error} onRetry={() => movements.refetch()} />}
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {doc.lines.map((l) => {
          const mv = byLine.get(l.id)
          return (
            <li key={l.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-sm">
              <span className="num w-6 text-muted-foreground">{l.line_no}</span>
              <div className="min-w-0 flex-1">
                {l.product ? (
                  <Link to={`/inventory/${l.product.id}`} className="hover:underline">
                    <span className="num text-xs text-muted-foreground">{l.product.sku}</span> {l.product.description}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">No product</span>
                )}
                <p className="text-xs break-words text-muted-foreground">
                  On document: {l.description ?? '—'}
                  {l.part_number && ` · ${l.part_number}`} · qty {formatQty(l.quantity)} {l.unit ?? ''}
                  {doc.direction === 'receipt' && ` · received ${formatQty(l.received_quantity)}`}
                  {l.conversion_factor && ` · ×${formatQty(l.conversion_factor)}`}
                </p>
              </div>
              <div className="text-right">
                {mv && (
                  <p className={toDecimal(mv.posted).isPositive() ? 'num text-green-fg' : 'num text-red-fg'}>
                    {toDecimal(mv.posted).isPositive() ? '+' : '−'}
                    {formatQty(toDecimal(mv.posted).abs())} {l.product?.base_unit}
                  </p>
                )}
                {mv && !toDecimal(mv.reversed).isZero() && (
                  <p className="num text-xs text-muted-foreground">
                    reversed {toDecimal(mv.reversed).isPositive() ? '+' : '−'}
                    {formatQty(toDecimal(mv.reversed).abs())}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {isOwner && (
        <ReverseDialog
          open={reversing}
          onOpenChange={setReversing}
          documentId={doc.id}
          onDone={() => {
            queryClient.invalidateQueries({ queryKey: keys.shop(shop.id) })
            toast.success('Reversed. Stock is restored.')
          }}
        />
      )}
    </>
  )
}
