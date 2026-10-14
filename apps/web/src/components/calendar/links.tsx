import type { CalendarSourceView } from '@study-plan/shared'
import type { TFunction } from 'i18next'
import { cn } from '../../lib/cn.ts'

/** One accent per link, by position, so a link looks the same in its tab, its card and every feed it feeds. */
const ACCENTS = [
  'bg-indigo-600 text-white dark:bg-indigo-500',
  'bg-teal-600 text-white dark:bg-teal-500',
  'bg-amber-500 text-zinc-950 dark:bg-amber-400',
  'bg-rose-600 text-white dark:bg-rose-500',
] as const

export function linkName(
  t: TFunction<'calendar'>,
  sources: readonly CalendarSourceView[],
  id: string,
): string {
  const index = sources.findIndex((source) => source.id === id)
  const source = sources[index]
  return source?.label || t('source.fallbackName', { number: index + 1 })
}

/** The link's number in its accent colour; the name is for screen readers or shown next to it. */
export function LinkBadge({ index, className }: { index: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-md text-[0.7rem] font-semibold tabular-nums',
        ACCENTS[index % ACCENTS.length],
        className,
      )}
    >
      {index + 1}
    </span>
  )
}

/** A link as a small chip: badge and name. */
export function LinkChip({ index, name }: { index: number; name: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-zinc-100 py-0.5 pr-2.5 pl-0.5 text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
      <LinkBadge index={index} className="rounded-full" />
      <span className="truncate">{name}</span>
    </span>
  )
}
