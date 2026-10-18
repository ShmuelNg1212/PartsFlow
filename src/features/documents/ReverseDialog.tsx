import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { reverseDocument } from '@/api/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { errorMessage } from '@/lib/errors'

/** R-POST-10, D4: reverse the whole document with a reason. Blocked when a balance would go negative (D5). */
export function ReverseDialog({ open, onOpenChange, documentId, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; documentId: string; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: () => reverseDocument(documentId, reason.trim()),
    onSuccess: () => {
      onOpenChange(false)
      setReason('')
      onDone()
    },
  })
  return (
    <Dialog open={open} onOpenChange={(o) => !mutation.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse this document?</DialogTitle>
          <DialogDescription>
            PartsFlow adds a compensating movement for every line, linked to the original. The document stays in history as reversed. To correct one line,
            reverse the document and post a corrected copy.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reverse-reason">Reason (required)</Label>
          <Textarea id="reverse-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: wrong quantity entered on line 2." />
        </div>
        {mutation.isError && (
          <p role="alert" className="motion-enter rounded-md bg-red-bg px-3 py-2 text-sm break-words text-red-fg">
            {errorMessage(mutation.error)}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={!reason.trim() || mutation.isPending}>
            {mutation.isPending ? 'Reversing…' : 'Reverse document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
