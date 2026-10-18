import { Link } from 'react-router'
import type { Movement } from '@/api/types'
import { StatusBadge } from '@/components/app/StatusBadge'
import { formatQty, toDecimal } from '@/lib/decimal'
import { directionNoun, formatDateTime } from '@/lib/format'

const sourceLabel: Record<Movement['source'], string> = {
  document_line: 'Document',
  opening: 'Opening quantity',
  reversal: 'Reversal',
}

function Qty({ m }: { m: Movement }) {
  const d = toDecimal(m.qty)
  const positive = d.greaterThan(0)
  return (
    <span className={positive ? 'num text-green-fg' : 'num text-red-fg'}>
      {positive ? '+' : '−'}
      {formatQty(d.abs())}
      {m.product && <span className="ml-1 text-muted-foreground">{m.product.base_unit}</span>}
    </span>
  )
}

function Source({ m }: { m: Movement }) {
  if (!m.document) return <span>{sourceLabel[m.source]}</span>
  const label = `${directionNoun[m.document.direction]}${m.document.doc_number ? ` ${m.document.doc_number}` : ''}`
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {m.source === 'reversal' && <StatusBadge>Reversal</StatusBadge>}
      <Link to={`/inbox/${m.document.id}`} className="underline underline-offset-4 break-all">
        {label}
      </Link>
    </span>
  )
}

/** The ledger (R-STOCK-2). Each movement links to its source document. */
export function MovementList({ movements, timeZone, showProduct }: { movements: Movement[]; timeZone: string; showProduct: boolean }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              {showProduct && <th className="px-3 py-2 font-medium">Product</th>}
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Reason</th>
              <th className="px-3 py-2 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatDateTime(m.created_at, timeZone)}</td>
                {showProduct && (
                  <td className="max-w-72 px-3 py-2">
                    {m.product && (
                      <Link to={`/inventory/${m.product.id}`} className="hover:underline">
                        <span className="num">{m.product.sku}</span> <span className="text-muted-foreground">{m.product.description}</span>
                      </Link>
                    )}
                  </td>
                )}
                <td className="px-3 py-2">
                  <Source m={m} />
                </td>
                <td className="max-w-60 px-3 py-2 break-words text-muted-foreground">{m.reason ?? '—'}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Qty m={m} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
        {movements.map((m) => (
          <li key={m.id} className="flex items-start gap-3 px-3 py-3">
            <div className="min-w-0 flex-1 text-sm">
              {showProduct && m.product && (
                <Link to={`/inventory/${m.product.id}`} className="block break-words">
                  <span className="num">{m.product.sku}</span> {m.product.description}
                </Link>
              )}
              <Source m={m} />
              {m.reason && <p className="mt-0.5 text-xs break-words text-muted-foreground">{m.reason}</p>}
              <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(m.created_at, timeZone)}</p>
            </div>
            <div className="shrink-0 text-sm">
              <Qty m={m} />
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
