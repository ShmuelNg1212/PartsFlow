import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { createProduct, keys, updateProduct } from '@/api/api'
import type { ProductStock } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage } from '@/lib/errors'
import { useShop } from '@/shop/ShopProvider'
import { emptyProduct, productSchema, type ProductFormValues } from './productSchema'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit this product. Without it, the dialog creates a product. */
  product?: ProductStock
  /** Prefill for "Create new product from this line" (R-DOC-7). */
  initial?: Partial<ProductFormValues>
  onSaved?: (productId: string) => void
}

const FIELDS: { name: keyof ProductFormValues; label: string; mono?: boolean; inputMode?: 'decimal'; hint?: string }[] = [
  { name: 'sku', label: 'SKU', mono: true },
  { name: 'part_number', label: 'Manufacturer part number', mono: true },
  { name: 'brand', label: 'Brand' },
  { name: 'description', label: 'Description' },
  { name: 'base_unit', label: 'Base unit', hint: 'The unit you count stock in, for example pc, set, L.' },
  { name: 'selling_price', label: 'Selling price', mono: true, inputMode: 'decimal' },
  { name: 'reorder_threshold', label: 'Reorder threshold', mono: true, inputMode: 'decimal', hint: 'Low stock at or below this quantity.' },
  { name: 'shelf_bin', label: 'Shelf / bin (optional)' },
]

export function ProductDialog({ open, onOpenChange, product, initial, onSaved }: Props) {
  const { shop } = useShop()
  const queryClient = useQueryClient()
  const [serverError, setServerError] = useState<string | null>(null)
  const editing = !!product
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    values: product
      ? {
          sku: product.sku,
          part_number: product.part_number,
          description: product.description,
          brand: product.brand,
          base_unit: product.base_unit,
          selling_price: product.selling_price,
          reorder_threshold: product.reorder_threshold,
          shelf_bin: product.shelf_bin ?? '',
          opening_qty: '',
        }
      : { ...emptyProduct, ...initial },
  })

  const mutation = useMutation({
    mutationFn: async (v: ProductFormValues) => {
      const input = {
        sku: v.sku,
        part_number: v.part_number,
        description: v.description,
        brand: v.brand,
        base_unit: v.base_unit,
        selling_price: v.selling_price,
        reorder_threshold: v.reorder_threshold,
        shelf_bin: v.shelf_bin || null,
      }
      if (product) {
        await updateProduct(product.id, input)
        return product.id
      }
      return createProduct(shop.id, input, v.opening_qty || null)
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: keys.shop(shop.id) })
      onOpenChange(false)
      form.reset()
      onSaved?.(id)
    },
    onError: (err) => setServerError(errorMessage(err)),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setServerError(null)
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit product' : 'New product'}</DialogTitle>
          <DialogDescription>
            A different brand or a different part number is a different product. PartsFlow never merges them.
          </DialogDescription>
        </DialogHeader>
        <form
          id="product-form"
          noValidate
          onSubmit={form.handleSubmit((v) => {
            setServerError(null)
            mutation.mutate(v)
          })}
          className="grid gap-4 sm:grid-cols-2"
        >
          {FIELDS.map((f) => {
            const error = form.formState.errors[f.name]
            return (
              <div key={f.name} className={f.name === 'description' ? 'space-y-1.5 sm:col-span-2' : 'space-y-1.5'}>
                <Label htmlFor={`product-${f.name}`}>{f.label}</Label>
                <Input
                  id={`product-${f.name}`}
                  inputMode={f.inputMode}
                  className={f.mono ? 'num' : undefined}
                  aria-invalid={!!error}
                  {...form.register(f.name)}
                />
                {error ? (
                  <p className="text-sm text-red-fg">{error.message}</p>
                ) : (
                  f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>
                )}
              </div>
            )
          })}
          {!editing && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="product-opening_qty">Opening quantity (optional)</Label>
              <Input id="product-opening_qty" inputMode="decimal" className="num" aria-invalid={!!form.formState.errors.opening_qty} {...form.register('opening_qty')} />
              {form.formState.errors.opening_qty ? (
                <p className="text-sm text-red-fg">{form.formState.errors.opening_qty.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Stock on the shelf today, in base units. Recorded as an opening movement.</p>
              )}
            </div>
          )}
        </form>
        {serverError && (
          <p role="alert" className="motion-enter rounded-md bg-red-bg px-3 py-2 text-sm text-red-fg">
            {serverError}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="product-form" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
