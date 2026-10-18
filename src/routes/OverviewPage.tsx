import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { keys, listDocuments, listLowStock } from '@/api/api'
import { PageHeader } from '@/components/app/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/app/states'
import { DocStatusBadge } from '@/components/app/StatusBadge'
import { formatQty } from '@/lib/decimal'
import { directionNoun, formatDateTime } from '@/lib/format'
import { useShop } from '@/shop/ShopProvider'

export function OverviewPage() {
  const { shop } = useShop()
  const drafts = useQuery({ queryKey: keys.documents(shop.id, 'drafts'), queryFn: () => listDocuments(shop.id, 'drafts', 10) })
  const low = useQuery({ queryKey: [...keys.overview(shop.id), 'low'], queryFn: () => listLowStock(shop.id) })
  const recent = useQuery({ queryKey: [...keys.overview(shop.id), 'recent'], queryFn: () => listDocuments(shop.id, 'posted', 8) })

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={shop.name} description="What needs attention today." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Waiting for review" link={{ to: '/inbox', label: 'All drafts' }}>
          {drafts.isPending ? (
            <LoadingState rows={3} />
          ) : drafts.isError ? (
            <ErrorState error={drafts.error} onRetry={() => drafts.refetch()} />
          ) : drafts.data.length === 0 ? (
            <EmptyState title="Nothing to review" />
          ) : (
            <ul className="divide-y divide-border">
              {drafts.data.map((d) => (
                <li key={d.id}>
                  <Link to={`/inbox/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-accent/60">
                    <span className="min-w-0 truncate">
                      {directionNoun[d.direction]} {d.doc_number && <span className="num">{d.doc_number}</span>}{' '}
                      <span className="text-muted-foreground">· {d.counterparty?.name ?? 'No counterparty'}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(d.created_at, shop.timezone)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Low stock" link={{ to: '/inventory', label: 'Inventory' }}>
          {low.isPending ? (
            <LoadingState rows={3} />
          ) : low.isError ? (
            <ErrorState error={low.error} onRetry={() => low.refetch()} />
          ) : low.data.length === 0 ? (
            <EmptyState title="No product is at or below its reorder threshold" />
          ) : (
            <ul className="divide-y divide-border">
              {low.data.map((p) => (
                <li key={p.id}>
                  <Link to={`/inventory/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-accent/60">
                    <span className="min-w-0 truncate">
                      <span className="num text-xs text-muted-foreground">{p.sku}</span> {p.description}
                    </span>
                    <span className="num shrink-0 text-yellow-fg">
                      {formatQty(p.qty)} / {formatQty(p.reorder_threshold)} {p.base_unit}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recently posted" link={{ to: '/inbox?show=posted', label: 'All posted' }} className="lg:col-span-2">
          {recent.isPending ? (
            <LoadingState rows={3} />
          ) : recent.isError ? (
            <ErrorState error={recent.error} onRetry={() => recent.refetch()} />
          ) : recent.data.length === 0 ? (
            <EmptyState title="Nothing posted yet" />
          ) : (
            <ul className="divide-y divide-border">
              {recent.data.map((d) => (
                <li key={d.id}>
                  <Link to={`/inbox/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-accent/60">
                    <span className="min-w-0 truncate">
                      {directionNoun[d.direction]} {d.doc_number && <span className="num">{d.doc_number}</span>}{' '}
                      <span className="text-muted-foreground">· {d.counterparty?.name ?? 'No counterparty'}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="hidden text-xs text-muted-foreground sm:inline">{formatDateTime(d.posted_at, shop.timezone)}</span>
                      <DocStatusBadge status={d.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

function Panel({ title, link, children, className }: { title: string; link: { to: string; label: string }; children: React.ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-lg border border-border bg-card ${className ?? ''}`}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-medium">{title}</h2>
        <Link to={link.to} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {link.label}
        </Link>
      </div>
      <div className="[&>div]:m-3">{children}</div>
    </section>
  )
}
