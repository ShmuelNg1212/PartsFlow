import { CameraIcon, FileArrowUpIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { extractDocument, uploadDocumentFile } from '@/api/api'
import { ACCEPT_ATTRIBUTE, fileType, safeFileName, uploadProblem } from '@/features/upload/upload'
import { errorMessage } from '@/lib/errors'
import { useShop } from '@/shop/ShopProvider'

/** Attach the paper document to a draft that has none yet (T4.1). Reading adds lines only to an empty draft. */
export function AttachDocument({ documentId, blocked, onDone }: { documentId: string; blocked: boolean; onDone: () => void }) {
  const { shop } = useShop()
  const attach = useMutation({
    mutationFn: async (file: File) => {
      const problem = uploadProblem(file)
      if (problem) throw { code: 'UPLOAD', message: problem }
      await uploadDocumentFile(shop.id, documentId, file, fileType(file), safeFileName(file.name))
      return extractDocument(documentId)
    },
    onSuccess: (r) => {
      if (r.status === 'done') toast.success(`Read ${r.lines_added} ${r.lines_added === 1 ? 'line' : 'lines'}${r.provider === 'demo' ? ' (demo extractor)' : ''}.`)
      onDone()
    },
    onSettled: () => onDone(),
  })
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) attach.mutate(f)
  }
  return (
    <section aria-label="Attach the document" className="mb-6 rounded-lg border border-dashed border-border bg-card p-4">
      <p className="text-sm font-medium">No document attached</p>
      <p className="mt-0.5 text-sm text-muted-foreground">Attach the paper invoice to keep the original with this record. You can also type every line by hand.</p>
      {blocked && <p className="mt-2 text-sm text-yellow-fg">Save the draft first. Then attach the document.</p>}
      <div className={blocked ? 'pointer-events-none mt-3 flex flex-wrap gap-2 opacity-50' : 'mt-3 flex flex-wrap gap-2'}>
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-accent sm:hidden">
          <CameraIcon className="size-4" /> Take a photo
          <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={attach.isPending || blocked} onChange={pick} />
        </label>
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-accent">
          <FileArrowUpIcon className="size-4" /> {attach.isPending ? 'Uploading and reading…' : 'Choose a photo or PDF'}
          <input type="file" accept={ACCEPT_ATTRIBUTE} aria-label="Attach document file" className="sr-only" disabled={attach.isPending || blocked} onChange={pick} />
        </label>
      </div>
      {attach.isError && (
        <p role="alert" className="mt-2 rounded-md bg-red-bg px-3 py-2 text-sm text-red-fg">
          {errorMessage(attach.error)}
        </p>
      )}
    </section>
  )
}
