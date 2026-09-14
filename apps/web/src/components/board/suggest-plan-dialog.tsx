import {
  addTerms,
  DEFAULT_CREDITS_PER_SEMESTER,
  formatTerm,
  graduationForecast,
  type Plan,
  suggestPlan,
} from '@study-plan/shared'
import { type FormEvent, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLocale } from '../../i18n/index.ts'
import { Button } from '../ui/button.tsx'
import { Dialog } from '../ui/dialog.tsx'

const fieldClass =
  'mt-1 h-10 rounded-lg bg-white px-3 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700'
const MIN_CREDITS = 5
const MAX_CREDITS = 60

export interface SuggestPlanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: Plan
  /** Index of the semester running now; the suggestion starts there by default. */
  currentIndex: number
  onApply: (next: Plan, moved: number) => void
}

/** Rearranges the open modules with `suggestPlan`, after a preview of what would change. */
export function SuggestPlanDialog({
  open,
  onOpenChange,
  plan,
  currentIndex,
  onApply,
}: SuggestPlanDialogProps) {
  const { t } = useTranslation('board')
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('suggest.title')}
      description={t('suggest.description')}
    >
      {/* Mounted only while open, so every opening starts from the current semester again. */}
      {open ? (
        <SuggestForm
          plan={plan}
          currentIndex={currentIndex}
          onCancel={() => onOpenChange(false)}
          onApply={onApply}
        />
      ) : null}
    </Dialog>
  )
}

function SuggestForm({
  plan,
  currentIndex,
  onCancel,
  onApply,
}: {
  plan: Plan
  currentIndex: number
  onCancel: () => void
  onApply: (next: Plan, moved: number) => void
}) {
  const { t } = useTranslation(['board', 'common'])
  const fromId = useId()
  const creditsId = useId()
  const hintId = useId()
  const locale = currentLocale()
  const [from, setFrom] = useState(Math.max(0, Math.min(currentIndex, plan.semesters.length - 1)))
  const [credits, setCredits] = useState(String(DEFAULT_CREDITS_PER_SEMESTER))
  const [includeUnplanned, setIncludeUnplanned] = useState(true)

  const value = Number(credits)
  const valid = credits !== '' && Number.isInteger(value * 2) && value >= MIN_CREDITS && value <= MAX_CREDITS
  const suggestion = useMemo(
    () =>
      valid
        ? suggestPlan(plan, { fromSemesterIndex: from, creditsPerSemester: value, includeUnplanned })
        : null,
    [plan, from, value, valid, includeUnplanned],
  )
  const finish = useMemo(
    () =>
      suggestion ? graduationForecast(suggestion.plan, { currentSemesterIndex: currentIndex }).planned : null,
    [suggestion, currentIndex],
  )
  const names = new Map(plan.modules.map((module) => [module.code, module.name]))
  const changed =
    suggestion !== null &&
    (suggestion.moved.length > 0 || suggestion.plan.semesters.length !== plan.semesters.length)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (suggestion && changed) onApply(suggestion.plan, suggestion.moved.length)
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <div>
          <label htmlFor={fromId} className="block font-medium">
            {t('suggest.from')}
          </label>
          <select
            id={fromId}
            value={from}
            onChange={(event) => setFrom(Number(event.target.value))}
            className={`${fieldClass} w-full`}
          >
            {plan.semesters.map((semester, index) => (
              <option key={semester.id} value={index}>
                {t('suggest.fromOption', {
                  number: index + 1,
                  term: formatTerm(addTerms(plan.startTerm, index), locale),
                })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={creditsId} className="block font-medium">
            {t('suggest.credits', { label: plan.preset.creditLabel })}
          </label>
          <input
            id={creditsId}
            type="number"
            inputMode="decimal"
            min={MIN_CREDITS}
            max={MAX_CREDITS}
            step={0.5}
            required
            value={credits}
            aria-describedby={hintId}
            onChange={(event) => setCredits(event.target.value)}
            className={`${fieldClass} w-full tabular-nums`}
          />
        </div>
        <p id={hintId} className="text-xs text-zinc-600 sm:col-span-2 dark:text-zinc-400">
          {t('suggest.creditsHint')}
        </p>
      </div>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={includeUnplanned}
          onChange={(event) => setIncludeUnplanned(event.target.checked)}
          className="mt-0.5 size-4 accent-indigo-600"
        />
        <span>{t('suggest.includeUnplanned')}</span>
      </label>

      <div
        role="status"
        data-testid="suggest-preview"
        className="space-y-1 rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200 dark:bg-zinc-950/60 dark:ring-zinc-800"
      >
        <p className="font-medium">{t('suggest.preview')}</p>
        {suggestion === null ? (
          <p>{t('suggest.invalidCredits', { min: MIN_CREDITS, max: MAX_CREDITS })}</p>
        ) : (
          <>
            <p>{changed ? t('suggest.moved', { count: suggestion.moved.length }) : t('suggest.unchanged')}</p>
            {suggestion.plan.semesters.length !== plan.semesters.length ? (
              <p>
                {t('suggest.semesters', {
                  before: plan.semesters.length,
                  after: suggestion.plan.semesters.length,
                })}
              </p>
            ) : null}
            {finish ? (
              <p>
                {t('suggest.finish', {
                  term: formatTerm(finish.term, locale),
                  number: finish.subjectSemesters,
                })}
              </p>
            ) : null}
            {suggestion.unplaced.length > 0 ? (
              <p className="text-amber-800 dark:text-amber-300">
                {t('suggest.unplaced', {
                  count: suggestion.unplaced.length,
                  names: suggestion.unplaced.map((code) => names.get(code) ?? code).join(', '),
                })}
              </p>
            ) : null}
          </>
        )}
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">{t('suggest.exportHint')}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t('common:actions.cancel')}
        </Button>
        <Button variant="primary" type="submit" disabled={!changed}>
          {t('suggest.apply')}
        </Button>
      </div>
    </form>
  )
}
