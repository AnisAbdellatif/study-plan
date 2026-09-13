import type { ChoiceArea, PlanModule, SemesterLoad } from '@study-plan/shared'
import { Plus, Search, TriangleAlert, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn.ts'
import { useColumnDropTarget, useListAutoScroll } from '../../lib/dnd.ts'
import { formatCredits } from '../../lib/format.ts'
import type { IssueText } from '../../lib/issues.ts'
import { moduleMatchesQuery } from '../../lib/module-search.ts'
import { Button } from '../ui/button.tsx'
import type { BoardActions } from './board-actions.ts'
import { ChoiceAreaTiles } from './choice-area-tiles.tsx'
import { type Destination, ModuleCard } from './module-card.tsx'
import { PlaceholderCard } from './placeholder-card.tsx'

const NO_NOTES: readonly IssueText[] = []

export type ColumnEntry =
  | {
      kind: 'module'
      module: PlanModule
      /** Position in the plan's list for this column. */
      index: number
      /** True for an option of a choice area, which can be turned back into a placeholder. */
      chosen: boolean
    }
  | {
      kind: 'placeholder'
      id: string
      index: number
      areaId: string
      areaName: string
      /** Estimated credits. */
      credits: number
    }

export interface ColumnModel {
  id: string | null
  title: string
  subtitle: string | null
  credits: number
  /** Estimated credits of the placeholders in this column. */
  estimate: number
  load: SemesterLoad | null
  isCurrent: boolean
  entries: ColumnEntry[]
}

export interface SemesterColumnProps {
  column: ColumnModel
  /** Choice areas, shown as tiles in the backlog only. */
  choices?: readonly ChoiceArea[]
  passThreshold: number
  creditLabel: string
  showCode: boolean
  notesByCode: ReadonlyMap<string, readonly IssueText[]>
  destinations: readonly Destination[]
  actions: BoardActions
  registerElement: (id: string | null, element: HTMLElement | null) => void
}

export function SemesterColumn({
  column,
  choices = [],
  passThreshold,
  creditLabel,
  showCode,
  notesByCode,
  destinations,
  actions,
  registerElement,
}: SemesterColumnProps) {
  const { t } = useTranslation('board')
  const headingId = useId()
  const ref = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  useListAutoScroll(listRef)
  const { isOver } = useColumnDropTarget(ref, column.id)
  const searchId = useId()
  const [query, setQuery] = useState('')
  const isBacklog = column.id === null
  const searchable = isBacklog && column.entries.length > 0
  const filtering = searchable && query.trim() !== ''
  const customLabel = t('card.custom')
  const visible = column.entries.filter(
    (entry) =>
      !filtering ||
      (entry.kind === 'module' && moduleMatchesQuery(entry.module, query, showCode, customLabel)),
  )
  const semesterDestinations = destinations.filter((destination) => destination.id !== null)

  return (
    <section
      ref={(element) => {
        ref.current = element
        registerElement(column.id, element)
      }}
      aria-labelledby={headingId}
      className={cn(
        // Phones and tablets show one to three columns and swipe. From xl, all columns share the width so a
        // typical plan fits without scrolling; below the minimum width (many semesters) the board scrolls again.
        'print:w-[calc(33.333%-0.5rem)]! print:max-w-none! print:max-h-none print:break-inside-avoid flex max-h-[calc(100dvh-2rem)] w-[85vw] max-w-sm shrink-0 snap-start flex-col rounded-xl bg-zinc-200/60 p-2 ring-2 ring-transparent transition-colors sm:w-[calc((100%-0.75rem)/2)] md:w-[calc((100%-1.5rem)/3)] xl:w-auto xl:max-w-none xl:min-w-40 xl:basis-0 dark:bg-zinc-900/70',
        // cn does not merge Tailwind classes, so each column gets exactly one flex-grow value.
        isBacklog ? 'bg-zinc-200/30 xl:flex-[1.2] dark:bg-zinc-900/30' : 'xl:flex-1',
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
              {t('columns.current')}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          {column.subtitle ? <span>{column.subtitle}</span> : null}
          {column.subtitle ? <span aria-hidden>·</span> : null}
          <span className="tabular-nums">
            {column.estimate > 0
              ? t('columns.creditsWithEstimate', {
                  credits: formatCredits(column.credits),
                  estimate: formatCredits(column.estimate),
                  label: creditLabel,
                })
              : `${formatCredits(column.credits)} ${creditLabel}`}
          </span>
          {column.load === 'high' ? (
            <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-400">
              <TriangleAlert aria-hidden className="size-3" />
              {t('columns.highLoad')}
            </span>
          ) : null}
        </p>
      </header>

      {isBacklog && choices.length > 0 ? (
        <ChoiceAreaTiles
          choices={choices}
          creditLabel={creditLabel}
          destinations={semesterDestinations}
          actions={actions}
        />
      ) : null}

      {isBacklog ? (
        <div className="px-1 pb-2 print:hidden">
          <Button size="sm" variant="ghost" className="w-full justify-start" onClick={actions.onAddCustom}>
            <Plus aria-hidden className="size-4" />
            {t('columns.addCustomModule')}
          </Button>
        </div>
      ) : null}

      {searchable ? (
        <div className="px-1 pb-2">
          <label htmlFor={searchId} className="sr-only">
            {t('columns.searchLabel')}
          </label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-zinc-500"
            />
            <input
              id={searchId}
              type="search"
              value={query}
              placeholder={t('columns.searchPlaceholder')}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && query !== '') {
                  event.preventDefault()
                  setQuery('')
                }
              }}
              className="h-8 w-full rounded-lg bg-white pr-8 pl-8 text-sm ring-1 ring-zinc-300 ring-inset [&::-webkit-search-cancel-button]:hidden focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700"
            />
            {query !== '' ? (
              <button
                type="button"
                aria-label={t('columns.clearSearch')}
                onClick={() => setQuery('')}
                className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-zinc-500 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:text-zinc-100"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            ) : null}
          </div>
          {filtering ? (
            <p role="status" className="mt-1 px-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              {t('columns.searchCount', { shown: visible.length, total: column.entries.length })}
            </p>
          ) : null}
        </div>
      ) : null}

      <ul
        aria-label={t('columns.modulesIn', { column: column.title })}
        ref={listRef}
        className="-mx-1 flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-1 py-1 print:overflow-visible"
      >
        {visible.map((entry) =>
          entry.kind === 'placeholder' ? (
            <PlaceholderCard
              key={entry.id}
              id={entry.id}
              areaName={entry.areaName}
              credits={entry.credits}
              columnId={column.id}
              index={entry.index}
              creditLabel={creditLabel}
              destinations={semesterDestinations}
              actions={actions}
            />
          ) : (
            <ModuleCard
              key={entry.module.code}
              module={entry.module}
              columnId={column.id}
              index={entry.index}
              chosen={entry.chosen && column.id !== null}
              passThreshold={passThreshold}
              creditLabel={creditLabel}
              showCode={showCode}
              notes={notesByCode.get(entry.module.code) ?? NO_NOTES}
              destinations={destinations}
              actions={actions}
            />
          ),
        )}
        {filtering && visible.length === 0 ? (
          <li className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500 dark:border-zinc-700">
            {choices.length > 0
              ? t('columns.searchEmptyWithChoices', { query: query.trim() })
              : t('columns.searchEmpty', { query: query.trim() })}
          </li>
        ) : null}
        {column.entries.length === 0 ? (
          <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500 dark:border-zinc-700">
            {!isBacklog
              ? t('columns.emptySemester')
              : choices.length > 0
                ? t('columns.emptyBacklogWithChoices')
                : t('columns.emptyBacklog')}
          </li>
        ) : null}
      </ul>
    </section>
  )
}
