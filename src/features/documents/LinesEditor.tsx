import { PlusIcon, TrashIcon } from '@phosphor-icons/react'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import type { Direction } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { emptyLine, lineIssues, needsFactor, type EditableLine } from './draft'
import { sameValue, UNCERTAIN_BELOW } from './ExtractionBanner'
import { ProductPicker, type Pick } from './ProductPicker'

type Props = {
  direction: Direction
  lines: EditableLine[]
  onChange: (lines: EditableLine[]) => void
  counterpartyId: string | null
  showIssues: boolean
  onCreateProduct?: (line: EditableLine) => void
}

type Field = 'description' | 'part_number' | 'quantity' | 'unit' | 'received_quantity' | 'conversion_factor' | 'unit_price'

/** R-DOC-4, R-DOC-5: the raw extracted value when it differs, and uncertain or missing fields. */
function RawHint({ line, field }: { line: EditableLine; field: string }) {
  if (!line.raw) return null
  const raw = line.raw[field]
  const current = (line as unknown as Record<string, string>)[field] ?? ''
  if (!raw || raw.value === null || raw.value === undefined) {
    return ['description', 'quantity', 'unit_price'].includes(field) && !current ? <p className="mt-0.5 text-[11px] text-yellow-fg">Not found</p> : null
  }
  const low = typeof raw.confidence === 'number' && raw.confidence < UNCERTAIN_BELOW
  const differs = !sameValue(String(raw.value), current)
  if (!low && !differs) return null
  return (
    <p className={cn('mt-0.5 truncate text-[11px]', low ? 'text-yellow-fg' : 'text-muted-foreground')} title={`Extracted: ${raw.value}`}>
      {low ? 'Uncertain: ' : 'Extracted: '}
      {String(raw.value)}
    </p>
  )
}

export function LinesEditor({ direction, lines, onChange, counterpartyId, showIssues, onCreateProduct }: Props) {
  const focusKey = useRef<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focusKey.current) return
    const el = root.current?.querySelector<HTMLInputElement>(`[data-line="${focusKey.current}"][data-field="description"]:not([data-hidden])`)
    // Focus the visible copy (table on desktop, card on phone).
    const visible = [...(root.current?.querySelectorAll<HTMLInputElement>(`[data-line="${focusKey.current}"][data-field="description"]`) ?? [])].find(
      (n) => n.offsetParent !== null,
    )
    ;(visible ?? el)?.focus()
    focusKey.current = null
  }, [lines])

  const update = (key: string, patch: Partial<EditableLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const remove = (key: string) => onChange(lines.filter((l) => l.key !== key))
  const add = () => {
    const line = emptyLine()
    focusKey.current = line.key
    onChange([...lines, line])
  }
  const onPick = (key: string, pick: Pick) =>
    update(key, { product: pick.product, product_id: pick.product.id, match_source: pick.source === 'manual' ? 'manual' : pick.source })

  // Keyboard entry: Enter on the last line adds a new line.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, key: string) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (lines[lines.length - 1]?.key === key) add()
    }
  }

  const input = (l: EditableLine, field: Field, opts: { label: string; mono?: boolean; decimal?: boolean; className?: string }) => (
    <>
      <Input
        aria-label={`Line ${lines.indexOf(l) + 1} ${opts.label}`}
        data-line={l.key}
        data-field={field}
        value={l[field]}
        inputMode={opts.decimal ? 'decimal' : undefined}
        onChange={(e) => update(l.key, { [field]: e.target.value })}
        onKeyDown={(e) => onKeyDown(e, l.key)}
        className={cn('h-9 bg-card text-base sm:text-sm', opts.mono && 'num', opts.className)}
      />
      <RawHint line={l} field={field === 'unit_price' ? 'unit_price' : field} />
    </>
  )

  const receipt = direction === 'receipt'
  const anyFactor = lines.some(needsFactor)

  return (
    <div ref={root} className="@container">
      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-card @4xl:block">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2 font-medium">#</th>
              <th className="min-w-48 px-2 py-2 font-medium">Description on document</th>
              <th className="w-32 px-2 py-2 font-medium">Part no.</th>
              <th className="w-20 px-2 py-2 font-medium">{receipt ? 'Invoice qty' : 'Qty'}</th>
              <th className="w-20 px-2 py-2 font-medium">Unit</th>
              {receipt && <th className="w-24 px-2 py-2 font-medium">Received</th>}
              {anyFactor && <th className="w-24 px-2 py-2 font-medium">Base per unit</th>}
              <th className="w-24 px-2 py-2 font-medium">Price</th>
              <th className="min-w-56 px-2 py-2 font-medium">Product</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const issues = showIssues ? lineIssues(l, direction) : []
              return (
                <tr key={l.key} className={cn('border-b border-border align-top last:border-0', issues.length > 0 && 'bg-yellow-bg/40')}>
                  <td className="num px-2 py-2.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-1.5">{input(l, 'description', { label: 'description' })}</td>
                  <td className="px-2 py-1.5">{input(l, 'part_number', { label: 'part number', mono: true })}</td>
                  <td className="px-2 py-1.5">{input(l, 'quantity', { label: receipt ? 'invoice quantity' : 'quantity', mono: true, decimal: true })}</td>
                  <td className="px-2 py-1.5">{input(l, 'unit', { label: 'unit' })}</td>
                  {receipt && <td className="px-2 py-1.5">{input(l, 'received_quantity', { label: 'received quantity', mono: true, decimal: true })}</td>}
                  {anyFactor && (
                    <td className="px-2 py-1.5">
                      {needsFactor(l) ? input(l, 'conversion_factor', { label: 'conversion factor', mono: true, decimal: true }) : <span className="text-muted-foreground">—</span>}
                    </td>
                  )}
                  <td className="px-2 py-1.5">{input(l, 'unit_price', { label: 'price', mono: true, decimal: true })}</td>
                  <td className="px-2 py-1.5">
                    <ProductPicker
                      value={l.product}
                      counterpartyId={counterpartyId}
                      description={l.description}
                      partNumber={l.part_number}
                      invalid={showIssues && !l.product_id}
                      onPick={(p) => onPick(l.key, p)}
                      onCreate={onCreateProduct && (() => onCreateProduct(l))}
                    />
                    {issues.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-yellow-fg">
                        {issues.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-1 py-1.5">
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} onClick={() => remove(l.key)}>
                      <TrashIcon />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Phone and tablet: stacked cards */}
      <ol className="space-y-3 @4xl:hidden">
        {lines.map((l, i) => {
          const issues = showIssues ? lineIssues(l, direction) : []
          return (
            <li key={l.key} className={cn('rounded-lg border border-border bg-card p-3', issues.length > 0 && 'border-yellow-fg/40 bg-yellow-bg/30')}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Line {i + 1}</span>
                <Button type="button" variant="ghost" size="sm" aria-label={`Remove line ${i + 1}`} onClick={() => remove(l.key)} className="min-h-11 text-muted-foreground">
                  <TrashIcon /> Remove
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                <label className="col-span-2 block text-xs text-muted-foreground">
                  Description on document
                  {input(l, 'description', { label: 'description', className: 'mt-1' })}
                </label>
                <label className="block text-xs text-muted-foreground">
                  Part no.
                  {input(l, 'part_number', { label: 'part number', mono: true, className: 'mt-1' })}
                </label>
                <label className="block text-xs text-muted-foreground">
                  Unit
                  {input(l, 'unit', { label: 'unit', className: 'mt-1' })}
                </label>
                <label className="block text-xs text-muted-foreground">
                  {receipt ? 'Invoice qty' : 'Qty'}
                  {input(l, 'quantity', { label: receipt ? 'invoice quantity' : 'quantity', mono: true, decimal: true, className: 'mt-1' })}
                </label>
                {receipt ? (
                  <label className="block text-xs text-muted-foreground">
                    Received
                    {input(l, 'received_quantity', { label: 'received quantity', mono: true, decimal: true, className: 'mt-1' })}
                  </label>
                ) : (
                  <label className="block text-xs text-muted-foreground">
                    Price
                    {input(l, 'unit_price', { label: 'price', mono: true, decimal: true, className: 'mt-1' })}
                  </label>
                )}
                {needsFactor(l) && (
                  <label className="col-span-2 block text-xs text-muted-foreground">
                    {l.product!.base_unit} per {l.unit.trim()}
                    {input(l, 'conversion_factor', { label: 'conversion factor', mono: true, decimal: true, className: 'mt-1' })}
                  </label>
                )}
                {receipt && (
                  <label className="block text-xs text-muted-foreground">
                    Price
                    {input(l, 'unit_price', { label: 'price', mono: true, decimal: true, className: 'mt-1' })}
                  </label>
                )}
                <div className="col-span-2">
                  <p className="mb-1 text-xs text-muted-foreground">Product</p>
                  <ProductPicker
                    value={l.product}
                    counterpartyId={counterpartyId}
                    description={l.description}
                    partNumber={l.part_number}
                    invalid={showIssues && !l.product_id}
                    onPick={(p) => onPick(l.key, p)}
                    onCreate={onCreateProduct && (() => onCreateProduct(l))}
                  />
                </div>
              </div>
              {issues.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-yellow-fg">
                  {issues.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>

      <Button type="button" variant="outline" onClick={add} className="mt-3 h-10">
        <PlusIcon /> Add line
      </Button>
    </div>
  )
}
