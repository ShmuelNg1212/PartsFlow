import { XIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { getProduct, keys, listMovements } from '@/api/api'
import { PageHeader } from '@/components/app/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '@/components/app/states'
import { MovementList } from '@/features/history/MovementList'
import { useShop } from '@/shop/ShopProvider'

export function HistoryPage() {
  const { shop } = useShop()
  const [params] = useSearchParams()
  const productId = params.get('product')
  const movements = useQuery({ queryKey: keys.movements(shop.id, productId), queryFn: () => listMovements(shop.id, productId) })
  const product = useQuery({
    queryKey: keys.product(shop.id, productId ?? ''),
    queryFn: () => getProduct(shop.id, productId!),
    enabled: !!productId,
  })

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Stock history" description="Every stock change, newest first. Posted movements never change; corrections are reversals." />
      {productId && (
        <p className="mb-4 inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm">
          Product: <span className="num">{product.data?.sku ?? '…'}</span> {product.data?.description}
          <Link to="/history" aria-label="Show all products" className="text-muted-foreground hover:text-foreground">
            <XIcon className="size-4" />
          </Link>
        </p>
      )}
      {movements.isPending ? (
        <LoadingState />
      ) : movements.isError ? (
        <ErrorState error={movements.error} onRetry={() => movements.refetch()} />
      ) : movements.data.length === 0 ? (
        <EmptyState title="No stock movements yet">Post a receipt or a sale, or set an opening quantity.</EmptyState>
      ) : (
        <>
          <MovementList movements={movements.data} timeZone={shop.timezone} showProduct={!productId} />
          {movements.data.length >= 200 && <p className="mt-3 text-sm text-muted-foreground">Showing the latest 200 movements.</p>}
        </>
      )}
    </div>
  )
}
