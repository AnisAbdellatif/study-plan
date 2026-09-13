import type { Plan, PlanSummary, TraceNode } from '@study-plan/shared'
import { GraduationCap, Layers, type LucideIcon, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { type AreaTone, areaTone } from '../../lib/area-colors.ts'
import { cn } from '../../lib/cn.ts'
import { describeRounding, formatCredits, formatGradeString } from '../../lib/format.ts'

const cardClass = 'rounded-xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'

function CardHeading({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <span className="grid size-6 shrink-0 place-items-center rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
        <Icon aria-hidden className="size-3.5" />
      </span>
      {children}
    </h2>
  )
}

function CreditBar({
  earned,
  planned,
  total,
  label,
  tone,
}: {
  earned: number
  planned: number
  total: number
  label: string
  /** Area colour; the overall bar uses indigo. */
  tone?: AreaTone
}) {
  const { t } = useTranslation('board')
  const percent = (value: number) => `${Math.min(100, total > 0 ? (value / total) * 100 : 0)}%`
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={earned}
      aria-valuetext={t('summary.barValue', {
        earned: formatCredits(earned),
        total: formatCredits(total),
        planned: formatCredits(planned),
      })}
      className="relative h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
    >
      <div
        className={cn(
          'absolute inset-y-0 left-0',
          // The planned part is the earned colour, faded, so each area keeps one hue.
          tone ? cn(tone.dot, 'opacity-35') : 'bg-indigo-200 dark:bg-indigo-400/25',
        )}
        style={{ width: percent(planned) }}
      />
      <div
        className={cn(
          'absolute inset-y-0 left-0',
          tone ? tone.dot : 'bg-linear-to-r from-indigo-600 to-sky-500 dark:from-indigo-400 dark:to-sky-400',
        )}
        style={{ width: percent(earned) }}
      />
    </div>
  )
}

function TraceGroup({
  node,
  names,
  depth,
}: {
  node: TraceNode
  names: ReadonlyMap<string, string>
  depth: number
}) {
  const { t } = useTranslation('board')
  return (
    <li className={cn(depth > 0 && 'mt-2 border-l border-zinc-200 pl-3 dark:border-zinc-800')}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{node.label ?? node.id}</span>
        {node.value !== null ? (
          <span className="text-zinc-600 dark:text-zinc-400">
            Ø {formatGradeString(node.value)}
            {node.rounded !== null ? ` → ${formatGradeString(node.rounded)}` : ''}
            {node.weight !== null
              ? ` · ${t('summary.weight', { weight: formatGradeString(node.weight) })}`
              : ''}
          </span>
        ) : (
          <span className="text-zinc-500">{t('summary.noGrade')}</span>
        )}
      </div>
      <ul className="mt-1 space-y-0.5">
        {node.modules.map((module) => (
          <li key={module.code} className="flex justify-between gap-3 text-zinc-600 dark:text-zinc-400">
            <span className="truncate">{names.get(module.code) ?? module.code}</span>
            <span className="shrink-0">
              {module.grade !== null ? `${formatGradeString(module.grade)} · ` : ''}
              {t(`summary.status.${module.status}`)}
            </span>
          </li>
        ))}
        {node.groups.map((group) => (
          <TraceGroup key={group.id} node={group} names={names} depth={depth + 1} />
        ))}
      </ul>
    </li>
  )
}

export function SummaryPanel({ plan, summary }: { plan: Plan; summary: PlanSummary }) {
  const { t } = useTranslation('board')
  const { overall, credits } = summary
  const label = plan.preset.creditLabel
  const names = new Map(plan.modules.map((m) => [m.code, m.name]))

  return (
    <aside
      aria-label={t('summary.overview')}
      // In print the three cards share one compact row, leaving the page to the study plan overview.
      className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,1fr)] print:grid-cols-[minmax(0,10rem)_minmax(0,13rem)_minmax(0,1fr)] print:gap-2"
    >
      <section className="rounded-xl bg-linear-to-br from-indigo-50 to-white p-4 shadow-sm ring-1 ring-indigo-200/70 dark:from-indigo-950/60 dark:to-zinc-900 dark:ring-indigo-900/60 print:p-2.5 print:shadow-none">
        <CardHeading icon={GraduationCap}>{t('summary.currentAverage')}</CardHeading>
        <p
          className="mt-1 text-3xl font-semibold tabular-nums print:mt-0 print:text-2xl"
          data-testid="overall-grade"
        >
          {overall.value !== null ? formatGradeString(overall.value) : '–'}
        </p>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          {overall.value !== null
            ? t('summary.provisional', {
                credits: formatCredits(overall.countedCredits),
                label,
                rounding: describeRounding(plan.rules.finalRounding),
              })
            : t('summary.noGradeYet')}
        </p>
      </section>

      <section className={cn(cardClass, 'print:p-2.5 print:shadow-none')}>
        <CardHeading icon={TrendingUp}>{t('summary.progress')}</CardHeading>
        <p className="mt-1 text-lg font-semibold tabular-nums">
          {formatCredits(credits.earned)}{' '}
          <span className="font-normal text-zinc-500">
            / {formatCredits(credits.required)} {label}
          </span>
        </p>
        <div className="mt-2">
          <CreditBar
            earned={credits.earned}
            planned={credits.planned}
            total={credits.required}
            label={t('summary.total', { label })}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          {t('summary.planned', { credits: formatCredits(credits.planned), label })}
        </p>
      </section>

      <section
        className={cn(cardClass, 'col-span-2 lg:col-span-1 print:col-span-1 print:p-2.5 print:shadow-none')}
      >
        <div className="flex items-center justify-between gap-2">
          <CardHeading icon={Layers}>{t('summary.areas')}</CardHeading>
          <span className="text-xs text-zinc-500">{t('summary.areaLegend')}</span>
        </div>
        {/* Two columns of areas in print keep this card as short as the other two. */}
        <ul className="mt-2 space-y-2.5 print:mt-1 print:grid print:grid-cols-2 print:gap-x-4 print:gap-y-1 print:space-y-0">
          {summary.areas.map((area) => {
            const planned = area.plannedCredits + area.placeholderCredits
            const hasRange = area.maxCredits !== undefined && area.maxCredits !== area.minCredits
            const target = hasRange
              ? t('summary.areaRange', {
                  min: formatCredits(area.minCredits),
                  max: formatCredits(area.maxCredits ?? area.minCredits),
                })
              : formatCredits(area.minCredits)
            const plannedText = `${area.placeholderCredits > 0 ? '≈' : ''}${formatCredits(planned)}`
            const tone = areaTone(plan, area.id)
            return (
              <li key={area.id}>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', tone.dot)} />
                    <span className="truncate">{area.name}</span>
                  </span>
                  <span
                    className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-400"
                    title={t('summary.areaValue', {
                      earned: formatCredits(area.earnedCredits),
                      planned: plannedText,
                      target,
                      label,
                    })}
                  >
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {formatCredits(area.earnedCredits)}
                    </span>{' '}
                    / {plannedText} <span className="text-zinc-500">({target})</span>
                  </span>
                </div>
                <div className="mt-1 print:mt-0.5">
                  <CreditBar
                    earned={area.earnedCredits}
                    planned={planned}
                    total={Math.max(area.minCredits, planned)}
                    label={area.name}
                    tone={tone}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <details className={cn(cardClass, 'col-span-2 text-sm lg:col-span-3 print:hidden')}>
        <summary className="cursor-pointer font-medium">{t('summary.howCalculated')}</summary>
        <ul className="mt-3">
          <TraceGroup node={overall.trace} names={names} depth={0} />
        </ul>
      </details>
    </aside>
  )
}
