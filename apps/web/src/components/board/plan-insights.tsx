import {
  addTerms,
  type CreditRequirement,
  type DeadlineEvent,
  daysBetween,
  formatTerm,
  type Plan,
  prerequisiteCodes,
  type WhatIfAnalysis,
} from '@study-plan/shared'
import {
  CalendarClock,
  CalendarPlus,
  CircleAlert,
  GraduationCap,
  Info,
  ListChecks,
  Target,
  TriangleAlert,
} from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLocale } from '../../i18n/index.ts'
import { cn } from '../../lib/cn.ts'
import {
  formatCredits,
  formatGrade,
  formatGradeString,
  formatLongDate,
  formatRelativeDays,
} from '../../lib/format.ts'
import type { IssueText } from '../../lib/issues.ts'
import { Button } from '../ui/button.tsx'

const cardClass = 'rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'
const headingClass = 'flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400'
const headingIconClass = 'size-4 shrink-0 text-indigo-600 dark:text-indigo-400'

function HintsCard({ hints }: { hints: readonly IssueText[] }) {
  const { t } = useTranslation('board')
  const headingId = useId()
  const warnings = hints.filter((hint) => hint.severity === 'warning').length
  const errors = hints.filter((hint) => hint.severity === 'error').length
  return (
    <section aria-labelledby={headingId} className={cardClass}>
      <h2 id={headingId} className={headingClass}>
        <ListChecks
          aria-hidden
          className={cn(
            'size-4 shrink-0',
            errors > 0
              ? 'text-red-600 dark:text-red-400'
              : warnings > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400',
          )}
        />
        {t('hints.title')}
      </h2>
      <p className="mt-1 text-lg font-semibold">
        {errors > 0
          ? [
              t('hints.problems', { count: errors }),
              ...(warnings > 0 ? [t('hints.warnings', { count: warnings })] : []),
            ].join(' · ')
          : warnings === 0
            ? t('hints.noWarnings')
            : t('hints.warnings', { count: warnings })}
      </p>
      {hints.length > 0 ? (
        <ul className="mt-2 space-y-1.5 text-sm sm:max-h-56 sm:overflow-y-auto">
          {hints.map((hint) => (
            <li
              key={hint.text}
              className={cn(
                'flex items-start gap-1.5',
                hint.severity === 'error'
                  ? 'font-medium text-red-700 dark:text-red-400'
                  : hint.severity === 'warning'
                    ? 'text-amber-800 dark:text-amber-300'
                    : 'text-zinc-600 dark:text-zinc-400',
              )}
            >
              {hint.severity === 'error' ? (
                <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              ) : hint.severity === 'warning' ? (
                <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              )}
              <span>{hint.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t('hints.allGood')}</p>
      )}
    </section>
  )
}

function WhatIfCard({
  plan,
  analysis,
  onTargetChange,
}: {
  plan: Plan
  analysis: WhatIfAnalysis
  onTargetChange: (grade: number | null) => void
}) {
  const { t } = useTranslation('board')
  const headingId = useId()
  const selectId = useId()
  const steps = (plan.rules.standardGrades ?? plan.rules.allowedValues)
    .filter((grade) => grade <= plan.rules.passThreshold)
    .sort((a, b) => a - b)
  const bestStep = steps[0]
  const worstStep = steps.at(-1)
  const show = (value: string | null) => (value === null ? '–' : formatGradeString(value))
  const { target } = analysis

  let targetText = t('whatIf.pickTarget')
  if (target) {
    const goal = formatGrade(target.grade)
    if (analysis.openCredits === 0) {
      targetText = target.reachable
        ? t('whatIf.reachedAlready', { goal })
        : t('whatIf.outOfReachNoModules', { goal })
    } else if (!target.reachable || target.requiredGrade === null) {
      targetText = t('whatIf.unreachable', { goal })
    } else if (target.requiredGrade === worstStep) {
      targetText = t('whatIf.reachableWithWorst', { goal, grade: formatGrade(target.requiredGrade) })
    } else {
      targetText = t('whatIf.required', { goal, grade: formatGrade(target.requiredGrade) })
    }
  }

  return (
    <section aria-labelledby={headingId} className={cardClass}>
      <h2 id={headingId} className={headingClass}>
        <Target aria-hidden className={headingIconClass} />
        {t('whatIf.title')}
      </h2>
      <div className="mt-1 flex items-center gap-2">
        <label htmlFor={selectId} className="text-sm font-medium">
          {t('whatIf.target')}
        </label>
        <select
          id={selectId}
          value={plan.targetGrade === undefined ? '' : String(plan.targetGrade)}
          onChange={(event) => onTargetChange(event.target.value === '' ? null : Number(event.target.value))}
          className="h-8 rounded-lg bg-white px-2 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700"
        >
          <option value="">–</option>
          {steps.map((grade) => (
            <option key={grade} value={String(grade)}>
              {formatGrade(grade)}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-2 text-sm" data-testid="what-if-result">
        {targetText}
      </p>
      <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
        {analysis.openCredits === 0 || bestStep === undefined || worstStep === undefined
          ? t('whatIf.noOpenModules')
          : t('whatIf.range', {
              credits: formatCredits(analysis.openCredits),
              label: plan.preset.creditLabel,
              best: formatGrade(bestStep),
              bestCase: show(analysis.bestCase),
              worst: formatGrade(worstStep),
              worstCase: show(analysis.worstCase),
            })}
      </p>
    </section>
  )
}

function DeadlinesCard({
  plan,
  today,
  upcoming,
  canExport,
  onExport,
}: {
  plan: Plan
  today: string
  upcoming: readonly DeadlineEvent[]
  canExport: boolean
  onExport: () => void
}) {
  const { t } = useTranslation('board')
  const headingId = useId()
  const withdrawalDays = plan.preset.withdrawalDaysBeforeExam
  return (
    <section aria-labelledby={headingId} className={cardClass}>
      <div className="flex items-start justify-between gap-2">
        <h2 id={headingId} className={headingClass}>
          <CalendarClock aria-hidden className={headingIconClass} />
          {t('deadlines.title')}
        </h2>
        <Button size="sm" variant="ghost" onClick={onExport} disabled={!canExport} className="-mt-1 -mr-1">
          <CalendarPlus aria-hidden className="size-4" />
          {t('deadlines.calendar')}
        </Button>
      </div>
      {upcoming.length > 0 ? (
        <ul className="mt-2 space-y-2 text-sm sm:max-h-56 sm:overflow-y-auto">
          {upcoming.map((event) => (
            <li key={`${event.kind}-${event.code}`} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span
                  className={cn(
                    'mr-1.5 rounded px-1.5 py-0.5 text-xs font-medium',
                    event.kind === 'exam'
                      ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200'
                      : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
                  )}
                >
                  {event.kind === 'exam' ? t('deadlines.exam') : t('deadlines.withdrawal')}
                </span>
                {event.moduleName}
              </span>
              <span className="shrink-0 text-right text-xs text-zinc-600 tabular-nums dark:text-zinc-400">
                <span className="block">{formatLongDate(event.date)}</span>
                <span className="block">{formatRelativeDays(daysBetween(today, event.date))}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {withdrawalDays === undefined ? t('deadlines.empty') : t('deadlines.emptyWithWithdrawal')}
        </p>
      )}
      {withdrawalDays !== undefined ? (
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          {t('deadlines.withdrawalRule', { count: withdrawalDays })}
        </p>
      ) : null}
    </section>
  )
}

function RequirementCard({ plan, requirement }: { plan: Plan; requirement: CreditRequirement }) {
  const { t } = useTranslation('board')
  const headingId = useId()
  const label = plan.preset.creditLabel
  const credits = (value: number) => `${formatCredits(value)} ${label}`
  const semester = (index: number) => ({
    number: index + 1,
    term: formatTerm(addTerms(plan.startTerm, index), currentLocale()),
  })
  const names = new Map(plan.modules.map((module) => [module.code, module.name]))
  const { eligibleFromIndex, plannedIndex } = requirement
  const percent = Math.min(100, Math.round((requirement.earnedCredits / requirement.requiredCredits) * 100))

  let forecast: string
  if (requirement.eligibleNow) forecast = t('requirement.eligibleNow')
  else if (eligibleFromIndex === null) {
    forecast = t('requirement.notEnough', { credits: credits(requirement.requiredCredits) })
  } else if (eligibleFromIndex >= plan.semesters.length) {
    forecast = t('requirement.afterLastSemester', { credits: credits(requirement.requiredCredits) })
  } else {
    forecast = t('requirement.atStartOf', {
      credits: credits(requirement.requiredCredits),
      ...semester(eligibleFromIndex),
    })
  }
  const tooEarly =
    !requirement.eligibleNow &&
    plannedIndex !== null &&
    (eligibleFromIndex === null || plannedIndex < eligibleFromIndex)

  return (
    <section aria-labelledby={headingId} className={cardClass}>
      <h2 id={headingId} className={headingClass}>
        <GraduationCap aria-hidden className={headingIconClass} />
        {t('requirement.title', { name: requirement.name })}
      </h2>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        {t('requirement.progress', {
          earned: formatCredits(requirement.earnedCredits),
          required: credits(requirement.requiredCredits),
        })}
      </p>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="progressbar"
        aria-label={t('requirement.progressLabel', { name: requirement.name })}
        aria-valuemin={0}
        aria-valuemax={requirement.requiredCredits}
        aria-valuenow={requirement.earnedCredits}
      >
        <div
          className="h-full rounded-full bg-linear-to-r from-indigo-600 to-sky-500 dark:from-indigo-400 dark:to-sky-400"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-sm" data-testid="requirement-forecast">
        {forecast}
      </p>
      {tooEarly && plannedIndex !== null ? (
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
          {t('requirement.plannedIn', semester(plannedIndex))}
        </p>
      ) : null}
      {requirement.openPrerequisites.length > 0 ? (
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          {t('requirement.alsoNeeded', {
            list: requirement.openPrerequisites
              .map((item) =>
                prerequisiteCodes(item)
                  .map((code) => names.get(code) ?? code)
                  .join(t('requirement.or')),
              )
              .join(', '),
          })}
        </p>
      ) : null}
    </section>
  )
}

export interface PlanInsightsProps {
  plan: Plan
  hints: readonly IssueText[]
  whatIf: WhatIfAnalysis
  /** Modules with a credit requirement that are not passed yet, usually the thesis. */
  requirements: readonly CreditRequirement[]
  today: string
  upcoming: readonly DeadlineEvent[]
  canExportCalendar: boolean
  onTargetChange: (grade: number | null) => void
  onExportCalendar: () => void
}

export function PlanInsights({
  plan,
  hints,
  whatIf,
  requirements,
  today,
  upcoming,
  canExportCalendar,
  onTargetChange,
  onExportCalendar,
}: PlanInsightsProps) {
  return (
    <div
      className={cn(
        'grid gap-3',
        requirements.length > 0 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3',
      )}
    >
      <HintsCard hints={hints} />
      <WhatIfCard plan={plan} analysis={whatIf} onTargetChange={onTargetChange} />
      <DeadlinesCard
        plan={plan}
        today={today}
        upcoming={upcoming}
        canExport={canExportCalendar}
        onExport={onExportCalendar}
      />
      {requirements.map((requirement) => (
        <RequirementCard key={requirement.code} plan={plan} requirement={requirement} />
      ))}
    </div>
  )
}
