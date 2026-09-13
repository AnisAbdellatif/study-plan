import { LoaderCircle } from 'lucide-react'
import { cn } from '../../lib/cn.ts'

/** A spinning circle for work in progress. Decorative: pair it with visible text or an aria-busy container. */
export function Spinner({ className }: { className?: string }) {
  return (
    <LoaderCircle
      aria-hidden
      className={cn('size-4 shrink-0 animate-spin motion-reduce:animate-none', className)}
    />
  )
}

/** "Loading…" with a spinner, announced politely to screen readers. */
export function LoadingText({ children, className }: { children: string; className?: string }) {
  return (
    <p
      role="status"
      className={cn('flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400', className)}
    >
      <Spinner />
      {children}
    </p>
  )
}
