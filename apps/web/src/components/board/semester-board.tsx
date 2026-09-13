import type { Plan, PlanModule, PlanSummary } from '@study-plan/shared'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { cn } from '../../lib/cn.ts'
import type { MoveHandler } from '../../lib/dnd.ts'
import type { IssueText } from '../../lib/issues.ts'
import type { Destination } from './module-card.tsx'
import { type ColumnModel, SemesterColumn } from './semester-column.tsx'

export interface SemesterBoardProps {
  plan: Plan
  summary: PlanSummary
  currentIndex: number
  onMove: MoveHandler
  onGrade: (code: string) => void
  notesByCode: ReadonlyMap<string, readonly IssueText[]>
}

export const columnTitle = (plan: Plan, columnId: string | null): string => {
  if (columnId === null) return 'Nicht eingeplant'
  return `${plan.semesters.findIndex((s) => s.id === columnId) + 1}. Semester`
}

export function SemesterBoard({
  plan,
  summary,
  currentIndex,
  onMove,
  onGrade,
  notesByCode,
}: SemesterBoardProps) {
  const elements = useRef(new Map<string | null, HTMLElement>())
  const registerElement = useCallback((id: string | null, element: HTMLElement | null) => {
    if (element) elements.current.set(id, element)
    else elements.current.delete(id)
  }, [])

  const columns = useMemo((): ColumnModel[] => {
    const byCode = new Map(plan.modules.map((m) => [m.code, m]))
    const resolve = (codes: readonly string[]) =>
      codes.map((code) => byCode.get(code)).filter((m): m is PlanModule => m !== undefined)
    const credits = plan.backlog.reduce((sum, code) => sum + (byCode.get(code)?.credits ?? 0), 0)

    return [
      ...plan.semesters.map((semester, index) => {
        const info = summary.semesters[index]
        return {
          id: semester.id,
          title: `${index + 1}. Semester`,
          subtitle: info?.label ?? null,
          credits: info?.credits ?? 0,
          load: info?.load ?? null,
          isCurrent: index === currentIndex,
          modules: resolve(semester.moduleCodes),
        }
      }),
      {
        id: null,
        title: 'Nicht eingeplant',
        subtitle: null,
        credits,
        load: null,
        isCurrent: false,
        modules: resolve(plan.backlog),
      },
    ]
  }, [plan, summary, currentIndex])

  const destinations: Destination[] = useMemo(
    () =>
      columns.map((column) => ({
        id: column.id,
        title: column.subtitle ? `${column.title} (${column.subtitle})` : column.title,
      })),
    [columns],
  )

  const scrollTo = (id: string | null, behavior: ScrollBehavior = 'smooth') =>
    elements.current.get(id)?.scrollIntoView?.({ behavior, inline: 'start', block: 'nearest' })

  // Start with the current semester in view, which matters most on phones where one column fills the screen.
  const currentId = plan.semesters[currentIndex]?.id
  useEffect(() => {
    if (!currentId) return
    elements.current
      .get(currentId)
      ?.scrollIntoView?.({ behavior: 'instant', inline: 'start', block: 'nearest' })
  }, [currentId])

  return (
    <div className="space-y-2">
      <nav aria-label="Semester springen" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:hidden">
        {columns.map((column) => (
          <button
            key={column.id ?? 'backlog'}
            type="button"
            onClick={() => scrollTo(column.id)}
            className={cn(
              'h-8 shrink-0 rounded-full px-3 text-xs font-medium ring-1 ring-zinc-300 ring-inset dark:ring-zinc-700',
              column.isCurrent && 'bg-indigo-600 text-white ring-indigo-600',
            )}
          >
            {column.id === null ? 'Offen' : column.title.replace('. Semester', '.')}
          </button>
        ))}
      </nav>
      <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 items-start gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:scroll-px-0 sm:items-stretch sm:px-0">
        {columns.map((column) => (
          <SemesterColumn
            key={column.id ?? 'backlog'}
            column={column}
            passThreshold={plan.rules.passThreshold}
            creditLabel={plan.preset.creditLabel}
            showCode={plan.preset.codesAreOfficial ?? true}
            notesByCode={notesByCode}
            destinations={destinations}
            onMove={onMove}
            onGrade={onGrade}
            registerElement={registerElement}
          />
        ))}
      </div>
    </div>
  )
}
