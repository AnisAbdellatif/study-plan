import type {
  AreaChoiceStatus,
  ChoiceArea,
  Plan,
  PlanModule,
  PlanSemester,
  SemesterLoad,
} from '@study-plan/shared'
import {
  ArrowLeft,
  ArrowLeftToLine,
  ArrowRight,
  ArrowRightToLine,
  EllipsisVertical,
  GripVertical,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { memo, useCallback, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { areaTone, moduleTone } from '../../lib/area-colors.ts'
import { cn } from '../../lib/cn.ts'
import { useColumnDropTarget, useDraggableSemester, useListAutoScroll } from '../../lib/dnd.ts'
import { formatCredits } from '../../lib/format.ts'
import type { IssueText } from '../../lib/issues.ts'
import { moduleMatchesQuery } from '../../lib/module-search.ts'
import { Button } from '../ui/button.tsx'
import {
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from '../ui/menu.tsx'
import type { BoardActions } from './board-actions.ts'
import { ChoiceAreaTiles } from './choice-area-tiles.tsx'
import { type Destination, ModuleCard } from './module-card.tsx'
import { PlaceholderCard } from './placeholder-card.tsx'

const SEMESTER_KINDS = [
  'regular',
  'part_time',
  'leave',
  'abroad',
] as const satisfies readonly PlanSemester['kind'][]

/** Insert, move, kind and delete for one semester; menu items keep all of it usable without dragging. */
function SemesterMenu({
  semesterId,
  index,
  count,
  title,
  kind,
  actions,
}: {
  semesterId: string
  index: number
  count: number
  title: string
  kind: PlanSemester['kind']
  actions: BoardActions
}) {
  const { t } = useTranslation('board')
  return (
    <MenuRoot>
      <MenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="-my-2 -mr-2 print:hidden"
            aria-label={t('semesterMenu.label', { column: title })}
          />
        }
      >
        <EllipsisVertical aria-hidden className="size-4" />
      </MenuTrigger>
      <MenuContent>
        <MenuItem onClick={() => actions.onInsertSemester(index)}>
          <ArrowLeftToLine aria-hidden className="size-4" />
          {t('semesterMenu.insertBefore')}
        </MenuItem>
        <MenuItem onClick={() => actions.onInsertSemester(index + 1)}>
          <ArrowRightToLine aria-hidden className="size-4" />
          {t('semesterMenu.insertAfter')}
        </MenuItem>
        <MenuSeparator />
        <MenuItem disabled={index === 0} onClick={() => actions.onMoveSemester(semesterId, index - 1)}>
          <ArrowLeft aria-hidden className="size-4" />
          {t('semesterMenu.moveLeft')}
        </MenuItem>
        <MenuItem disabled={index >= count - 1} onClick={() => actions.onMoveSemester(semesterId, index + 1)}>
          <ArrowRight aria-hidden className="size-4" />
          {t('semesterMenu.moveRight')}
        </MenuItem>
        <MenuSeparator />
        <MenuGroup>
          <MenuGroupLabel>{t('semesterMenu.kind')}</MenuGroupLabel>
          <MenuRadioGroup
            value={kind}
            onValueChange={(value: unknown) => {
              const next = SEMESTER_KINDS.find((candidate) => candidate === value)
              if (next) actions.onSetSemesterKind(semesterId, next)
            }}
          >
            {SEMESTER_KINDS.map((option) => (
              <MenuRadioItem key={option} value={option}>
                {t(`semesterMenu.kinds.${option}`)}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        <MenuItem
          disabled={count <= 1}
          className="text-red-700 dark:text-red-400"
          onClick={() => actions.onDeleteSemester(semesterId)}
        >
          <Trash2 aria-hidden className="size-4" />
          {t('semesterMenu.delete')}
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  )
}

/** A module's group as its card shows it. */
export interface ModuleGroupInfo {
  size: number
  /** Credits the whole group counts with. */
  credits: number
}

export type ColumnEntry =
  | {
      kind: 'module'
      module: PlanModule
      /** Position in the plan's list for this column. */
      index: number
      /** True for an option of a choice area, which can be turned back into a placeholder. */
      chosen: boolean
      /** Validation notes for the card; the same array as before while its content is unchanged. */
      notes: readonly IssueText[]
      /** Set when the module is one of a group of options planned together. */
      group?: ModuleGroupInfo
      /** The module can join the current selection for grouping. */
      selectable: boolean
      selected: boolean
      /** A selection for grouping is in progress on the board. */
      selecting: boolean
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
  /** Position among the semesters; null for the backlog. */
  index: number | null
  title: string
  subtitle: string | null
  credits: number
  /** Estimated credits of the placeholders in this column. */
  estimate: number
  load: SemesterLoad | null
  /** Null for the backlog. */
  kind: PlanSemester['kind'] | null
  isCurrent: boolean
  entries: ColumnEntry[]
}

export interface SemesterColumnProps {
  column: ColumnModel
  /** Choice areas, shown as tiles in the backlog only. */
  choices?: readonly ChoiceArea[]
  /** Area choices such as the Nebenfach, shown with the tiles in the backlog only. */
  areaChoices?: readonly AreaChoiceStatus[]
  passThreshold: number
  creditLabel: string
  showCode: boolean
  destinations: readonly Destination[]
  actions: BoardActions
  registerElement: (id: string | null, element: HTMLElement | null) => void
  /** The plan's areas, which colour the cards. */
  areas: Plan['areas']
  /** Number of semesters, for the move and delete menu items. */
  semesterCount: number
}

const NO_CHOICES: readonly ChoiceArea[] = []
const NO_AREA_CHOICES: readonly AreaChoiceStatus[] = []

/** Memoised: the board keeps a column's props identical while nothing in it changed. */
export const SemesterColumn = memo(function SemesterColumn({
  column,
  choices = NO_CHOICES,
  areaChoices = NO_AREA_CHOICES,
  passThreshold,
  creditLabel,
  showCode,
  destinations,
  actions,
  registerElement,
  areas,
  semesterCount,
}: SemesterColumnProps) {
  const { t } = useTranslation('board')
  const headingId = useId()
  const ref = useRef<HTMLElement>(null)
  const handleRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  useListAutoScroll(listRef)
  const { isOver, semesterEdge } = useColumnDropTarget(ref, column.id, column.index)
  const { isDragging } = useDraggableSemester(ref, handleRef, column.id, column.index)
  const isSemester = column.id !== null && column.index !== null
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
  const semesterDestinations = useMemo(
    () => destinations.filter((destination) => destination.id !== null),
    [destinations],
  )
  const columnId = column.id
  const setSectionRef = useCallback(
    (element: HTMLElement | null) => {
      ref.current = element
      registerElement(columnId, element)
    },
    [registerElement, columnId],
  )

  return (
    <section
      ref={setSectionRef}
      aria-labelledby={headingId}
      className={cn(
        // Phones and tablets show one to three columns and swipe. From xl, all columns share the width so a
        // typical plan fits without scrolling; below the minimum width (many semesters) the board scrolls again.
        'print:w-[calc(33.333%-0.5rem)]! print:max-w-none! print:max-h-none print:break-inside-avoid relative flex w-[85vw] max-w-sm shrink-0 snap-start flex-col rounded-xl p-2 transition-colors sm:w-[calc((100%-0.75rem)/2)] md:w-[calc((100%-1.5rem)/3)] xl:w-auto xl:max-w-none xl:min-w-40 xl:basis-0',
        // cn does not merge Tailwind classes, so each column gets exactly one flex-grow value.
        // Semesters grow to show every module. The not-planned column doesn't size the row (contain-size): it stretches
        // to the tallest semester, at least a screen high, and scrolls its own list, so every column is a full drop zone.
        isBacklog
          ? 'sm:min-h-[calc(100dvh-2rem)] sm:contain-size xl:flex-[1.2] print:min-h-0 print:contain-none'
          : 'xl:flex-1',
        // Likewise exactly one background and ring per state: drop target, current semester, backlog, other semesters.
        isOver
          ? 'bg-indigo-100 ring-2 ring-indigo-500 dark:bg-indigo-900/40 dark:ring-indigo-400'
          : column.isCurrent
            ? 'bg-indigo-50 shadow-md ring-2 shadow-indigo-500/10 ring-indigo-500/70 dark:bg-indigo-950/50 dark:shadow-none dark:ring-indigo-400/70'
            : isBacklog
              ? 'bg-slate-200/35 ring-1 ring-zinc-300/50 dark:bg-zinc-900/35 dark:ring-zinc-800/60'
              : 'bg-slate-200/75 ring-1 ring-slate-300/60 dark:bg-zinc-900/80 dark:ring-zinc-800',
        isDragging && 'opacity-50',
      )}
    >
      {semesterEdge ? (
        // In the middle of the gap between two columns (gap-3), where the semester would land.
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-2 w-1 rounded-full bg-indigo-500',
            semesterEdge === 'left' ? '-left-2' : '-right-2',
          )}
        />
      ) : null}
      <header
        ref={handleRef}
        // Dragging is an enhancement; the semester menu moves semesters with the keyboard too.
        title={isSemester ? t('columns.dragSemester') : undefined}
        className={cn(
          'mb-2 border-b px-1.5 pt-1 pb-2',
          isSemester && 'cursor-grab active:cursor-grabbing pointer-coarse:cursor-auto print:cursor-auto',
          column.isCurrent
            ? 'border-indigo-200 dark:border-indigo-800/70'
            : 'border-zinc-300/70 dark:border-zinc-700/60',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          {isSemester ? (
            <GripVertical
              aria-hidden
              className="-ml-1 size-3.5 shrink-0 text-zinc-400 pointer-coarse:hidden print:hidden dark:text-zinc-500"
            />
          ) : null}
          <h2
            id={headingId}
            className={cn(
              'flex-1 text-sm font-semibold',
              column.isCurrent && 'text-indigo-900 dark:text-indigo-100',
              isBacklog && 'text-zinc-700 dark:text-zinc-300',
            )}
          >
            {column.title}
          </h2>
          <div className="flex items-center gap-1">
            {column.kind !== null && column.kind !== 'regular' ? (
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-zinc-700 ring-1 ring-zinc-300 dark:bg-zinc-950/60 dark:text-zinc-300 dark:ring-zinc-700">
                {t(`columns.kinds.${column.kind}`)}
              </span>
            ) : null}
            {column.isCurrent ? (
              <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white shadow-sm">
                {t('columns.current')}
              </span>
            ) : null}
            {column.id !== null && column.index !== null ? (
              <SemesterMenu
                semesterId={column.id}
                index={column.index}
                count={semesterCount}
                title={column.title}
                kind={column.kind ?? 'regular'}
                actions={actions}
              />
            ) : null}
          </div>
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

      {/* On top, so it stays in reach however many areas and modules follow; the gap below sets it apart from the
          scrolling area tiles. */}
      {isBacklog ? (
        <div className="px-1 pb-3 print:hidden">
          <Button size="sm" variant="ghost" className="w-full justify-start" onClick={actions.onAddCustom}>
            <Plus aria-hidden className="size-4" />
            {t('columns.addCustomModule')}
          </Button>
        </div>
      ) : null}

      {isBacklog && (choices.length > 0 || areaChoices.length > 0) ? (
        <ChoiceAreaTiles
          choices={choices}
          areaChoices={areaChoices}
          creditLabel={creditLabel}
          destinations={semesterDestinations}
          actions={actions}
          areas={areas}
        />
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
        className={cn(
          // No overscroll containment: once the list reaches its end, the wheel keeps scrolling the page.
          '-mx-1 flex flex-1 flex-col gap-2 px-1 py-1 print:overflow-visible',
          // Only the not-planned list scrolls; semester lists show all their modules.
          isBacklog ? 'min-h-12 sm:overflow-y-auto' : 'min-h-24',
        )}
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
              tone={areaTone({ areas }, entry.areaId)}
            />
          ) : (
            <ModuleCard
              key={entry.module.code}
              module={entry.module}
              columnId={column.id}
              index={entry.index}
              chosen={entry.chosen && column.id !== null}
              group={entry.group}
              selectable={entry.selectable}
              selected={entry.selected}
              selecting={entry.selecting}
              passThreshold={passThreshold}
              creditLabel={creditLabel}
              showCode={showCode}
              notes={entry.notes}
              destinations={destinations}
              actions={actions}
              tone={moduleTone({ areas }, entry.module.code)}
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
          <li
            className={cn(
              'flex items-center justify-center rounded-lg border border-dashed border-zinc-300 text-center text-xs text-zinc-500 dark:border-zinc-700',
              isBacklog ? 'px-3 py-2' : 'flex-1 p-4',
            )}
          >
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
})
