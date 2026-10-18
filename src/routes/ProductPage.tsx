import { ArrowLeftIcon, PencilSimpleIcon } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { getProduct, keys, listMovements, setOpeningQuantity } from '@/api/api'
import { PageHeader } from '@/components/app/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/app/states'
import { StatusBadge } from '@/components/app/StatusBadge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MovementList } from '@/features/history/MovementList'
import { ProductDialog } from '@/features/products/ProductDialog'
import { formatMoney, formatQty, isDecimalString } from '@/lib/decimal'
import { errorMessage } from '@/lib/errors'
import { useShop } from '@/shop/ShopProvider'

export function ProductPage() {
  const { id = '' } = useParams()
  const { shop, isOwner } = useShop()
  const [editing, setEditing] = useState(false)
  const [opening, setOpening] = useState(false)
  const product = useQuery({ queryKey: keys.product(shop.id, id), queryFn: () => getProduct(id) })
  const movements = useQuery({ queryKey: keys.movements(shop.id, id), queryFn: () => listMovements(shop.id, id) })

  const back = (
    <Link to="/inventory" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeftIcon className="size-4" /> Inventory
    </Link>
  )

  if (product.isPending) return <div className="mx-auto max-w-5xl">{back}<LoadingState rows={3} /></div>
  if (product.isError) return <div className="mx-auto max-w-5xl">{back}<ErrorState error={product.error} onRetry={() => product.refetch()} /></div>
  const p = product.data
  if (!p) return <div className="mx-auto max-w-5xl">{back}<EmptyState title="Product not found">It may belong to another shop.</EmptyState></div>

  return (
    <div className="mx-auto max-w-5xl">
      {back}
      <PageHeader
        title={<span className="break-words">{p.description}</span>}
        description={
          <span>
            <span className="num">{p.sku}</span> · {p.brand} · <span className="num break-all">{p.part_number}</span>
          </span>
        }
        actions={
          isOwner && (
            <>
              {!p.has_movements && (
                <Button variant="outline" onClick={() => setOpening(true)}>
                  Set opening quantity
                </Button>
              )}
              <Button variant="outline" onClick={() => setEditing(true)}>
                <PencilSimpleIcon /> Edit
              </Button>
            </>
          )
        }
      />

      <dl className="mb-8 grid grid-cols-1 gap-px min-[400px]:grid-cols-2 overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <Fact label="On hand">
          <span className="num text-2xl">{formatQty(p.qty)}</span> <span className="text-muted-foreground">{p.base_unit}</span>
          {p.is_low && <StatusBadge tone="yellow" className="ml-2 align-middle">Low stock</StatusBadge>}
        </Fact>
        <Fact label="Reorder at or below">
          <span className="num">{formatQty(p.reorder_threshold)}</span> {p.base_unit}
        </Fact>
        <Fact label="Shelf / bin">{p.shelf_bin ?? '—'}</Fact>
        <Fact label="Selling price">
          <span className="num">{formatMoney(p.selling_price, shop.currency)}</span>
        </Fact>
      </dl>

      <h2 className="mb-3 text-lg font-medium">Stock history</h2>
      {movements.isPending ? (
        <LoadingState rows={3} />
      ) : movements.isError ? (
        <ErrorState error={movements.error} onRetry={() => movements.refetch()} />
      ) : movements.data.length === 0 ? (
        <EmptyState title="No stock movements yet">Movements appear when an opening quantity is set or a document is posted.</EmptyState>
      ) : (
        <MovementList movements={movements.data} timeZone={shop.timezone} showProduct={false} />
      )}

      {isOwner && (
        <>
          <ProductDialog open={editing} onOpenChange={setEditing} product={p} />
          <OpeningDialog open={opening} onOpenChange={setOpening} productId={p.id} unit={p.base_unit} />
        </>
      )}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-card px-4 py-3 wrap-anywhere">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}

function OpeningDialog({ open, onOpenChange, productId, unit }: { open: boolean; onOpenChange: (o: boolean) => void; productId: string; unit: string }) {
  const { shop } = useShop()
  const queryClient = useQueryClient()
  const [qty, setQty] = useState('')
  const valid = isDecimalString(qty, 3) && !qty.trim().startsWith('-')
  const mutation = useMutation({
    mutationFn: () => setOpeningQuantity(productId, qty.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.shop(shop.id) })
      onOpenChange(false)
      setQty('')
    },
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set opening quantity</DialogTitle>
          <DialogDescription>
            Count the stock on the shelf now. PartsFlow records it as an opening movement. You can do this once, before any receipt or sale.
          </DialogDescription>
        </DialogHeader>
        <form
          id="opening-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) mutation.mutate()
          }}
          className="space-y-1.5"
        >
          <Label htmlFor="opening-qty">Quantity ({unit})</Label>
          <Input id="opening-qty" inputMode="decimal" className="num" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
          {qty && !valid && <p className="text-sm text-red-fg">Enter a number, zero or more, with at most 3 decimals.</p>}
        </form>
        {mutation.isError && (
          <p role="alert" className="rounded-md bg-red-bg px-3 py-2 text-sm text-red-fg">
            {errorMessage(mutation.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="opening-form" disabled={!valid || mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save opening quantity'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
