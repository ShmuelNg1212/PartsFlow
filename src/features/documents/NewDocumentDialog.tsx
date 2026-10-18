import { ArrowDownIcon, ArrowUpIcon, CameraIcon, FileArrowUpIcon, KeyboardIcon } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { createDocument, extractDocument, keys, uploadDocumentFile } from '@/api/api'
import type { Direction } from '@/api/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ACCEPT_ATTRIBUTE, fileType, safeFileName, uploadProblem } from '@/features/upload/upload'
import { errorMessage } from '@/lib/errors'
import { directionLabel } from '@/lib/format'
import { useShop } from '@/shop/ShopProvider'

const CHOICES: { direction: Direction; title: string; text: string; icon: typeof ArrowDownIcon }[] = [
  { direction: 'receipt', title: 'Receive stock', text: 'A supplier invoice or delivery. Stock goes up by what you physically received.', icon: ArrowDownIcon },
  { direction: 'sale', title: 'Record a sale', text: 'Goods released to a customer. Stock goes down.', icon: ArrowUpIcon },
]

type Step = { kind: 'direction'; back?: true } | { kind: 'source'; direction: Direction } | { kind: 'working'; label: string }

/**
 * R-DOC-2: the user selects the direction first. Then a photo, a file, or manual entry (R-DOC-9).
 * Upload and reading happen here; the workspace opens with the result.
 */
export function NewDocumentDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { shop } = useShop()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>({ kind: 'direction' })
  const [error, setError] = useState<string | null>(null)

  const close = (o: boolean) => {
    if (step.kind === 'working') return
    if (!o) {
      setStep({ kind: 'direction' })
      setError(null)
    }
    onOpenChange(o)
  }

  const start = async (direction: Direction, file: File | null) => {
    setError(null)
    if (file) {
      const problem = uploadProblem(file)
      if (problem) return setError(problem)
    }
    setStep({ kind: 'working', label: 'Creating the draft…' })
    let documentId: string
    try {
      documentId = await createDocument(shop.id, direction)
    } catch (err) {
      setStep({ kind: 'source', direction })
      return setError(errorMessage(err))
    }
    if (file) {
      try {
        setStep({ kind: 'working', label: 'Uploading the document…' })
        await uploadDocumentFile(shop.id, documentId, file, fileType(file), safeFileName(file.name))
        setStep({ kind: 'working', label: 'Reading the document…' })
        const result = await extractDocument(documentId)
        if (result.status === 'done') {
          toast.success(`${result.lines_added} ${result.lines_added === 1 ? 'line' : 'lines'} read${result.provider === 'demo' ? ' (demo extractor)' : ''}. Check every line before posting.`)
        }
      } catch (err) {
        // The draft exists; the workspace offers to attach the file again or to enter lines by hand.
        toast.error(`${errorMessage(err)} The draft is open for manual entry.`)
      }
    }
    queryClient.invalidateQueries({ queryKey: keys.shop(shop.id) })
    setStep({ kind: 'direction' })
    onOpenChange(false)
    navigate(`/inbox/${documentId}`)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        {step.kind === 'direction' && (
          // The dialog's own entrance covers the first open; Back slides like the other steps.
          <div className={cn('grid gap-4', step.back && 'motion-enter-x')}>
            <DialogHeader>
              <DialogTitle>New document</DialogTitle>
              <DialogDescription>What does this document record?</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              {CHOICES.map(({ direction, title, text, icon: Icon }) => (
                <button
                  key={direction}
                  type="button"
                  onClick={() => setStep({ kind: 'source', direction })}
                  className="flex min-h-16 items-start gap-3 rounded-lg border border-border bg-card p-4 text-left hover:bg-accent transition-transform duration-150 ease-out active:scale-[0.99]"
                >
                  <Icon className="mt-0.5 size-5 shrink-0" />
                  <span>
                    <span className="block font-medium">{title}</span>
                    <span className="block text-sm text-muted-foreground">{text}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step.kind === 'source' && (
          <div className="motion-enter-x grid gap-4">
            <DialogHeader>
              <DialogTitle>{directionLabel[step.direction]}</DialogTitle>
              <DialogDescription>Add the paper document, or type the lines yourself. The original file is kept unchanged.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              {/* capture="environment" opens the rear camera on phones; desktops show a file picker. */}
              <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-accent sm:hidden">
                <CameraIcon className="size-5 shrink-0" />
                <span className="font-medium">Take a photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) void start(step.direction, f)
                  }}
                />
              </label>
              <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-4 hover:bg-accent">
                <FileArrowUpIcon className="size-5 shrink-0" />
                <span>
                  <span className="block font-medium">Choose a photo or PDF</span>
                  <span className="block text-sm text-muted-foreground">JPEG, PNG, WebP, HEIC, or PDF, up to 15 MB.</span>
                </span>
                <input
                  type="file"
                  accept={ACCEPT_ATTRIBUTE}
                  aria-label="Document file"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) void start(step.direction, f)
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => void start(step.direction, null)}
                className="flex min-h-14 items-center gap-3 rounded-lg border border-border bg-card p-4 text-left hover:bg-accent"
              >
                <KeyboardIcon className="size-5 shrink-0" />
                <span className="font-medium">Enter the lines by hand</span>
              </button>
              <Button variant="ghost" onClick={() => setStep({ kind: 'direction', back: true })} className="justify-self-start">
                Back
              </Button>
            </div>
          </div>
        )}

        {step.kind === 'working' && (
          <div className="motion-enter-x grid gap-4">
            <DialogHeader>
              <DialogTitle>Please wait</DialogTitle>
              <DialogDescription aria-live="polite">{step.label}</DialogDescription>
            </DialogHeader>
            <div className="h-1 w-full overflow-hidden rounded bg-secondary">
              <div className="motion-progress h-full w-1/3 rounded bg-foreground/60" />
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="motion-enter rounded-md bg-red-bg px-3 py-2 text-sm text-red-fg">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
