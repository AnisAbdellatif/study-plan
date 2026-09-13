import {
  addTerms,
  choiceOptionCodes,
  currentResult,
  formatTerm,
  isPlaceholderId,
  type Plan,
  type PlanModule,
  type PlanSummary,
  placeholderCredits,
} from '@study-plan/shared'
import { Check } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLocale } from '../../i18n/index.ts'
import { areaTone, moduleTone, NEUTRAL_TONE } from '../../lib/area-colors.ts'
import { cn } from '../../lib/cn.ts'
import { DEGREE_LABEL, formatCredits, formatGrade } from '../../lib/format.ts'

export interface PlanOverviewProps {
  plan: Plan
  summary: PlanSummary
}

// The page is printed from the board page; @page cannot be set per element, so it lives with the overview.
const PRINT_PAGE_STYLE = '@media print { @page { size: A4 landscape; margin: 10mm; } }'

type Block =
  | { kind: 'module'; key: string; credits: number; module: PlanModule }
  | { kind: 'placeholder'; key: string; credits: number; areaId: string; areaName: string }

/**
 * Height grows with credits (--overview-lp per credit point), but only as a minimum: a card with more text than
 * its credits allow grows instead of cutting text off. Each semester stacks on its own, so a tall card never
 * stretches the others.
 */
const blockHeight = (credits: number): CSSProperties => ({
  minHeight: `calc(${Math.max(credits, 1)} * var(--overview-lp))`,
})

/** "2V+2Ü" when every course has hours and a short type, otherwise "4 SWS", or nothing. */
function teachingHours(module: PlanModule): string | null {
  const courses = module.details?.courses ?? []
  if (courses.length > 0 && courses.every((course) => course.sws !== undefined && course.type.length <= 3)) {
    return courses.map((course) => `${formatCredits(course.sws ?? 0)}${course.type}`).join('+')
  }
  if (module.details?.sws !== undefined) return `${formatCredits(module.details.sws)} SWS`
  return null
}

function ResultMark({ module, passThreshold }: { module: PlanModule; passThreshold: number }) {
  const { t } = useTranslation('board')
  const result = currentResult(module)
  if (result.kind !== 'passed' && !(result.kind === 'graded' && result.grade <= passThreshold)) return null
  // Only an icon: the overview stays in the page for printing, and the board card already shows the result as text.
  const label =
    result.kind === 'graded' ? `${t('card.gradeSr')} ${formatGrade(result.grade)}` : t('card.passed')
  return (
    <Check
      role="img"
      aria-label={label}
      className="absolute top-1 right-1 size-3.5 text-emerald-700 dark:text-emerald-300"
    />
  )
}

export function PlanOverview({ plan, summary }: PlanOverviewProps) {
  const { t } = useTranslation('board')
  const locale = currentLocale()
  const label = plan.preset.creditLabel

  const { stacks, unplanned, hasNeutral } = useMemo(() => {
    const byCode = new Map(plan.modules.map((m) => [m.code, m]))
    const estimates = placeholderCredits(plan)
    const areaNames = new Map(plan.areas.map((area) => [area.id, area.name]))
    const placeholders = new Map((plan.placeholders ?? []).map((p) => [p.id, p]))
    const areaCodes = new Set(plan.areas.flatMap((area) => area.moduleCodes))
    let hasNeutral = false

    const stacks = plan.semesters.map((semester) => {
      const list: Block[] = []
      for (const code of semester.moduleCodes) {
        if (isPlaceholderId(code)) {
          const placeholder = placeholders.get(code)
          if (!placeholder) continue
          list.push({
            kind: 'placeholder',
            key: code,
            credits: estimates.get(code) ?? 0,
            areaId: placeholder.areaId,
            areaName: areaNames.get(placeholder.areaId) ?? placeholder.areaId,
          })
          continue
        }
        const module = byCode.get(code)
        if (!module) continue
        list.push({ kind: 'module', key: code, credits: module.credits, module })
        if (!areaCodes.has(code)) hasNeutral = true
      }
      return list
    })

    // Same count as the board's backlog: options of choice areas are not open work.
    const optionCodes = new Set([...choiceOptionCodes(plan).values()].flat())
    const unplanned = plan.backlog.filter((code) => byCode.has(code) && !optionCodes.has(code)).length
    return { stacks, unplanned, hasNeutral }
  }, [plan])

  const columns = plan.semesters.length
  // Row 1 holds the headers, row 2 one stack of cards per semester, row 3 the totals.
  const gridStyle = { '--overview-cols': columns } as CSSProperties

  return (
    <section
      aria-labelledby="plan-overview-title"
      data-testid="plan-overview"
      className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 text-zinc-900 print:space-y-2 print:border-0 print:bg-white print:p-0 print:text-[8pt] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
    >
      <style>{PRINT_PAGE_STYLE}</style>
      <header>
        <h2 id="plan-overview-title" className="text-lg font-semibold print:text-[12pt]">
          {t('overview.title', {
            degree: DEGREE_LABEL[plan.preset.degree],
            programme: plan.preset.programmeName,
          })}
        </h2>
        <p className="text-sm text-zinc-600 print:text-[9pt] dark:text-zinc-400">
          {t('overview.subtitle', {
            university: plan.preset.universityName,
            poVersion: plan.preset.poVersion,
            term: formatTerm(plan.startTerm, locale),
          })}
        </p>
      </header>

      <div className="overflow-x-auto pb-1 print:overflow-visible print:pb-0">
        <div
          style={gridStyle}
          className="grid grid-cols-[repeat(var(--overview-cols),minmax(10rem,1fr))] grid-rows-[auto_1fr_auto] gap-x-2 gap-y-1 [--overview-lp:0.75rem] print:grid-cols-[repeat(var(--overview-cols),minmax(0,1fr))] print:gap-x-1 print:gap-y-0.5 print:[--overview-lp:0.5rem]"
        >
          {plan.semesters.map((semester, index) => (
            <div
              key={`head-${semester.id}`}
              data-testid="overview-header"
              style={{ gridColumn: index + 1, gridRow: 1 }}
              className="border-b-2 border-zinc-300 pb-1 text-center dark:border-zinc-700"
            >
              {/* Not a heading: the board's columns already own "1. Semester" headings on the same page. */}
              <p className="text-sm font-semibold print:text-[9pt]">
                {t('overview.semester', { number: index + 1 })}
              </p>
              <p className="text-xs text-zinc-600 print:text-[7pt] dark:text-zinc-400">
                {formatTerm(addTerms(plan.startTerm, index), locale)}
              </p>
            </div>
          ))}

          {stacks.map((stack, index) => (
            <div
              key={`stack-${plan.semesters[index]?.id ?? index}`}
              data-testid="overview-column"
              style={{ gridColumn: index + 1, gridRow: 2 }}
              className="flex min-w-0 flex-col gap-1 print:gap-0.5"
            >
              {stack.map((block) => {
                const placement = blockHeight(block.credits)
                if (block.kind === 'placeholder') {
                  const tone = areaTone(plan, block.areaId)
                  return (
                    <div
                      key={block.key}
                      data-testid="overview-placeholder"
                      style={placement}
                      className={cn(
                        'flex min-w-0 break-inside-avoid flex-col rounded-md border border-dashed border-zinc-500/60 px-2 py-1 text-xs leading-snug print:rounded-sm print:px-1 print:py-0.5 print:text-[7pt] dark:border-zinc-400/60',
                        tone.soft,
                      )}
                    >
                      <span className="font-semibold">{t('overview.placeholder')}</span>
                      <span className={tone.text}>{block.areaName}</span>
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {t('placeholder.estimate', { credits: formatCredits(block.credits), label })}
                      </span>
                    </div>
                  )
                }
                const { module } = block
                const tone = moduleTone(plan, module.code)
                const hours = teachingHours(module)
                const people = module.details?.lecturers ?? module.details?.responsible ?? []
                return (
                  <div
                    key={block.key}
                    data-testid="overview-module"
                    style={placement}
                    className={cn(
                      'relative flex min-w-0 break-inside-avoid flex-col rounded-md border border-zinc-900/10 py-1 pr-5 pl-2 text-xs leading-snug print:rounded-sm print:py-0.5 print:pr-4 print:pl-1 print:text-[7pt] dark:border-white/10',
                      tone.strong,
                    )}
                  >
                    <span className="font-semibold">{module.name}</span>
                    <span className="text-zinc-700 dark:text-zinc-300">
                      ({hours ? `${hours}, ` : ''}
                      {formatCredits(module.credits)} {label})
                    </span>
                    {people.length > 0 && (
                      <span className="text-zinc-700 dark:text-zinc-300">{people.join(', ')}</span>
                    )}
                    <ResultMark module={module} passThreshold={plan.rules.passThreshold} />
                  </div>
                )
              })}
            </div>
          ))}

          {plan.semesters.map((semester, index) => {
            const info = summary.semesters[index]
            const credits = formatCredits(info?.credits ?? 0)
            const estimate = info?.placeholderCredits ?? 0
            return (
              <p
                key={`total-${semester.id}`}
                data-testid="overview-total"
                style={{ gridColumn: index + 1, gridRow: 3 }}
                className="mt-1 border-t-2 border-zinc-300 pt-1 text-center text-sm font-semibold tabular-nums print:text-[8pt] dark:border-zinc-700"
              >
                {estimate > 0
                  ? t('columns.creditsWithEstimate', { credits, estimate: formatCredits(estimate), label })
                  : t('overview.credits', { credits, label })}
              </p>
            )
          })}
        </div>
      </div>

      {(plan.areas.length > 0 || hasNeutral) && (
        <ul
          aria-label={t('overview.legend')}
          className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-700 print:text-[7pt] dark:text-zinc-300"
        >
          {plan.areas.map((area) => (
            <li key={area.id} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={cn('size-2.5 rounded-full', areaTone(plan, area.id).dot)} />
              {area.name}
            </li>
          ))}
          {hasNeutral && (
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={cn('size-2.5 rounded-full', NEUTRAL_TONE.dot)} />
              {t('customModule.noArea')}
            </li>
          )}
        </ul>
      )}
      {unplanned > 0 && (
        <p className="text-xs text-zinc-600 print:text-[7pt] dark:text-zinc-400">
          {t('overview.unplanned', { count: unplanned })}
        </p>
      )}
    </section>
  )
}
