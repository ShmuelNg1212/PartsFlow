import { ArrowDownIcon, ArrowUpIcon } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { createDocument, keys } from '@/api/api'
import type { Direction } from '@/api/types'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { errorMessage } from '@/lib/errors'
import { useShop } from '@/shop/ShopProvider'

const CHOICES: { direction: Direction; title: string; text: string; icon: typeof ArrowDownIcon }[] = [
  { direction: 'receipt', title: 'Receive stock', text: 'A supplier invoice or delivery. Stock goes up by what you physically received.', icon: ArrowDownIcon },
  { direction: 'sale', title: 'Record a sale', text: 'Goods released to a customer. Stock goes down.', icon: ArrowUpIcon },
]

/** R-DOC-2: the user selects the direction before review. */
export function NewDocumentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { shop } = useShop()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (direction: Direction) => createDocument(shop.id, direction),
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: keys.shop(shop.id) })
      onOpenChange(false)
      navigate(`/inbox/${id}`)
    },
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New document</DialogTitle>
          <DialogDescription>What does this document record?</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {CHOICES.map(({ direction, title, text, icon: Icon }) => (
            <button
              key={direction}
              type="button"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(direction)}
              className="flex min-h-16 items-start gap-3 rounded-lg border border-border bg-card p-4 text-left hover:bg-accent active:scale-[0.99] disabled:opacity-60"
            >
              <Icon className="mt-0.5 size-5 shrink-0" />
              <span>
                <span className="block font-medium">{title}</span>
                <span className="block text-sm text-muted-foreground">{text}</span>
              </span>
            </button>
          ))}
        </div>
        {mutation.isError && (
          <p role="alert" className="rounded-md bg-red-bg px-3 py-2 text-sm text-red-fg">
            {errorMessage(mutation.error)}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
