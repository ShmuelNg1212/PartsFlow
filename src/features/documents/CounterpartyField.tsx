import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createCounterparty, keys, listCounterparties } from '@/api/api'
import type { Counterparty, Direction } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/errors'
import { useShop } from '@/shop/ShopProvider'

const NEW = '__new__'

export function CounterpartyField({
  id,
  direction,
  value,
  onChange,
  disabled,
}: {
  id: string
  direction: Direction
  value: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const { shop } = useShop()
  const kind: Counterparty['kind'] = direction === 'receipt' ? 'supplier' : 'customer'
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: keys.counterparties(shop.id, kind), queryFn: () => listCounterparties(shop.id, kind) })
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const create = useMutation({
    mutationFn: () => createCounterparty(shop.id, kind, name),
    onSuccess: (cp) => {
      queryClient.setQueryData<Counterparty[]>(keys.counterparties(shop.id, kind), (old) =>
        [...(old ?? []), cp].sort((a, b) => a.name.localeCompare(b.name)),
      )
      onChange(cp.id)
      setAdding(false)
      setName('')
    },
  })

  if (adding) {
    return (
      <div className="space-y-1.5">
        <div className="flex gap-2">
          <Input
            id={id}
            autoFocus
            value={name}
            placeholder={kind === 'supplier' ? 'Supplier name' : 'Customer name'}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (name.trim()) create.mutate()
              }
              if (e.key === 'Escape') setAdding(false)
            }}
          />
          <Button type="button" onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
            Add
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
        {create.isError && <p className="text-sm text-red-fg">{errorMessage(create.error)}</p>}
      </div>
    )
  }

  return (
    <select
      id={id}
      value={value}
      disabled={disabled || list.isPending}
      onChange={(e) => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value))}
      className="h-9 w-full rounded-md border border-input bg-card px-2 text-base sm:text-sm"
    >
      <option value="">{list.isPending ? 'Loading…' : kind === 'supplier' ? 'No supplier' : 'No customer (walk-in)'}</option>
      {(list.data ?? []).map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
      <option value={NEW}>+ Add {kind}…</option>
    </select>
  )
}
