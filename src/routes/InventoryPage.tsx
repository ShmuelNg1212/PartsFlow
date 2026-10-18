import { MagnifyingGlassIcon, PlusIcon } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { keys, searchProducts } from '@/api/api'
import type { ProductStock } from '@/api/types'
import { PageHeader } from '@/components/app/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/app/states'
import { StatusBadge } from '@/components/app/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ProductDialog } from '@/features/products/ProductDialog'
import { useDebounced } from '@/hooks/useDebounced'
import { formatQty } from '@/lib/decimal'
import { useShop } from '@/shop/ShopProvider'

export function InventoryPage() {
  const { shop, isOwner } = useShop()
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const q = useDebounced(text.trim())
  const [creating, setCreating] = useState(false)

  const products = useQuery({
    queryKey: keys.products(shop.id, q),
    queryFn: () => searchProducts(shop.id, q),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Inventory"
        description="Search by SKU, part number, description, brand, or a supplier's wording."
        actions={
          isOwner && (
            <>
              <Button variant="outline" className="h-10" asChild>
                <Link to="/inventory/import">Import CSV</Link>
              </Button>
              <Button onClick={() => setCreating(true)} className="h-10">
                <PlusIcon /> New product
              </Button>
            </>
          )
        }
      />
      <div className="relative mb-4">
        <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })
          }}
          placeholder="Search products"
          aria-label="Search products"
          className="h-11 bg-card pl-9 text-base sm:text-sm"
        />
      </div>

      {products.isPending ? (
        <LoadingState />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => products.refetch()} />
      ) : products.data.length === 0 ? (
        q ? (
          <EmptyState title={`No product matches "${q}"`}>Check the spelling, or search by part number.</EmptyState>
        ) : (
          <EmptyState
            title="No products yet"
            action={isOwner && <Button onClick={() => setCreating(true)}>Create the first product</Button>}
          >
            {isOwner ? 'Add products one by one, or import a CSV file.' : 'An owner adds products.'}
          </EmptyState>
        )
      ) : (
        <ProductList products={products.data} />
      )}

      {isOwner && <ProductDialog open={creating} onOpenChange={setCreating} />}
    </div>
  )
}

function LowBadge({ p }: { p: ProductStock }) {
  return p.is_low ? <StatusBadge tone="yellow">Low stock</StatusBadge> : null
}

function ProductList({ products }: { products: ProductStock[] }) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Brand</th>
              <th className="px-3 py-2 font-medium">Part number</th>
              <th className="px-3 py-2 font-medium">Shelf</th>
              <th className="px-3 py-2 text-right font-medium">On hand</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/60">
                <td className="num px-3 py-2">
                  <Link to={`/inventory/${p.id}`} className="underline-offset-4 hover:underline">
                    {p.sku}
                  </Link>
                </td>
                <td className="max-w-80 px-3 py-2">
                  <Link to={`/inventory/${p.id}`} className="line-clamp-2 break-words">
                    {p.description}
                  </Link>
                </td>
                <td className="px-3 py-2">{p.brand}</td>
                <td className="num px-3 py-2 break-all">{p.part_number}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.shelf_bin ?? '—'}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <span className="inline-flex items-center gap-2">
                    <LowBadge p={p} />
                    <span className="num">
                      {formatQty(p.qty)} <span className="text-muted-foreground">{p.base_unit}</span>
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone list */}
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
        {products.map((p) => (
          <li key={p.id}>
            <Link to={`/inventory/${p.id}`} className="flex items-start gap-3 px-3 py-3 active:bg-accent">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 break-words">{p.description}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className="num">{p.sku}</span> · {p.brand} · <span className="num break-all">{p.part_number}</span>
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="num">
                  {formatQty(p.qty)} <span className="text-xs text-muted-foreground">{p.base_unit}</span>
                </p>
                <LowBadge p={p} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
