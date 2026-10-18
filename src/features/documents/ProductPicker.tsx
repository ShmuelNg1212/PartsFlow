import { CaretUpDownIcon, PlusIcon, WarningIcon } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { keys, searchProducts, suggestProducts } from '@/api/api'
import type { LineProduct, Suggestion } from '@/api/types'
import { StatusBadge } from '@/components/app/StatusBadge'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useDebounced } from '@/hooks/useDebounced'
import { formatQty } from '@/lib/decimal'
import { cn } from '@/lib/utils'
import { useShop } from '@/shop/ShopProvider'

export type Pick = { product: LineProduct; source: 'alias' | 'part_number' | 'description' | 'manual' }

const sourceText: Record<Suggestion['source'], string> = {
  alias: 'Matched before for this supplier',
  part_number: 'Same part number',
  description: 'Similar description',
}

type Props = {
  value: LineProduct | null
  counterpartyId: string | null
  description: string
  partNumber: string
  onPick: (pick: Pick) => void
  onCreate?: () => void
  disabled?: boolean
  invalid?: boolean
}

const toLineProduct = (s: { product_id?: string; id?: string; sku: string; description: string; brand: string; base_unit: string; part_number: string }): LineProduct => ({
  id: (s.product_id ?? s.id)!,
  sku: s.sku,
  description: s.description,
  brand: s.brand,
  base_unit: s.base_unit,
  part_number: s.part_number,
})

/** R-DOC-6: suggestions help, but the user selects the product. Brands and similar part numbers are never merged (R-PROD-5). */
export function ProductPicker({ value, counterpartyId, description, partNumber, onPick, onCreate, disabled, invalid }: Props) {
  const { shop } = useShop()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const q = useDebounced(text.trim(), 200)

  const suggestions = useQuery({
    queryKey: [...keys.shop(shop.id), 'suggest', counterpartyId, description, partNumber],
    queryFn: () => suggestProducts(shop.id, counterpartyId, description || null, partNumber || null),
    enabled: open && !!(description.trim() || partNumber.trim()),
  })
  const results = useQuery({
    queryKey: keys.products(shop.id, q),
    queryFn: () => searchProducts(shop.id, q),
    enabled: open && q.length > 0,
    placeholderData: keepPreviousData,
  })

  const pick = (p: Pick) => {
    onPick(p)
    setOpen(false)
    setText('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-invalid={invalid}
          className={cn('h-auto min-h-9 w-full justify-between gap-2 py-1.5 text-left font-normal', !value && 'text-muted-foreground')}
        >
          {value ? (
            <span className="min-w-0">
              <span className="num block truncate text-xs text-muted-foreground">
                {value.sku} · {value.brand}
              </span>
              <span className="block truncate text-foreground">{value.description}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <WarningIcon className="size-4 text-yellow-fg" /> Select product
            </span>
          )}
          <CaretUpDownIcon className="size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={text} onValueChange={setText} placeholder="Search SKU, part number, description, brand" className="text-base sm:text-sm" />
          <CommandList className="max-h-80">
            {!q && suggestions.data && suggestions.data.length > 0 && (
              <CommandGroup heading={suggestions.data.some((s) => s.confident) ? 'Suggested match' : 'Possible matches — check brand and part number'}>
                {suggestions.data.map((s) => (
                  <CommandItem key={s.product_id} value={`s-${s.product_id}`} onSelect={() => pick({ product: toLineProduct(s), source: s.source })}>
                    <ProductRow p={s} note={sourceText[s.source]} confident={s.confident} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {q && (
              <CommandGroup heading="Search results">
                {(results.data ?? []).map((p) => (
                  <CommandItem key={p.id} value={`r-${p.id}`} onSelect={() => pick({ product: toLineProduct(p), source: 'manual' })}>
                    <ProductRow p={p} note={`On hand ${formatQty(p.qty)} ${p.base_unit}`} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandEmpty>{q ? (results.isFetching ? 'Searching…' : 'No product found.') : 'Type to search products.'}</CommandEmpty>
          </CommandList>
          {onCreate && (
            <div className="border-t border-border p-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onCreate()
                }}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent"
              >
                <PlusIcon className="size-4" /> Create new product from this line
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ProductRow({ p, note, confident }: { p: { sku: string; brand: string; description: string; part_number: string }; note: string; confident?: boolean }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <span className="num text-xs">{p.sku}</span>
        <span className="text-xs text-muted-foreground">{p.brand}</span>
        <span className="num truncate text-xs text-muted-foreground">{p.part_number}</span>
        {confident && <StatusBadge tone="green">Likely</StatusBadge>}
      </div>
      <p className="truncate">{p.description}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  )
}
