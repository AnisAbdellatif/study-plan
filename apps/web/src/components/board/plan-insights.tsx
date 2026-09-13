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
import { CalendarPlus, GraduationCap, Info, TriangleAlert } from 'lucide-react'
import { useId } from 'react'
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

const cardClass = 'rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'
const headingClass = 'text-sm text-zinc-600 dark:text-zinc-400'

function HintsCard({ hints }: { hints: readonly IssueText[] }) {
  const headingId = useId()
  const warnings = hints.filter((hint) => hint.severity === 'warning').length
  return (
    <section aria-labelledby={headingId} className={cardClass}>
      <h2 id={headingId} className={headingClass}>
        Hinweise zum Plan
      </h2>
      <p className="mt-1 text-lg font-semibold">
        {warnings === 0 ? 'Keine Warnungen' : warnings === 1 ? '1 Warnung' : `${warnings} Warnungen`}
      </p>
      {hints.length > 0 ? (
        <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto text-sm">
          {hints.map((hint) => (
            <li
              key={hint.text}
              className={cn(
                'flex items-start gap-1.5',
                hint.severity === 'warning'
                  ? 'text-amber-800 dark:text-amber-300'
                  : 'text-zinc-600 dark:text-zinc-400',
              )}
            >
              {hint.severity === 'warning' ? (
                <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              ) : (
                <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              )}
              <span>{hint.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Semester, Voraussetzungen und Bereiche passen.
        </p>
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
  const headingId = useId()
  const selectId = useId()
  const steps = (plan.rules.standardGrades ?? plan.rules.allowedValues)
    .filter((grade) => grade <= plan.rules.passThreshold)
    .sort((a, b) => a - b)
  const bestStep = steps[0]
  const worstStep = steps.at(-1)
  const show = (value: string | null) => (value === null ? '–' : formatGradeString(value))
  const { target } = analysis

  let targetText = 'Wähle einen Zielschnitt, um zu sehen, welche Noten du dafür brauchst.'
  if (target) {
    const goal = formatGrade(target.grade)
    if (analysis.openCredits === 0) {
      targetText = target.reachable
        ? `Dein aktueller Schnitt erreicht ${goal}.`
        : `Ohne weitere eingeplante benotete Module bleibt ${goal} außer Reichweite.`
    } else if (!target.reachable || target.requiredGrade === null) {
      targetText = `${goal} ist mit den eingeplanten Modulen nicht mehr erreichbar.`
    } else if (target.requiredGrade === worstStep) {
      targetText = `${goal} erreichst du sogar mit ${formatGrade(target.requiredGrade)} in allen offenen Modulen.`
    } else {
      targetText = `Für ${goal} brauchst du in den offenen Modulen im Schnitt ${formatGrade(target.requiredGrade)} oder besser.`
    }
  }

  return (
    <section aria-labelledby={headingId} className={cardClass}>
      <h2 id={headingId} className={headingClass}>
        Was wäre, wenn
      </h2>
      <div className="mt-1 flex items-center gap-2">
        <label htmlFor={selectId} className="text-sm font-medium">
          Zielschnitt
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
          ? 'Keine offenen benoteten Module eingeplant.'
          : `Offen: ${formatCredits(analysis.openCredits)} ${plan.preset.creditLabel}. Mit ${formatGrade(bestStep)} überall: ${show(analysis.bestCase)}, mit ${formatGrade(worstStep)} überall: ${show(analysis.worstCase)}. Annahme: dieselbe Note in allen offenen, eingeplanten Modulen.`}
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
  const headingId = useId()
  const withdrawalDays = plan.preset.withdrawalDaysBeforeExam
  return (
    <section aria-labelledby={headingId} className={cardClass}>
      <div className="flex items-start justify-between gap-2">
        <h2 id={headingId} className={headingClass}>
          Nächste Termine
        </h2>
        <Button size="sm" variant="ghost" onClick={onExport} disabled={!canExport} className="-mt-1 -mr-1">
          <CalendarPlus aria-hidden className="size-4" />
          Kalender (.ics)
        </Button>
      </div>
      {upcoming.length > 0 ? (
        <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto text-sm">
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
                  {event.kind === 'exam' ? 'Prüfung' : 'Abmeldeschluss'}
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
          Trag im Notendialog einen Prüfungstermin ein, dann erscheinen hier Prüfungen
          {withdrawalDays === undefined ? '' : ' und Abmeldefristen'} der nächsten Wochen.
        </p>
      )}
      {withdrawalDays !== undefined ? (
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          Abmeldung bis {withdrawalDays} Tage vor der Prüfung laut Prüfungsordnung. Prüfe die Frist für
          mündliche Prüfungen und Sonderformen.
        </p>
      ) : null}
    </section>
  )
}

function RequirementCard({ plan, requirement }: { plan: Plan; requirement: CreditRequirement }) {
  const headingId = useId()
  const label = plan.preset.creditLabel
  const credits = (value: number) => `${formatCredits(value)} ${label}`
  const semester = (index: number) =>
    `${index + 1}. Semesters (${formatTerm(addTerms(plan.startTerm, index))})`
  const names = new Map(plan.modules.map((module) => [module.code, module.name]))
  const { eligibleFromIndex, plannedIndex } = requirement
  const percent = Math.min(100, Math.round((requirement.earnedCredits / requirement.requiredCredits) * 100))

  let forecast: string
  if (requirement.eligibleNow) forecast = 'Die Leistungspunkte für die Zulassung hast du schon.'
  else if (eligibleFromIndex === null) {
    forecast = `Mit den eingeplanten Modulen kommst du nicht auf ${credits(requirement.requiredCredits)}.`
  } else if (eligibleFromIndex >= plan.semesters.length) {
    forecast = `Laut Plan erreichst du ${credits(requirement.requiredCredits)} erst nach dem letzten Semester.`
  } else {
    forecast = `Laut Plan erreichst du ${credits(requirement.requiredCredits)} zu Beginn des ${semester(eligibleFromIndex)}.`
  }
  const tooEarly =
    !requirement.eligibleNow &&
    plannedIndex !== null &&
    (eligibleFromIndex === null || plannedIndex < eligibleFromIndex)

  return (
    <section aria-labelledby={headingId} className={cardClass}>
      <h2 id={headingId} className={cn(headingClass, 'flex items-center gap-1.5')}>
        <GraduationCap aria-hidden className="size-4" />
        Zulassung: {requirement.name}
      </h2>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        {formatCredits(requirement.earnedCredits)} von {credits(requirement.requiredCredits)}
      </p>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
        role="progressbar"
        aria-label={`Leistungspunkte für die Zulassung: ${requirement.name}`}
        aria-valuemin={0}
        aria-valuemax={requirement.requiredCredits}
        aria-valuenow={requirement.earnedCredits}
      >
        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-sm" data-testid="requirement-forecast">
        {forecast}
      </p>
      {tooEarly && plannedIndex !== null ? (
        <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
          Eingeplant ist sie im {semester(plannedIndex).replace('Semesters', 'Semester')}.
        </p>
      ) : null}
      {requirement.openPrerequisites.length > 0 ? (
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Außerdem nötig:{' '}
          {requirement.openPrerequisites
            .map((item) =>
              prerequisiteCodes(item)
                .map((code) => names.get(code) ?? code)
                .join(' oder '),
            )
            .join(', ')}
          .
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
