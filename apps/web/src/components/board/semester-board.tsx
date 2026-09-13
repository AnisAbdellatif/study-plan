import {
  addTerms,
  choiceAreas,
  choiceOptionCodes,
  formatTerm,
  isPlaceholderId,
  type Plan,
  type PlanSummary,
  placeholderCredits,
} from '@study-plan/shared'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { currentLocale } from '../../i18n/index.ts'
import { cn } from '../../lib/cn.ts'
import type { IssueText } from '../../lib/issues.ts'
import type { BoardActions } from './board-actions.ts'
import type { Destination } from './module-card.tsx'
import { type ColumnEntry, type ColumnModel, SemesterColumn } from './semester-column.tsx'

export interface SemesterBoardProps {
  plan: Plan
  summary: PlanSummary
  currentIndex: number
  actions: BoardActions
  notesByCode: ReadonlyMap<string, readonly IssueText[]>
}

export const columnTitle = (plan: Plan, columnId: string | null): string => {
  if (columnId === null) return i18n.t('board:columns.backlog')
  return i18n.t('board:columns.semester', { number: plan.semesters.findIndex((s) => s.id === columnId) + 1 })
}

/** Area name of a placeholder, or null when the id is not a known placeholder. */
export const placeholderAreaName = (plan: Plan, id: string): string | null => {
  const areaId = plan.placeholders?.find((placeholder) => placeholder.id === id)?.areaId
  if (areaId === undefined) return null
  return plan.areas.find((area) => area.id === areaId)?.name ?? areaId
}

export function SemesterBoard({ plan, summary, currentIndex, actions, notesByCode }: SemesterBoardProps) {
  const { t } = useTranslation('board')
  const locale = currentLocale()
  const elements = useRef(new Map<string | null, HTMLElement>())
  const registerElement = useCallback((id: string | null, element: HTMLElement | null) => {
    if (element) elements.current.set(id, element)
    else elements.current.delete(id)
  }, [])

  const choices = useMemo(() => choiceAreas(plan), [plan])

  const columns = useMemo((): ColumnModel[] => {
    const byCode = new Map(plan.modules.map((m) => [m.code, m]))
    const optionCodes = new Set([...choiceOptionCodes(plan).values()].flat())
    const estimates = placeholderCredits(plan)
    const areaNames = new Map(plan.areas.map((area) => [area.id, area.name]))
    const placeholders = new Map(
      (plan.placeholders ?? []).map((placeholder) => [placeholder.id, placeholder]),
    )

    // Entries keep their index in the plan's list, so drops land next to the card they were dropped on.
    const resolve = (codes: readonly string[]): ColumnEntry[] =>
      codes.flatMap((code, index): ColumnEntry[] => {
        if (isPlaceholderId(code)) {
          const placeholder = placeholders.get(code)
          if (!placeholder) return []
          return [
            {
              kind: 'placeholder',
              id: code,
              index,
              areaId: placeholder.areaId,
              areaName: areaNames.get(placeholder.areaId) ?? placeholder.areaId,
              credits: estimates.get(code) ?? 0,
            },
          ]
        }
        const module = byCode.get(code)
        return module ? [{ kind: 'module', module, index, chosen: optionCodes.has(code) }] : []
      })

    // Unplaced options of choice areas are reached through the area tiles, not the module list.
    const backlog = resolve(plan.backlog).filter(
      (entry) => entry.kind === 'module' && !optionCodes.has(entry.module.code),
    )
    const credits = backlog.reduce(
      (sum, entry) => sum + (entry.kind === 'module' ? entry.module.credits : 0),
      0,
    )

    return [
      ...plan.semesters.map((semester, index) => {
        const info = summary.semesters[index]
        return {
          id: semester.id,
          title: t('columns.semester', { number: index + 1 }),
          // The summary labels its terms in German, so the term is formatted here for the current language.
          subtitle: info ? formatTerm(addTerms(plan.startTerm, index), locale) : null,
          credits: info?.credits ?? 0,
          estimate: info?.placeholderCredits ?? 0,
          load: info?.load ?? null,
          isCurrent: index === currentIndex,
          entries: resolve(semester.moduleCodes),
        }
      }),
      {
        id: null,
        title: t('columns.backlog'),
        subtitle: null,
        credits,
        estimate: 0,
        load: null,
        isCurrent: false,
        entries: backlog,
      },
    ]
  }, [plan, summary, currentIndex, t, locale])

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
      <nav
        aria-label={t('columns.jumpTo')}
        className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:hidden print:hidden"
      >
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
            {column.id === null
              ? t('columns.backlogShort')
              : t('columns.semesterShort', {
                  number: plan.semesters.findIndex((s) => s.id === column.id) + 1,
                })}
          </button>
        ))}
      </nav>
      <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 items-start gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:scroll-px-0 sm:items-stretch sm:px-0 print:mx-0 print:flex-wrap print:overflow-visible print:px-0">
        {columns.map((column) => (
          <SemesterColumn
            key={column.id ?? 'backlog'}
            column={column}
            choices={column.id === null ? choices : undefined}
            passThreshold={plan.rules.passThreshold}
            creditLabel={plan.preset.creditLabel}
            showCode={plan.preset.codesAreOfficial ?? true}
            notesByCode={notesByCode}
            destinations={destinations}
            actions={actions}
            registerElement={registerElement}
          />
        ))}
      </div>
    </div>
  )
}
