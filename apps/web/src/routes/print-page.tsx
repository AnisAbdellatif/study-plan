import {
  addTerms,
  choiceOptionCodes,
  currentResult,
  formatTerm,
  isPlaceholderId,
  type Plan,
  type PlanModule,
  placeholderCredits,
  summarizePlan,
} from '@study-plan/shared'
import { Link, Navigate } from '@tanstack/react-router'
import { ArrowLeft, Printer } from 'lucide-react'
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button.tsx'
import { currentIntlLocale, currentLocale } from '../i18n/index.ts'
import { areaTone, moduleTone } from '../lib/area-colors.ts'
import { cn } from '../lib/cn.ts'
import { DEGREE_LABEL, formatCredits, formatGrade, formatGradeString } from '../lib/format.ts'
import { useGuestState } from '../store/guest-store.ts'

/**
 * A4 portrait with room for the browser's page numbers. @page cannot be scoped to an element, so it is only in the
 * document while this page is open; the board keeps its own landscape overview for Ctrl+P.
 */
const PAGE_STYLE = '@media print { @page { size: A4 portrait; margin: 12mm 12mm 14mm; } }'

// The sheet is paper in every theme. It uses the neutral greys, which the dark theme does not retune (see styles.css).
const thClass = 'pb-1 text-[7.5pt] font-semibold tracking-wide text-neutral-500 uppercase'
const tdClass = 'border-t border-neutral-200 py-1.5 align-top'
const sectionHeadingClass = 'text-[11pt] font-semibold text-neutral-900'

type Row =
  | { kind: 'module'; module: PlanModule }
  | { kind: 'placeholder'; id: string; areaId: string; credits: number }

function usePrintModel(plan: Plan) {
  return useMemo(() => {
    const summary = summarizePlan(plan)
    const byCode = new Map(plan.modules.map((module) => [module.code, module]))
    const estimates = placeholderCredits(plan)
    const placeholders = new Map(
      (plan.placeholders ?? []).map((placeholder) => [placeholder.id, placeholder]),
    )
    const semesters = plan.semesters.map((semester, index) => ({
      semester,
      index,
      info: summary.semesters[index],
      rows: semester.moduleCodes.flatMap((code): Row[] => {
        if (isPlaceholderId(code)) {
          const placeholder = placeholders.get(code)
          return placeholder
            ? [
                {
                  kind: 'placeholder',
                  id: code,
                  areaId: placeholder.areaId,
                  credits: estimates.get(code) ?? 0,
                },
              ]
            : []
        }
        const module = byCode.get(code)
        return module ? [{ kind: 'module', module }] : []
      }),
    }))
    // Same as the board's backlog count: options of choice areas are not open work.
    const optionCodes = new Set([...choiceOptionCodes(plan).values()].flat())
    const unplanned = plan.backlog.flatMap((code) => {
      const module = byCode.get(code)
      return module && !optionCodes.has(code) ? [module] : []
    })
    return { summary, semesters, unplanned }
  }, [plan])
}

function Stat({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
      <p className="text-[7.5pt] font-semibold tracking-wide text-neutral-600 uppercase">{label}</p>
      <p className="mt-0.5 text-[14pt] leading-tight font-semibold tabular-nums">{value}</p>
      {children ? <div className="mt-1 text-[8pt] text-neutral-600">{children}</div> : null}
    </div>
  )
}

function ResultText({
  module,
  showGrades,
  passThreshold,
}: {
  module: PlanModule
  showGrades: boolean
  passThreshold: number
}) {
  const { t } = useTranslation('print')
  const result = currentResult(module)
  const passed = result.kind === 'passed' || (result.kind === 'graded' && result.grade <= passThreshold)
  const failed = result.kind === 'failed' || (result.kind === 'graded' && result.grade > passThreshold)
  const registered = result.kind === 'open' && module.attempts.at(-1)?.result === 'registered'
  const text =
    result.kind === 'graded' && showGrades
      ? formatGrade(result.grade)
      : passed
        ? t('results.passed')
        : failed
          ? t('results.failed')
          : registered
            ? t('results.registered')
            : '–'
  return (
    <span
      className={cn(
        'tabular-nums',
        passed ? 'font-semibold text-emerald-800' : failed ? 'text-red-700' : 'text-neutral-500',
      )}
    >
      {text}
      {module.recognition?.status === 'approved' ? (
        <span className="block text-[7pt] font-normal text-neutral-500">{t('results.recognised')}</span>
      ) : null}
    </span>
  )
}

/**
 * The area is the coloured dot, matched by the areas table at the top; a column for long area names would make
 * every row wrap. Screen readers get the name instead.
 */
function AreaDot({ className, name }: { className: string; name: string }) {
  return (
    <>
      <span aria-hidden className={cn('mt-[0.3rem] size-2 shrink-0 rounded-full', className)} />
      <span className="sr-only">{name}: </span>
    </>
  )
}

function ModuleRow({ plan, module, showGrades }: { plan: Plan; module: PlanModule; showGrades: boolean }) {
  const { t } = useTranslation('print')
  const area = plan.areas.find((candidate) => candidate.moduleCodes.includes(module.code))
  return (
    <tr className="break-inside-avoid">
      <td className={cn(tdClass, 'w-[4.75rem] pr-2 font-mono text-[7.5pt] text-neutral-600')}>
        {module.code}
      </td>
      <td className={cn(tdClass, 'pr-3')}>
        <span className="flex items-start gap-2">
          <AreaDot className={moduleTone(plan, module.code).dot} name={area?.name ?? t('noArea')} />
          <span>
            <span className="font-medium">{module.name}</span>
            {module.custom ? (
              <span className="ml-1 text-[7.5pt] text-neutral-500">({t('custom')})</span>
            ) : null}
          </span>
        </span>
      </td>
      <td className={cn(tdClass, 'w-[3.5rem] pr-3 text-right tabular-nums')}>
        {formatCredits(module.credits)}
      </td>
      <td className={cn(tdClass, 'w-[5.5rem] text-right')}>
        <ResultText module={module} showGrades={showGrades} passThreshold={plan.rules.passThreshold} />
      </td>
    </tr>
  )
}

function PlaceholderRow({ plan, areaId, credits }: { plan: Plan; areaId: string; credits: number }) {
  const { t } = useTranslation('print')
  const area = plan.areas.find((candidate) => candidate.id === areaId)
  return (
    <tr className="break-inside-avoid">
      <td className={cn(tdClass, 'pr-2 text-[7.5pt] text-neutral-400')}>–</td>
      <td className={cn(tdClass, 'pr-3 text-neutral-700')}>
        <span className="flex items-start gap-2">
          <AreaDot className={areaTone(plan, areaId).dot} name={area?.name ?? areaId} />
          <span>
            <span className="italic">{t('placeholder')}</span>
            <span className="ml-1 text-[7.5pt] text-neutral-500">({area?.name ?? areaId})</span>
          </span>
        </span>
      </td>
      <td className={cn(tdClass, 'pr-3 text-right text-neutral-700 tabular-nums')}>
        ≈{formatCredits(credits)}
      </td>
      <td className={cn(tdClass, 'text-right text-neutral-500')}>–</td>
    </tr>
  )
}

function ModuleTable({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useTranslation('print')
  return (
    <table className="w-full border-collapse text-[9pt]">
      {/* Read out, not shown: the columns speak for themselves on paper. */}
      <thead className="sr-only">
        <tr>
          <th scope="col">{t('columns.code')}</th>
          <th scope="col">{t('columns.module')}</th>
          <th scope="col">{label}</th>
          <th scope="col">{t('columns.result')}</th>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}

/** The whole plan as a printable A4 document. The board's menu leads here. */
export function PrintPage() {
  const { plan } = useGuestState()
  if (!plan) return <Navigate to="/" replace />
  return <PrintView plan={plan} />
}

function PrintView({ plan }: { plan: Plan }) {
  const { t } = useTranslation(['print', 'board', 'common'])
  const locale = currentLocale()
  const gradesId = useId()
  const [showGrades, setShowGrades] = useState(true)
  const { summary, semesters, unplanned } = usePrintModel(plan)
  const label = plan.preset.creditLabel
  const { credits, overall } = summary
  const today = new Intl.DateTimeFormat(currentIntlLocale(), { dateStyle: 'long' }).format(new Date())
  const percent = (value: number) =>
    `${Math.min(100, credits.required > 0 ? (value / credits.required) * 100 : 0)}%`

  // Browsers suggest the title as the PDF file name.
  useEffect(() => {
    const previous = document.title
    document.title = t('documentTitle', { name: plan.name })
    return () => {
      document.title = previous
    }
  }, [plan.name, t])

  return (
    <main className="px-4 pt-4 pb-12 sm:pt-6 print:p-0">
      <style>{PAGE_STYLE}</style>

      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to="/"
          className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t('back')}
        </Link>
        <div className="flex flex-wrap items-center gap-4">
          <label htmlFor={gradesId} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              id={gradesId}
              type="checkbox"
              className="size-4 accent-indigo-600"
              checked={showGrades}
              onChange={(event) => setShowGrades(event.target.checked)}
            />
            {t('showGrades')}
          </label>
          <Button variant="primary" onClick={() => window.print()}>
            <Printer aria-hidden className="size-4" />
            {t('print')}
          </Button>
        </div>
      </div>
      <p className="mx-auto mt-2 max-w-[210mm] text-xs text-zinc-600 print:hidden dark:text-zinc-400">
        {t('tip')}
      </p>

      <article
        aria-label={t('eyebrow')}
        className="mx-auto mt-4 max-w-[210mm] bg-white p-5 text-[10pt] leading-snug text-neutral-900 shadow-xl ring-1 ring-neutral-200 sm:p-[14mm] print:mt-0 print:max-w-none print:p-0! print:shadow-none print:ring-0"
      >
        <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-b-2 border-neutral-900 pb-4">
          <div className="min-w-0 flex-1 basis-80">
            <p className="text-[8pt] font-semibold tracking-[0.14em] text-indigo-700 uppercase">
              {t('eyebrow')}
            </p>
            <h1 className="mt-1 text-[19pt] leading-tight font-semibold text-balance">{plan.name}</h1>
            <p className="mt-1 text-[10pt] text-neutral-700">
              {DEGREE_LABEL[plan.preset.degree]} {plan.preset.programmeName} · {plan.preset.universityName}
            </p>
            <p className="mt-0.5 text-[8.5pt] text-neutral-600">{plan.preset.poVersion}</p>
          </div>
          <div className="shrink-0 text-[8.5pt]">
            <p className="flex items-center gap-1.5 font-brand text-[11pt] font-semibold sm:justify-end">
              <img src="/logo.svg" alt="" aria-hidden className="size-5" />
              {t('common:brand')}
            </p>
            <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
              <dt className="text-neutral-500">{t('startTerm')}</dt>
              <dd className="font-medium">{formatTerm(plan.startTerm, locale)}</dd>
              <dt className="text-neutral-500">{t('standardSemesters')}</dt>
              <dd className="font-medium">{t('semesterCount', { count: plan.preset.standardSemesters })}</dd>
              <dt className="text-neutral-500">{t('date')}</dt>
              <dd className="font-medium">{today}</dd>
            </dl>
          </div>
        </header>

        <section aria-label={t('summaryLabel')} className="mt-5 grid break-inside-avoid gap-3 sm:grid-cols-3">
          {showGrades ? (
            <Stat
              label={t('average')}
              value={overall.value !== null ? formatGradeString(overall.value) : '–'}
            >
              {overall.value !== null
                ? t('averageDetail', { credits: formatCredits(overall.countedCredits), label })
                : t('noAverage')}
            </Stat>
          ) : (
            <Stat label={t('semesters')} value={String(plan.semesters.length)}>
              {t('standardDetail', { count: plan.preset.standardSemesters })}
            </Stat>
          )}
          <Stat
            label={t('earned')}
            value={`${formatCredits(credits.earned)} / ${formatCredits(credits.required)} ${label}`}
          >
            <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-200">
              <div
                className="absolute inset-y-0 left-0 bg-indigo-200"
                style={{ width: percent(credits.planned) }}
              />
              <div
                className="absolute inset-y-0 left-0 bg-indigo-600"
                style={{ width: percent(credits.earned) }}
              />
            </div>
          </Stat>
          <Stat label={t('planned')} value={`${formatCredits(credits.planned)} ${label}`}>
            {unplanned.length > 0 ? t('unplannedCount', { count: unplanned.length }) : t('allPlanned')}
          </Stat>
        </section>

        {summary.areas.length > 0 ? (
          <section className="mt-6 break-inside-avoid">
            <h2 className={sectionHeadingClass}>{t('areas')}</h2>
            <table className="mt-2 w-full border-collapse text-[9pt]">
              <thead>
                <tr>
                  <th scope="col" className={cn(thClass, 'text-left')}>
                    {t('area')}
                  </th>
                  <th scope="col" className={cn(thClass, 'w-[5rem] text-right')}>
                    {t('earnedShort')}
                  </th>
                  <th scope="col" className={cn(thClass, 'w-[5rem] text-right')}>
                    {t('plannedShort')}
                  </th>
                  <th scope="col" className={cn(thClass, 'w-[5.5rem] text-right')}>
                    {t('target')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {summary.areas.map((area) => {
                  const planned = area.plannedCredits + area.placeholderCredits
                  const target =
                    area.maxCredits !== undefined && area.maxCredits !== area.minCredits
                      ? `${formatCredits(area.minCredits)}–${formatCredits(area.maxCredits)}`
                      : formatCredits(area.minCredits)
                  return (
                    <tr key={area.id} className="break-inside-avoid">
                      <td className={cn(tdClass, 'pr-3')}>
                        <span className="inline-flex items-start gap-1.5">
                          <span
                            aria-hidden
                            className={cn('mt-1 size-2 shrink-0 rounded-full', areaTone(plan, area.id).dot)}
                          />
                          {area.name}
                        </span>
                      </td>
                      <td className={cn(tdClass, 'text-right font-semibold tabular-nums')}>
                        {formatCredits(area.earnedCredits)}
                      </td>
                      <td className={cn(tdClass, 'text-right tabular-nums')}>
                        {area.placeholderCredits > 0 ? '≈' : ''}
                        {formatCredits(planned)}
                      </td>
                      <td className={cn(tdClass, 'text-right text-neutral-600 tabular-nums')}>
                        {target} {label}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        ) : null}

        <section className="mt-6">
          <h2 className={sectionHeadingClass}>{t('semesterPlan')}</h2>
          <div className="mt-2 space-y-4">
            {semesters.map(({ semester, index, info, rows }) => {
              const semesterCredits = formatCredits(info?.credits ?? 0)
              const estimate = info?.placeholderCredits ?? 0
              return (
                <section
                  key={semester.id}
                  aria-labelledby={`print-${semester.id}`}
                  className="break-inside-avoid"
                >
                  <div className="flex items-baseline justify-between gap-3 border-b border-neutral-800 pb-1">
                    <h3 id={`print-${semester.id}`} className="text-[10.5pt] font-semibold">
                      {t('semester', { number: index + 1 })}
                      <span className="font-normal text-neutral-600">
                        {' · '}
                        {formatTerm(addTerms(plan.startTerm, index), locale)}
                      </span>
                      {semester.kind && semester.kind !== 'regular' ? (
                        <span className="ml-2 rounded bg-neutral-100 px-1.5 py-px align-middle text-[7.5pt] font-medium text-neutral-700">
                          {t(`board:columns.kinds.${semester.kind}`)}
                        </span>
                      ) : null}
                    </h3>
                    <span className="shrink-0 text-[9pt] font-semibold tabular-nums">
                      {estimate > 0
                        ? t('board:columns.creditsWithEstimate', {
                            credits: semesterCredits,
                            estimate: formatCredits(estimate),
                            label,
                          })
                        : t('board:overview.credits', { credits: semesterCredits, label })}
                    </span>
                  </div>
                  {rows.length === 0 ? (
                    <p className="py-2 text-[9pt] text-neutral-500">{t('emptySemester')}</p>
                  ) : (
                    <ModuleTable label={label}>
                      {rows.map((row) =>
                        row.kind === 'module' ? (
                          <ModuleRow
                            key={row.module.code}
                            plan={plan}
                            module={row.module}
                            showGrades={showGrades}
                          />
                        ) : (
                          <PlaceholderRow
                            key={row.id}
                            plan={plan}
                            areaId={row.areaId}
                            credits={row.credits}
                          />
                        ),
                      )}
                    </ModuleTable>
                  )}
                </section>
              )
            })}
          </div>
        </section>

        {unplanned.length > 0 ? (
          <section className="mt-6">
            <div className="border-b border-neutral-800 pb-1">
              <h2 className={sectionHeadingClass}>{t('unplanned')}</h2>
            </div>
            <ModuleTable label={label}>
              {unplanned.map((module) => (
                <ModuleRow key={module.code} plan={plan} module={module} showGrades={showGrades} />
              ))}
            </ModuleTable>
          </section>
        ) : null}

        <footer className="mt-8 flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-neutral-300 pt-2 text-[7.5pt] text-neutral-500">
          <span>{t('disclaimer')}</span>
          <span>{window.location.host}</span>
        </footer>
      </article>
    </main>
  )
}
