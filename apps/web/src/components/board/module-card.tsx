import { currentResult, type PlanModule } from '@study-plan/shared'
import { EllipsisVertical, Info, TriangleAlert } from 'lucide-react'
import { useRef } from 'react'
import { cn } from '../../lib/cn.ts'
import { type MoveHandler, useDraggableModule } from '../../lib/dnd.ts'
import { formatCredits, formatGrade, formatShortDate } from '../../lib/format.ts'
import type { IssueText } from '../../lib/issues.ts'
import { Button } from '../ui/button.tsx'
import {
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from '../ui/menu.tsx'

export interface Destination {
  id: string | null
  title: string
}

export interface ModuleCardProps {
  module: PlanModule
  columnId: string | null
  index: number
  passThreshold: number
  creditLabel: string
  /** False when the preset's module codes are made up; they are then hidden. */
  showCode: boolean
  destinations: readonly Destination[]
  onMove: MoveHandler
  onGrade: (code: string) => void
  /** Validation notes for this module, already worded for the card. */
  notes: readonly IssueText[]
}

function ResultBadge({ module, passThreshold }: { module: PlanModule; passThreshold: number }) {
  const result = currentResult(module)
  const base = 'rounded px-1.5 py-0.5 font-medium tabular-nums'
  const passed = 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200'
  const failed = 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200'

  switch (result.kind) {
    case 'graded':
      return (
        <span className={cn(base, result.grade <= passThreshold ? passed : failed)}>
          <span className="sr-only">Note </span>
          {formatGrade(result.grade)}
        </span>
      )
    case 'passed':
      return <span className={cn(base, passed)}>bestanden</span>
    case 'failed':
      return <span className={cn(base, failed)}>nicht bestanden</span>
    case 'open':
      return null
  }
}

export function ModuleCard({
  module,
  columnId,
  index,
  passThreshold,
  creditLabel,
  showCode,
  destinations,
  onMove,
  onGrade,
  notes,
}: ModuleCardProps) {
  const ref = useRef<HTMLLIElement>(null)
  const { isDragging, closestEdge } = useDraggableModule(ref, { code: module.code, columnId, index })

  return (
    <li
      ref={ref}
      className={cn(
        'relative cursor-grab rounded-lg bg-white p-2.5 shadow-sm ring-1 ring-zinc-200 active:cursor-grabbing dark:bg-zinc-950 dark:ring-zinc-800',
        isDragging && 'opacity-40',
        notes.some((note) => note.severity === 'warning') &&
          'outline-2 outline-amber-400/70 dark:outline-amber-500/60',
      )}
    >
      {closestEdge ? (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-indigo-500',
            closestEdge === 'top' ? '-top-[5px]' : '-bottom-[5px]',
          )}
        />
      ) : null}
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
            {showCode ? `${module.code} · ` : ''}
            {module.category}
          </p>
          <h3 className="text-sm leading-snug font-medium">{module.name}</h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="tabular-nums">
              {formatCredits(module.credits)} {creditLabel}
            </span>
            {module.countsTowardAverage ? null : <span>· zählt nicht zum Schnitt</span>}
            {module.retired ? <span>· nicht mehr in der Prüfungsordnung</span> : null}
            <ResultBadge module={module} passThreshold={passThreshold} />
            {module.examDate ? (
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 tabular-nums dark:bg-zinc-800">
                Prüfung {formatShortDate(module.examDate)}
              </span>
            ) : null}
          </p>
          {notes.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 text-[11px] leading-snug">
              {notes.map((note) => (
                <li
                  key={note.text}
                  className={cn(
                    'flex items-start gap-1',
                    note.severity === 'warning'
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-zinc-500 dark:text-zinc-400',
                  )}
                >
                  {note.severity === 'warning' ? (
                    <TriangleAlert aria-hidden className="mt-px size-3 shrink-0" />
                  ) : (
                    <Info aria-hidden className="mt-px size-3 shrink-0" />
                  )}
                  <span>{note.text}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <MenuRoot>
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="-mt-1 -mr-1 print:hidden"
                aria-label={`Aktionen für ${module.name}`}
              />
            }
          >
            <EllipsisVertical aria-hidden className="size-4" />
          </MenuTrigger>
          <MenuContent>
            <MenuItem onClick={() => onGrade(module.code)}>
              {module.grading === 'graded' ? 'Note eintragen…' : 'Ergebnis eintragen…'}
            </MenuItem>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Verschieben nach</MenuGroupLabel>
              {destinations.map((destination) => (
                <MenuItem
                  key={destination.id ?? 'backlog'}
                  disabled={destination.id === columnId}
                  onClick={() => onMove(module.code, destination.id)}
                >
                  {destination.title}
                </MenuItem>
              ))}
            </MenuGroup>
          </MenuContent>
        </MenuRoot>
      </div>
    </li>
  )
}
