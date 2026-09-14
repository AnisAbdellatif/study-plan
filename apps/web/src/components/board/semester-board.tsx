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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { currentLocale } from '../../i18n/index.ts'
import { cn } from '../../lib/cn.ts'
import { useBoardAutoScroll } from '../../lib/dnd.ts'
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

const NO_NOTES: readonly IssueText[] = []

const sameNotes = (a: readonly IssueText[], b: readonly IssueText[]): boolean =>
  a.length === b.length && a.every((note, i) => note.text === b[i]?.text && note.severity === b[i]?.severity)

const sameEntry = (a: ColumnEntry, b: ColumnEntry | undefined): boolean => {
  if (!b || a.kind !== b.kind || a.index !== b.index) return false
  if (a.kind === 'module' && b.kind === 'module')
    return a.module === b.module && a.chosen === b.chosen && a.notes === b.notes
  if (a.kind === 'placeholder' && b.kind === 'placeholder')
    return a.id === b.id && a.areaId === b.areaId && a.areaName === b.areaName && a.credits === b.credits
  return false
}

const sameColumn = (a: ColumnModel, b: ColumnModel): boolean =>
  a.id === b.id &&
  a.index === b.index &&
  a.title === b.title &&
  a.subtitle === b.subtitle &&
  a.credits === b.credits &&
  a.estimate === b.estimate &&
  a.load === b.load &&
  a.kind === b.kind &&
  a.isCurrent === b.isCurrent &&
  a.entries.length === b.entries.length &&
  a.entries.every((entry, i) => sameEntry(entry, b.entries[i]))

export function SemesterBoard({ plan, summary, currentIndex, actions, notesByCode }: SemesterBoardProps) {
  const { t } = useTranslation('board')
  const locale = currentLocale()
  const elements = useRef(new Map<string | null, HTMLElement>())
  const scrollerRef = useRef<HTMLDivElement>(null)
  useBoardAutoScroll(scrollerRef)
  const registerElement = useCallback((id: string | null, element: HTMLElement | null) => {
    if (element) elements.current.set(id, element)
    else elements.current.delete(id)
  }, [])

  const choices = useMemo(() => choiceAreas(plan), [plan])

  // Every edit builds new column models and issue lists. Reusing the previous objects when their content is
  // unchanged lets the memoised columns and cards skip rendering, so an edit only redraws what it touched.
  const previousNotes = useRef(new Map<string, readonly IssueText[]>())
  const stableNotes = useMemo(() => {
    const next = new Map<string, readonly IssueText[]>()
    for (const [code, notes] of notesByCode) {
      const previous = previousNotes.current.get(code)
      next.set(code, previous && sameNotes(previous, notes) ? previous : notes)
    }
    previousNotes.current = next
    return next
  }, [notesByCode])
  const previousColumns = useRef(new Map<string | null, ColumnModel>())

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
        return module
          ? [
              {
                kind: 'module',
                module,
                index,
                chosen: optionCodes.has(code),
                notes: stableNotes.get(code) ?? NO_NOTES,
              },
            ]
          : []
      })

    // Unplaced options of choice areas are reached through the area tiles, not the module list.
    const backlog = resolve(plan.backlog).filter(
      (entry) => entry.kind === 'module' && !optionCodes.has(entry.module.code),
    )
    const credits = backlog.reduce(
      (sum, entry) => sum + (entry.kind === 'module' ? entry.module.credits : 0),
      0,
    )

    const built: ColumnModel[] = [
      ...plan.semesters.map((semester, index) => {
        const info = summary.semesters[index]
        return {
          id: semester.id,
          index,
          title: t('columns.semester', { number: index + 1 }),
          // The summary labels its terms in German, so the term is formatted here for the current language.
          subtitle: info ? formatTerm(addTerms(plan.startTerm, index), locale) : null,
          credits: info?.credits ?? 0,
          estimate: info?.placeholderCredits ?? 0,
          load: info?.load ?? null,
          kind: semester.kind,
          isCurrent: index === currentIndex,
          entries: resolve(semester.moduleCodes),
        }
      }),
      {
        id: null,
        index: null,
        title: t('columns.backlog'),
        subtitle: null,
        credits,
        estimate: 0,
        load: null,
        kind: null,
        isCurrent: false,
        entries: backlog,
      },
    ]
    const reused = built.map((column) => {
      const previous = previousColumns.current.get(column.id)
      return previous && sameColumn(previous, column) ? previous : column
    })
    previousColumns.current = new Map(reused.map((column) => [column.id, column]))
    return reused
  }, [plan, summary, currentIndex, t, locale, stableNotes])

  // Only a change of the columns' titles changes the move menus; keyed by them so the array stays the same.
  const destinationKey = columns
    .map((column) => `${column.id}\u0000${column.title}\u0000${column.subtitle}`)
    .join('\u0001')
  // biome-ignore lint/correctness/useExhaustiveDependencies: destinationKey captures everything read from columns
  const destinations: Destination[] = useMemo(
    () =>
      columns.map((column) => ({
        id: column.id,
        title: column.subtitle ? `${column.title} (${column.subtitle})` : column.title,
      })),
    [destinationKey],
  )

  const scrollTo = (id: string | null, behavior: ScrollBehavior = 'smooth') =>
    elements.current.get(id)?.scrollIntoView?.({ behavior, inline: 'start', block: 'nearest' })

  // On phones one column fills the screen; the chip of the column in view is highlighted while swiping.
  const [visibleId, setVisibleId] = useState<string | null | undefined>(undefined)
  const columnKey = columns.map((column) => column.id ?? 'backlog').join('|')
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-observe when columns are added, removed or reordered
  useEffect(() => {
    const root = scrollerRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!best) return
        for (const [id, element] of elements.current) if (element === best.target) setVisibleId(id)
      },
      { root, threshold: [0.6] },
    )
    for (const element of elements.current.values()) observer.observe(element)
    return () => observer.disconnect()
  }, [columnKey])

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
        // Stays at the top while a long semester is scrolled, so switching semesters is always one tap away.
        className="sticky top-0 z-20 -mx-4 flex gap-1.5 overflow-x-auto bg-zinc-50/90 px-4 py-2 backdrop-blur sm:hidden print:hidden dark:bg-zinc-950/90"
      >
        {columns.map((column) => {
          const active = visibleId === undefined ? column.isCurrent : visibleId === column.id
          return (
            <button
              key={column.id ?? 'backlog'}
              type="button"
              aria-current={active ? 'true' : undefined}
              onClick={() => scrollTo(column.id)}
              className={cn(
                'h-9 shrink-0 rounded-full px-3.5 text-sm font-medium ring-1 ring-inset',
                active
                  ? 'bg-indigo-600 text-white shadow-sm ring-indigo-600'
                  : column.isCurrent
                    ? 'bg-white/70 text-indigo-700 ring-2 ring-indigo-500 dark:bg-zinc-900/70 dark:text-indigo-300'
                    : 'bg-white/70 ring-zinc-300 dark:bg-zinc-900/70 dark:ring-zinc-700',
              )}
            >
              {column.id === null
                ? t('columns.backlogShort')
                : t('columns.semesterShort', {
                    number: plan.semesters.findIndex((s) => s.id === column.id) + 1,
                  })}
            </button>
          )
        })}
      </nav>
      {/* A little padding on every side: the scroll area clips, and the current semester's ring sits outside its box. */}
      <div
        ref={scrollerRef}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 items-start gap-3 overflow-x-auto px-4 pt-1 pb-4 sm:-mx-1 sm:scroll-px-1 sm:items-stretch sm:px-1 print:mx-0 print:flex-wrap print:overflow-visible print:px-0 print:pt-0"
      >
        {columns.map((column) => (
          <SemesterColumn
            key={column.id ?? 'backlog'}
            column={column}
            choices={column.id === null ? choices : undefined}
            passThreshold={plan.rules.passThreshold}
            creditLabel={plan.preset.creditLabel}
            showCode={plan.preset.codesAreOfficial ?? true}
            destinations={destinations}
            actions={actions}
            registerElement={registerElement}
            areas={plan.areas}
            semesterCount={plan.semesters.length}
          />
        ))}
      </div>
    </div>
  )
}
