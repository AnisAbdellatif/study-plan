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
import { Link, Navigate, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeft, Printer, RectangleHorizontal, RectangleVertical } from 'lucide-react'
import { type CSSProperties, type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button.tsx'
import { currentIntlLocale, currentLocale } from '../i18n/index.ts'
import { areaTone, moduleTone } from '../lib/area-colors.ts'
import { cn } from '../lib/cn.ts'
import { DEGREE_LABEL, formatCredits, formatGrade, formatGradeString } from '../lib/format.ts'
import { useGuestState } from '../store/guest-store.ts'
import { PRINT_ORIENTATIONS, type PrintOrientation } from './print-options.ts'

/**
 * @page cannot be scoped to an element, so the rule is only in the document while this page is open; the board keeps
 * its own landscape overview for Ctrl+P. Portrait leaves room for the browser's page numbers; landscape aims to fit
 * a whole plan on one sheet.
 */
const PAGE_STYLES: Record<PrintOrientation, string> = {
  portrait: '@media print { @page { size: A4 portrait; margin: 12mm 12mm 14mm; } }',
  landscape: '@media print { @page { size: A4 landscape; margin: 9mm 10mm 10mm; } }',
}
const SHEET_WIDTH: Record<PrintOrientation, string> = {
  portrait: 'max-w-[210mm]',
  landscape: 'max-w-[297mm]',
}
/** Landscape shows the semesters side by side; more than this many wrap into a second row. */
const MAX_LANDSCAPE_COLUMNS = 8

// The sheet is paper in every theme. It uses the neutral greys, which the dark theme does not retune (see styles.css).
const thClass = 'pb-1 text-[7.5pt] font-semibold tracking-wide text-neutral-500 uppercase'
const tdClass = 'border-t border-neutral-200 py-1.5 align-top'
const sectionHeadingClass = 'text-[11pt] font-semibold text-neutral-900'
const smallHeadingClass = 'text-[7pt] font-semibold tracking-wide text-neutral-600 uppercase'

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

type PrintModel = ReturnType<typeof usePrintModel>

interface SheetProps {
  plan: Plan
  model: PrintModel
  showGrades: boolean
  today: string
}

const areaOf = (plan: Plan, code: string) => plan.areas.find((area) => area.moduleCodes.includes(code))

/** "30 LP", or "24 LP (+≈6)" with open electives. */
function SemesterCredits({ info, label }: { info: PrintModel['semesters'][number]['info']; label: string }) {
  const { t } = useTranslation('board')
  const credits = formatCredits(info?.credits ?? 0)
  const estimate = info?.placeholderCredits ?? 0
  return estimate > 0
    ? t('columns.creditsWithEstimate', { credits, estimate: formatCredits(estimate), label })
    : t('overview.credits', { credits, label })
}

function Stat({
  label,
  value,
  compact,
  children,
}: {
  label: string
  value: string
  compact: boolean
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-neutral-200 bg-neutral-50',
        compact ? 'px-2.5 py-1' : 'px-3 py-2.5',
      )}
    >
      <p
        className={cn(
          'font-semibold tracking-wide text-neutral-600 uppercase',
          compact ? 'text-[6.5pt]' : 'text-[7.5pt]',
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          'mt-0.5 leading-tight font-semibold tabular-nums',
          compact ? 'text-[10pt]' : 'text-[14pt]',
        )}
      >
        {value}
      </p>
      {children ? (
        <div className={cn('mt-1 text-neutral-600', compact ? 'text-[6.5pt]' : 'text-[8pt]')}>{children}</div>
      ) : null}
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
 * The area is the coloured dot, matched by the areas list; a column for long area names would make every row wrap.
 * Screen readers get the name instead.
 */
function AreaDot({ className, name }: { className: string; name: string }) {
  return (
    <>
      <span aria-hidden className={cn('mt-[0.3rem] size-2 shrink-0 rounded-full', className)} />
      <span className="sr-only">{name}: </span>
    </>
  )
}

function SheetHeader({
  plan,
  today,
  orientation,
}: {
  plan: Plan
  today: string
  orientation: PrintOrientation
}) {
  const { t } = useTranslation(['print', 'common'])
  const locale = currentLocale()
  const facts = (
    <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
      <dt className="text-neutral-500">{t('startTerm')}</dt>
      <dd className="font-medium">{formatTerm(plan.startTerm, locale)}</dd>
      <dt className="text-neutral-500">{t('standardSemesters')}</dt>
      <dd className="font-medium">{t('semesterCount', { count: plan.preset.standardSemesters })}</dd>
      <dt className="text-neutral-500">{t('date')}</dt>
      <dd className="font-medium">{today}</dd>
    </dl>
  )
  const brand = (
    <p className="flex items-center gap-1.5 font-brand text-[11pt] font-semibold">
      <img src="/logo.svg" alt="" aria-hidden className="size-5" />
      {t('common:brand')}
    </p>
  )

  if (orientation === 'landscape') {
    return (
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b-2 border-neutral-900 pb-2">
        <div className="min-w-0 flex-1 basis-96">
          <p className="text-[7pt] font-semibold tracking-[0.14em] text-indigo-700 uppercase">
            {t('eyebrow')}
          </p>
          <h1 className="text-[15pt] leading-tight font-semibold">{plan.name}</h1>
          <p className="text-[8.5pt] text-neutral-700">
            {DEGREE_LABEL[plan.preset.degree]} {plan.preset.programmeName} · {plan.preset.universityName}
          </p>
          <p className="line-clamp-2 text-[7pt] text-neutral-600">{plan.preset.poVersion}</p>
        </div>
        <div className="flex shrink-0 items-end gap-6 text-[7.5pt]">
          {facts}
          {brand}
        </div>
      </header>
    )
  }

  return (
    <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-b-2 border-neutral-900 pb-4">
      <div className="min-w-0 flex-1 basis-80">
        <p className="text-[8pt] font-semibold tracking-[0.14em] text-indigo-700 uppercase">{t('eyebrow')}</p>
        <h1 className="mt-1 text-[19pt] leading-tight font-semibold text-balance">{plan.name}</h1>
        <p className="mt-1 text-[10pt] text-neutral-700">
          {DEGREE_LABEL[plan.preset.degree]} {plan.preset.programmeName} · {plan.preset.universityName}
        </p>
        <p className="mt-0.5 text-[8.5pt] text-neutral-600">{plan.preset.poVersion}</p>
      </div>
      <div className="shrink-0 space-y-2 text-[8.5pt]">
        {brand}
        {facts}
      </div>
    </header>
  )
}

function SummaryStats({
  plan,
  model,
  showGrades,
  compact,
}: Omit<SheetProps, 'today'> & { compact: boolean }) {
  const { t } = useTranslation('print')
  const label = plan.preset.creditLabel
  const { credits, overall } = model.summary
  const percent = (value: number) =>
    `${Math.min(100, credits.required > 0 ? (value / credits.required) * 100 : 0)}%`
  return (
    <>
      {showGrades ? (
        <Stat
          compact={compact}
          label={t('average')}
          value={overall.value !== null ? formatGradeString(overall.value) : '–'}
        >
          {overall.value !== null
            ? t('averageDetail', { credits: formatCredits(overall.countedCredits), label })
            : t('noAverage')}
        </Stat>
      ) : (
        <Stat compact={compact} label={t('semesters')} value={String(plan.semesters.length)}>
          {t('standardDetail', { count: plan.preset.standardSemesters })}
        </Stat>
      )}
      <Stat
        compact={compact}
        label={t('earned')}
        value={`${formatCredits(credits.earned)} / ${formatCredits(credits.required)} ${label}`}
      >
        <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200">
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
      <Stat compact={compact} label={t('planned')} value={`${formatCredits(credits.planned)} ${label}`}>
        {model.unplanned.length > 0
          ? t('unplannedCount', { count: model.unplanned.length })
          : t('allPlanned')}
      </Stat>
    </>
  )
}

const areaTarget = (area: PrintModel['summary']['areas'][number]) =>
  area.maxCredits !== undefined && area.maxCredits !== area.minCredits
    ? `${formatCredits(area.minCredits)}–${formatCredits(area.maxCredits)}`
    : formatCredits(area.minCredits)

function SheetFooter({ className }: { className: string }) {
  const { t } = useTranslation('print')
  return (
    <footer
      className={cn(
        'flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-neutral-300 pt-2 text-[7.5pt] text-neutral-500',
        className,
      )}
    >
      <span>{t('disclaimer')}</span>
      <span>{window.location.host}</span>
    </footer>
  )
}

// Portrait: a document that reads top to bottom, one table per semester.

function ModuleRow({ plan, module, showGrades }: { plan: Plan; module: PlanModule; showGrades: boolean }) {
  const { t } = useTranslation('print')
  return (
    <tr className="break-inside-avoid">
      <td className={cn(tdClass, 'w-[4.75rem] pr-2 font-mono text-[7.5pt] text-neutral-600')}>
        {module.code}
      </td>
      <td className={cn(tdClass, 'pr-3')}>
        <span className="flex items-start gap-2">
          <AreaDot
            className={moduleTone(plan, module.code).dot}
            name={areaOf(plan, module.code)?.name ?? t('noArea')}
          />
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

function PortraitSheet({ plan, model, showGrades, today }: SheetProps) {
  const { t } = useTranslation(['print', 'board'])
  const locale = currentLocale()
  const label = plan.preset.creditLabel
  const { summary, semesters, unplanned } = model

  return (
    <>
      <SheetHeader plan={plan} today={today} orientation="portrait" />

      <section aria-label={t('summaryLabel')} className="mt-5 grid break-inside-avoid gap-3 sm:grid-cols-3">
        <SummaryStats plan={plan} model={model} showGrades={showGrades} compact={false} />
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
              {summary.areas.map((area) => (
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
                    {formatCredits(area.plannedCredits + area.placeholderCredits)}
                  </td>
                  <td className={cn(tdClass, 'text-right text-neutral-600 tabular-nums')}>
                    {areaTarget(area)} {label}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section className="mt-6">
        <h2 className={sectionHeadingClass}>{t('semesterPlan')}</h2>
        <div className="mt-2 space-y-4">
          {semesters.map(({ semester, index, info, rows }) => (
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
                  <SemesterCredits info={info} label={label} />
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
                      <PlaceholderRow key={row.id} plan={plan} areaId={row.areaId} credits={row.credits} />
                    ),
                  )}
                </ModuleTable>
              )}
            </section>
          ))}
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

      <SheetFooter className="mt-8" />
    </>
  )
}

// Landscape: an overview that fits a whole plan on one sheet, with the semesters side by side.

function ModuleCard({ plan, module, showGrades }: { plan: Plan; module: PlanModule; showGrades: boolean }) {
  const { t } = useTranslation('print')
  return (
    <li
      className={cn(
        'break-inside-avoid rounded-sm border border-l-[3px] border-neutral-200 bg-white px-1.5 py-0.5',
        moduleTone(plan, module.code).stripe,
      )}
    >
      <span className="sr-only">{areaOf(plan, module.code)?.name ?? t('noArea')}: </span>
      <p className="text-[7pt] leading-tight font-medium">
        {module.name}
        {module.custom ? <span className="font-normal text-neutral-500"> ({t('custom')})</span> : null}
      </p>
      <p className="flex items-baseline justify-between gap-1.5 text-[6.5pt] leading-tight text-neutral-600">
        <span>
          {module.code} · {formatCredits(module.credits)} {plan.preset.creditLabel}
        </span>
        <ResultText module={module} showGrades={showGrades} passThreshold={plan.rules.passThreshold} />
      </p>
    </li>
  )
}

function PlaceholderCard({ plan, areaId, credits }: { plan: Plan; areaId: string; credits: number }) {
  const { t } = useTranslation('print')
  const area = plan.areas.find((candidate) => candidate.id === areaId)
  return (
    <li
      className={cn(
        'break-inside-avoid rounded-sm border border-l-[3px] border-dashed border-neutral-300 bg-neutral-50 px-1.5 py-0.5',
        areaTone(plan, areaId).stripe,
      )}
    >
      <p className="text-[7pt] leading-tight text-neutral-700 italic">{t('placeholder')}</p>
      <p className="text-[6.5pt] leading-tight text-neutral-600">
        {area?.name ?? areaId} · ≈{formatCredits(credits)} {plan.preset.creditLabel}
      </p>
    </li>
  )
}

function LandscapeSheet({ plan, model, showGrades, today }: SheetProps) {
  const { t } = useTranslation(['print', 'board'])
  const locale = currentLocale()
  const label = plan.preset.creditLabel
  const { summary, semesters, unplanned } = model
  const areasId = useId()
  const unplannedId = useId()
  const columns = Math.min(Math.max(semesters.length, 1), MAX_LANDSCAPE_COLUMNS)

  return (
    <>
      <SheetHeader plan={plan} today={today} orientation="landscape" />

      <div className="mt-2 grid break-inside-avoid gap-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,2.6fr)]">
        <section aria-label={t('summaryLabel')} className="contents">
          <SummaryStats plan={plan} model={model} showGrades={showGrades} compact />
        </section>
        {summary.areas.length > 0 ? (
          <section aria-labelledby={areasId} className="rounded-lg border border-neutral-200 px-2.5 py-1.5">
            <h2 id={areasId} className={smallHeadingClass}>
              {t('areas')}{' '}
              <span className="font-normal tracking-normal normal-case">
                ({t('board:summary.areaLegend')})
              </span>
            </h2>
            <ul className="mt-1 grid gap-x-4 gap-y-0.5 text-[7pt] sm:grid-cols-2">
              {summary.areas.map((area) => (
                <li key={area.id} className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-start gap-1.5">
                    <span
                      aria-hidden
                      className={cn('mt-[0.25rem] size-2 shrink-0 rounded-full', areaTone(plan, area.id).dot)}
                    />
                    {area.name}
                  </span>
                  <span className="shrink-0 text-neutral-600 tabular-nums">
                    <span className="font-semibold text-neutral-900">
                      {formatCredits(area.earnedCredits)}
                    </span>
                    {' / '}
                    {area.placeholderCredits > 0 ? '≈' : ''}
                    {formatCredits(area.plannedCredits + area.placeholderCredits)} ({areaTarget(area)})
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <section aria-label={t('semesterPlan')} className="mt-2">
        <div
          style={{ '--print-columns': columns } as CSSProperties}
          className="grid gap-1.5 sm:grid-cols-[repeat(var(--print-columns),minmax(0,1fr))]"
        >
          {semesters.map(({ semester, index, info, rows }) => (
            <section
              key={semester.id}
              aria-labelledby={`print-${semester.id}`}
              className="flex break-inside-avoid flex-col rounded-md border border-neutral-300"
            >
              <div className="rounded-t-md border-b border-neutral-300 bg-neutral-100 px-2 py-0.5">
                <h3 id={`print-${semester.id}`} className="text-[8.5pt] leading-tight font-semibold">
                  {t('semester', { number: index + 1 })}
                </h3>
                <p className="flex flex-wrap items-baseline justify-between gap-x-1.5 text-[6.5pt] text-neutral-600">
                  <span>
                    {formatTerm(addTerms(plan.startTerm, index), locale)}
                    {semester.kind && semester.kind !== 'regular' ? (
                      <span className="ml-1 rounded bg-white px-1 font-medium text-neutral-700">
                        {t(`board:columns.kinds.${semester.kind}`)}
                      </span>
                    ) : null}
                  </span>
                  <span className="font-semibold text-neutral-900 tabular-nums">
                    <SemesterCredits info={info} label={label} />
                  </span>
                </p>
              </div>
              <ul className="flex flex-1 flex-col gap-0.5 p-1">
                {rows.length === 0 ? (
                  <li className="py-2 text-center text-[7pt] text-neutral-500">{t('emptySemester')}</li>
                ) : (
                  rows.map((row) =>
                    row.kind === 'module' ? (
                      <ModuleCard
                        key={row.module.code}
                        plan={plan}
                        module={row.module}
                        showGrades={showGrades}
                      />
                    ) : (
                      <PlaceholderCard key={row.id} plan={plan} areaId={row.areaId} credits={row.credits} />
                    ),
                  )
                )}
              </ul>
            </section>
          ))}
        </div>
      </section>

      {unplanned.length > 0 ? (
        <section
          aria-labelledby={unplannedId}
          className="mt-2 break-inside-avoid rounded-md border border-dashed border-neutral-300 px-2.5 py-1.5"
        >
          <h2 id={unplannedId} className={smallHeadingClass}>
            {t('unplanned')}
          </h2>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[7pt]">
            {unplanned.map((module) => (
              <li key={module.code} className="flex items-start gap-1.5">
                <AreaDot
                  className={moduleTone(plan, module.code).dot}
                  name={areaOf(plan, module.code)?.name ?? t('noArea')}
                />
                <span>
                  {module.name}{' '}
                  <span className="text-neutral-500">
                    ({module.code}, {formatCredits(module.credits)} {label})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <SheetFooter className="mt-2" />
    </>
  )
}

/** The whole plan as a printable A4 document. The board's menu leads here. */
export function PrintPage() {
  const { plan } = useGuestState()
  if (!plan) return <Navigate to="/" replace />
  return <PrintView plan={plan} />
}

function PrintView({ plan }: { plan: Plan }) {
  const { t } = useTranslation('print')
  const navigate = useNavigate()
  const search = useSearch({ from: '/print' })
  const orientation: PrintOrientation = search.orientation ?? 'portrait'
  const gradesId = useId()
  const orientationName = useId()
  const [showGrades, setShowGrades] = useState(true)
  const model = usePrintModel(plan)
  const today = new Intl.DateTimeFormat(currentIntlLocale(), { dateStyle: 'long' }).format(new Date())
  const width = SHEET_WIDTH[orientation]

  // Browsers suggest the title as the PDF file name.
  useEffect(() => {
    const previous = document.title
    document.title = t('documentTitle', { name: plan.name })
    return () => {
      document.title = previous
    }
  }, [plan.name, t])

  const selectOrientation = (next: PrintOrientation) =>
    void navigate({
      to: '/print',
      search: next === 'landscape' ? { orientation: 'landscape' } : {},
      replace: true,
    })

  return (
    <main className="px-4 pt-4 pb-12 sm:pt-6 print:p-0">
      <style>{PAGE_STYLES[orientation]}</style>

      <div className={cn('mx-auto flex flex-wrap items-center justify-between gap-3 print:hidden', width)}>
        <Link
          to="/"
          className="-ml-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t('back')}
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <fieldset>
            <legend className="sr-only">{t('orientation.label')}</legend>
            <div className="flex rounded-lg bg-zinc-200/70 p-1 ring-1 ring-zinc-200 ring-inset dark:bg-zinc-900 dark:ring-zinc-800">
              {PRINT_ORIENTATIONS.map((value) => {
                const Icon = value === 'portrait' ? RectangleVertical : RectangleHorizontal
                return (
                  <label
                    key={value}
                    className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm font-medium text-zinc-600 has-[:checked]:bg-white has-[:checked]:text-indigo-700 has-[:checked]:shadow-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-indigo-500 dark:text-zinc-400 dark:has-[:checked]:bg-zinc-800 dark:has-[:checked]:text-indigo-300"
                  >
                    <input
                      type="radio"
                      name={orientationName}
                      value={value}
                      checked={orientation === value}
                      onChange={() => selectOrientation(value)}
                      className="sr-only"
                    />
                    <Icon aria-hidden className="size-4" />
                    {t(`orientation.${value}`)}
                  </label>
                )
              })}
            </div>
          </fieldset>
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
      <p className={cn('mx-auto mt-2 text-xs text-zinc-600 print:hidden dark:text-zinc-400', width)}>
        {t('tip')}
      </p>

      <article
        aria-label={t('eyebrow')}
        data-orientation={orientation}
        className={cn(
          'mx-auto mt-4 bg-white p-5 leading-snug text-neutral-900 shadow-xl ring-1 ring-neutral-200 print:mt-0 print:max-w-none print:p-0! print:shadow-none print:ring-0',
          width,
          orientation === 'landscape' ? 'text-[8pt] sm:p-[10mm]' : 'text-[10pt] sm:p-[14mm]',
        )}
      >
        {orientation === 'landscape' ? (
          <LandscapeSheet plan={plan} model={model} showGrades={showGrades} today={today} />
        ) : (
          <PortraitSheet plan={plan} model={model} showGrades={showGrades} today={today} />
        )}
      </article>
    </main>
  )
}
