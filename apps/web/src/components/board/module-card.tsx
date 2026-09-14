import { currentResult, type PlanModule } from '@study-plan/shared'
import { CircleAlert, EllipsisVertical, Info, TriangleAlert } from 'lucide-react'
import { memo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { type AreaTone, NEUTRAL_TONE } from '../../lib/area-colors.ts'
import { cn } from '../../lib/cn.ts'
import { useDraggableModule } from '../../lib/dnd.ts'
import { examKindLabels } from '../../lib/exam-kinds.ts'
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
import type { BoardActions } from './board-actions.ts'

export interface Destination {
  id: string | null
  title: string
}

export interface ModuleCardProps {
  module: PlanModule
  columnId: string | null
  index: number
  /** True for an option of a choice area placed in a semester. */
  chosen?: boolean
  passThreshold: number
  creditLabel: string
  /** False when the preset's module codes are made up; they are then hidden. */
  showCode: boolean
  destinations: readonly Destination[]
  actions: BoardActions
  /** Validation notes for this module, already worded for the card. */
  notes: readonly IssueText[]
  /** Colour of the module's area. */
  tone?: AreaTone
}

/** A module's current result as a solid badge; also used on shared plans that include grades. */
export function ResultBadge({ module, passThreshold }: { module: PlanModule; passThreshold: number }) {
  const { t } = useTranslation('board')
  const result = currentResult(module)
  // Solid badges: the cards are tinted by area now, so light result colours would blend into them.
  const base = 'rounded px-1.5 py-0.5 font-semibold tabular-nums shadow-sm'
  const passed = 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950'
  const failed = 'bg-red-600 text-white dark:bg-red-500 dark:text-red-950'

  switch (result.kind) {
    case 'graded':
      return (
        <span className={cn(base, result.grade <= passThreshold ? passed : failed)}>
          <span className="sr-only">{t('card.gradeSr')} </span>
          {formatGrade(result.grade)}
        </span>
      )
    case 'passed':
      return <span className={cn(base, passed)}>{t('card.passed')}</span>
    case 'failed':
      return <span className={cn(base, failed)}>{t('card.failed')}</span>
    case 'open':
      return null
  }
}

/** Memoised: re-renders only when this card's module, position, notes or labels change. */
export const ModuleCard = memo(function ModuleCard({
  module,
  columnId,
  index,
  chosen = false,
  passThreshold,
  creditLabel,
  showCode,
  destinations,
  actions,
  notes,
  tone = NEUTRAL_TONE,
}: ModuleCardProps) {
  const { onMove, onGrade, onDetails } = actions
  const { t } = useTranslation('board')
  const ref = useRef<HTMLLIElement>(null)
  const { isDragging, closestEdge } = useDraggableModule(ref, { code: module.code, columnId, index })

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users open the details from the card menu
    <li
      ref={ref}
      onClick={(event) => {
        // Menus and buttons on the card handle their own clicks; a drag never ends in a click.
        if ((event.target as HTMLElement).closest('button, a, input, [role="menu"], [role="menuitem"]'))
          return
        onDetails(module.code)
      }}
      className={cn(
        'relative cursor-grab rounded-lg border-l-4 p-2.5 shadow-sm ring-1 ring-zinc-900/10 active:cursor-grabbing dark:ring-white/10',
        tone.stripe,
        tone.soft,
        isDragging && 'opacity-40',
        notes.some((note) => note.severity === 'error')
          ? 'outline-2 outline-red-500/80 dark:outline-red-500/70'
          : notes.some((note) => note.severity === 'warning') &&
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
            {showCode && !module.custom ? `${module.code} · ` : ''}
            {module.custom ? t('card.custom') : module.category}
          </p>
          <h3 className="text-sm leading-snug font-medium">{module.name}</h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
            <span className="tabular-nums">
              {formatCredits(module.credits)} {creditLabel}
            </span>
            {/* Minimal marker; the full sentence is the tooltip and what screen readers hear. */}
            <span
              className={cn(
                'rounded px-1.5 py-0.5 font-medium',
                module.countsTowardAverage
                  ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-200'
                  : 'bg-white/80 text-zinc-500 dark:bg-zinc-950/50 dark:text-zinc-400',
              )}
              title={t(module.countsTowardAverage ? 'card.counts' : 'card.notCounted')}
            >
              <span className="sr-only">
                {t(module.countsTowardAverage ? 'card.counts' : 'card.notCounted')}
              </span>
              <span aria-hidden>
                {t(module.countsTowardAverage ? 'card.countsShort' : 'card.notCountedShort')}
              </span>
            </span>
            {module.internship ? <span>· {t('card.internship')}</span> : null}
            {module.recognition ? (
              <span
                className={cn(
                  'rounded px-1.5 py-0.5 font-medium',
                  module.recognition.status === 'approved'
                    ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200'
                    : module.recognition.status === 'rejected'
                      ? 'bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200'
                      : 'bg-white/80 text-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-300',
                )}
              >
                {t(`card.recognition.${module.recognition.status}`)}
              </span>
            ) : null}
            {examKindLabels(module).length > 0 ? (
              // The verbatim forms ("Klausur (90 Min.)") are in the details; the card only names the kind.
              <span
                className="rounded bg-white/80 px-1.5 py-0.5 dark:bg-zinc-950/50"
                title={module.details?.examForms?.join(' · ')}
              >
                <span className="sr-only">{t('card.examKindSr')} </span>
                {examKindLabels(module).join(' / ')}
              </span>
            ) : null}
            {module.retired ? <span>· {t('card.retired')}</span> : null}
            <ResultBadge module={module} passThreshold={passThreshold} />
            {module.attempts.length > 1 ? (
              <span className="tabular-nums">{t('card.attempt', { number: module.attempts.length })}</span>
            ) : null}
            {module.attempts.at(-1)?.result === 'registered' ? (
              <span className="rounded bg-white/80 px-1.5 py-0.5 dark:bg-zinc-950/50">
                {t('card.registered')}
              </span>
            ) : null}
            {module.examDate ? (
              <span className="rounded bg-white/80 px-1.5 py-0.5 tabular-nums dark:bg-zinc-950/50">
                {t('card.exam', { date: formatShortDate(module.examDate) })}
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
                    note.severity === 'error'
                      ? 'font-medium text-red-700 dark:text-red-400'
                      : note.severity === 'warning'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-zinc-500 dark:text-zinc-400',
                  )}
                >
                  {note.severity === 'error' ? (
                    <CircleAlert aria-hidden className="mt-px size-3 shrink-0" />
                  ) : note.severity === 'warning' ? (
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
                aria-label={t('card.actionsFor', { name: module.name })}
              />
            }
          >
            <EllipsisVertical aria-hidden className="size-4" />
          </MenuTrigger>
          <MenuContent>
            <MenuItem onClick={() => onDetails(module.code)}>{t('card.details')}</MenuItem>
            <MenuItem onClick={() => onGrade(module.code)}>
              {module.grading === 'graded' ? t('card.enterGrade') : t('card.enterResult')}
            </MenuItem>
            {chosen ? (
              <>
                <MenuSeparator />
                <MenuItem onClick={() => actions.onChooseOther(module.code)}>
                  {t('card.chooseOther')}
                </MenuItem>
                <MenuItem onClick={() => actions.onUnchoose(module.code)}>{t('card.unchoose')}</MenuItem>
              </>
            ) : null}
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>{t('card.moveTo')}</MenuGroupLabel>
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
            {module.custom ? (
              <>
                <MenuSeparator />
                <MenuItem onClick={() => actions.onEditCustom(module.code)}>{t('card.edit')}</MenuItem>
                <MenuItem
                  className="text-red-700 dark:text-red-400"
                  onClick={() => actions.onDeleteCustom(module.code)}
                >
                  {t('card.delete')}
                </MenuItem>
              </>
            ) : null}
          </MenuContent>
        </MenuRoot>
      </div>
    </li>
  )
})
