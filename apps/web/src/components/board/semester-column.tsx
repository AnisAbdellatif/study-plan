import type { PlanModule, SemesterLoad } from '@study-plan/shared'
import { TriangleAlert } from 'lucide-react'
import { useId, useRef } from 'react'
import { cn } from '../../lib/cn.ts'
import { type MoveHandler, useColumnDropTarget } from '../../lib/dnd.ts'
import { formatCredits } from '../../lib/format.ts'
import type { IssueText } from '../../lib/issues.ts'
import { type Destination, ModuleCard } from './module-card.tsx'

const NO_NOTES: readonly IssueText[] = []

export interface ColumnModel {
  id: string | null
  title: string
  subtitle: string | null
  credits: number
  load: SemesterLoad | null
  isCurrent: boolean
  modules: PlanModule[]
}

export interface SemesterColumnProps {
  column: ColumnModel
  passThreshold: number
  creditLabel: string
  showCode: boolean
  notesByCode: ReadonlyMap<string, readonly IssueText[]>
  destinations: readonly Destination[]
  onMove: MoveHandler
  onGrade: (code: string) => void
  registerElement: (id: string | null, element: HTMLElement | null) => void
}

export function SemesterColumn({
  column,
  passThreshold,
  creditLabel,
  showCode,
  notesByCode,
  destinations,
  onMove,
  onGrade,
  registerElement,
}: SemesterColumnProps) {
  const headingId = useId()
  const ref = useRef<HTMLElement>(null)
  const { isOver } = useColumnDropTarget(ref, column.id)

  return (
    <section
      ref={(element) => {
        ref.current = element
        registerElement(column.id, element)
      }}
      aria-labelledby={headingId}
      className={cn(
        'print:w-[calc(33.333%-0.5rem)]! print:max-w-none! print:break-inside-avoid flex w-[85vw] max-w-sm shrink-0 snap-start flex-col rounded-xl bg-zinc-200/60 p-2 ring-2 ring-transparent transition-colors sm:w-[calc((100%-0.75rem)/2)] md:w-[calc((100%-1.5rem)/3)] xl:w-72 dark:bg-zinc-900/70',
        column.id === null && 'bg-zinc-200/30 dark:bg-zinc-900/30',
        column.isCurrent && 'ring-indigo-500/50',
        isOver && 'bg-indigo-50 ring-indigo-400 dark:bg-indigo-950/40',
      )}
    >
      <header className="px-1.5 pt-1 pb-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id={headingId} className="text-sm font-semibold">
            {column.title}
          </h2>
          {column.isCurrent ? (
            <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white">
              aktuell
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          {column.subtitle ? <span>{column.subtitle}</span> : null}
          {column.subtitle ? <span aria-hidden>·</span> : null}
          <span className="tabular-nums">
            {formatCredits(column.credits)} {creditLabel}
          </span>
          {column.load === 'high' ? (
            <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-400">
              <TriangleAlert aria-hidden className="size-3" />
              hohe Last
            </span>
          ) : null}
        </p>
      </header>

      <ul aria-label={`Module in ${column.title}`} className="flex min-h-24 flex-1 flex-col gap-2">
        {column.modules.map((module, index) => (
          <ModuleCard
            key={module.code}
            module={module}
            columnId={column.id}
            index={index}
            passThreshold={passThreshold}
            creditLabel={creditLabel}
            showCode={showCode}
            notes={notesByCode.get(module.code) ?? NO_NOTES}
            destinations={destinations}
            onMove={onMove}
            onGrade={onGrade}
          />
        ))}
        {column.modules.length === 0 ? (
          <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500 dark:border-zinc-700">
            {column.id === null
              ? 'Hier landen Module, die du noch nicht eingeplant hast'
              : 'Module hierher ziehen oder über das Kartenmenü verschieben'}
          </li>
        ) : null}
      </ul>
    </section>
  )
}
