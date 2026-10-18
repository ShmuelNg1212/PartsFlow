import { PlusIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { keys, listDocuments, type DocumentFilter } from '@/api/api'
import type { DocumentSummary } from '@/api/types'
import { PageHeader } from '@/components/app/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/app/states'
import { DocStatusBadge, StatusBadge } from '@/components/app/StatusBadge'
import { Button } from '@/components/ui/button'
import { NewDocumentDialog } from '@/features/documents/NewDocumentDialog'
import { directionNoun, formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useShop } from '@/shop/ShopProvider'

const TABS: { id: DocumentFilter; label: string }[] = [
  { id: 'drafts', label: 'To review' },
  { id: 'posted', label: 'Posted' },
  { id: 'all', label: 'All' },
]

export function InboxPage() {
  const { shop } = useShop()
  const [params, setParams] = useSearchParams()
  const filter = (TABS.find((t) => t.id === params.get('show'))?.id ?? 'drafts') as DocumentFilter
  const [creating, setCreating] = useState(false)
  const docs = useQuery({ queryKey: keys.documents(shop.id, filter), queryFn: () => listDocuments(shop.id, filter) })

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Invoices"
        description="Drafts never change stock. An owner posts each document after review."
        actions={
          <Button onClick={() => setCreating(true)} className="h-10">
            <PlusIcon /> New document
          </Button>
        }
      />
      <div role="tablist" aria-label="Documents" className="mb-4 inline-flex rounded-lg border border-border bg-card p-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={filter === t.id}
            onClick={() => setParams(t.id === 'drafts' ? {} : { show: t.id })}
            className={cn('min-h-9 rounded-md px-3 text-sm text-muted-foreground', filter === t.id && 'bg-accent font-medium text-foreground')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {docs.isPending ? (
        <LoadingState />
      ) : docs.isError ? (
        <ErrorState error={docs.error} onRetry={() => docs.refetch()} />
      ) : docs.data.length === 0 ? (
        <EmptyState title={filter === 'drafts' ? 'Nothing to review' : 'No documents yet'} action={<Button onClick={() => setCreating(true)}>New document</Button>}>
          {filter === 'drafts' ? 'New drafts appear here until an owner posts them.' : 'Posted documents appear here.'}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {docs.data.map((d) => (
            <DocumentRow key={d.id} doc={d} timeZone={shop.timezone} />
          ))}
        </ul>
      )}
      <NewDocumentDialog open={creating} onOpenChange={setCreating} />
    </div>
  )
}

function DocumentRow({ doc, timeZone }: { doc: DocumentSummary; timeZone: string }) {
  return (
    <li>
      <Link to={`/inbox/${doc.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-accent/60 active:bg-accent sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{directionNoun[doc.direction]}</span>
            {doc.doc_number && <span className="num break-all text-sm">{doc.doc_number}</span>}
            {doc.extraction_provider === 'demo' && <StatusBadge tone="blue">Demo extractor</StatusBadge>}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {doc.counterparty?.name ?? 'No counterparty'} · {doc.line_count} {doc.line_count === 1 ? 'line' : 'lines'} ·{' '}
            {doc.status === 'draft' ? `created ${formatDateTime(doc.created_at, timeZone)}` : `posted ${formatDateTime(doc.posted_at, timeZone)}`}
            {doc.doc_date && ` · dated ${formatDate(doc.doc_date, timeZone)}`}
          </p>
        </div>
        <DocStatusBadge status={doc.status} />
      </Link>
    </li>
  )
}
