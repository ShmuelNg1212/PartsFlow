import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type Tone = 'neutral' | 'red' | 'yellow' | 'green' | 'blue'

const tones: Record<Tone, string> = {
  neutral: 'bg-secondary text-muted-foreground',
  red: 'bg-red-bg text-red-fg',
  yellow: 'bg-yellow-bg text-yellow-fg',
  green: 'bg-green-bg text-green-fg',
  blue: 'bg-blue-bg text-blue-fg',
}

/** Small uppercase status label. Color carries meaning only (study §5). */
export function StatusBadge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function DocStatusBadge({ status }: { status: 'draft' | 'posted' | 'reversed' }) {
  const tone: Tone = status === 'posted' ? 'green' : status === 'reversed' ? 'neutral' : 'yellow'
  return <StatusBadge tone={tone}>{status}</StatusBadge>
}
