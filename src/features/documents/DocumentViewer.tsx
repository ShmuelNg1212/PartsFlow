import { ArrowSquareOutIcon, CaretDownIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { signedFileUrl } from '@/api/api'
import { ErrorState, LoadingState } from '@/components/app/states'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ZOOMS = [1, 1.5, 2, 3]

/** The original document beside the lines (desktop) or above them (phone). Files stay private: links last 10 minutes. */
export function DocumentViewer({ path, mime, className }: { path: string; mime: string | null; className?: string }) {
  const [zoom, setZoom] = useState(0)
  const [open, setOpen] = useState(false)
  const url = useQuery({ queryKey: ['signed-url', path], queryFn: () => signedFileUrl(path), staleTime: 5 * 60_000 })
  const isPdf = mime === 'application/pdf'
  const isHeic = mime === 'image/heic' || mime === 'image/heif'

  return (
    <section aria-label="Original document" className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}>
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex min-h-9 items-center gap-1.5 px-1 text-sm font-medium lg:pointer-events-none" aria-expanded={open}>
          <CaretDownIcon className={cn('size-4 transition-transform lg:hidden', !open && '-rotate-90')} /> Original document
        </button>
        <span className="ml-auto" />
        {!isPdf && !isHeic && (
          <>
            <Button type="button" variant="ghost" size="icon" aria-label="Zoom out" disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}>
              <MagnifyingGlassMinusIcon />
            </Button>
            <span className="num w-10 text-center text-xs text-muted-foreground">{Math.round(ZOOMS[zoom]! * 100)}%</span>
            <Button type="button" variant="ghost" size="icon" aria-label="Zoom in" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}>
              <MagnifyingGlassPlusIcon />
            </Button>
          </>
        )}
        {url.data && (
          <Button type="button" variant="ghost" size="icon" asChild>
            <a href={url.data} target="_blank" rel="noreferrer" aria-label="Open the original in a new tab">
              <ArrowSquareOutIcon />
            </a>
          </Button>
        )}
      </div>
      <div className={cn('h-[60dvh] overflow-auto bg-secondary lg:block lg:h-[calc(100dvh-9rem)]', !open && 'hidden')}>
        {url.isPending ? (
          <div className="p-3">
            <LoadingState rows={4} label="Loading the document" />
          </div>
        ) : url.isError ? (
          <div className="p-3">
            <ErrorState error={url.error} onRetry={() => url.refetch()} title="Could not open the document" />
          </div>
        ) : isPdf ? (
          <div className="flex h-full flex-col">
            <p className="border-b border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
              If the PDF does not show here,{' '}
              <a href={url.data} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                open it in a new tab
              </a>
              .
            </p>
            <iframe src={url.data} title="Original document (PDF)" className="w-full flex-1 bg-card" />
          </div>
        ) : isHeic ? (
          <div className="p-4 text-sm text-muted-foreground">
            This browser cannot show HEIC photos.{' '}
            <a href={url.data} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              Download the original
            </a>
            .
          </div>
        ) : (
          <img src={url.data} alt="Original document" style={{ width: `${ZOOMS[zoom]! * 100}%` }} className="block max-w-none" />
        )}
      </div>
    </section>
  )
}
