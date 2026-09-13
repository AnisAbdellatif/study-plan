import type { Plan, PlanSummary, TraceModule, TraceNode } from '@study-plan/shared'
import { cn } from '../../lib/cn.ts'
import { describeRounding, formatCredits, formatGradeString } from '../../lib/format.ts'

const STATUS_LABEL: Record<TraceModule['status'], string> = {
  counted: 'gewertet',
  dropped: 'gestrichen',
  not_passed: 'offen',
  pass_fail: 'unbenotet',
  excluded: 'zählt nicht',
  zero_weight: 'Gewicht 0',
  missing: 'fehlt im Plan',
  surplus: 'Zusatzmodul, zählt nicht',
}

function CreditBar({
  earned,
  planned,
  total,
  label,
}: {
  earned: number
  planned: number
  total: number
  label: string
}) {
  const percent = (value: number) => `${Math.min(100, total > 0 ? (value / total) * 100 : 0)}%`
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={earned}
      aria-valuetext={`${formatCredits(earned)} von ${formatCredits(total)} erreicht, ${formatCredits(planned)} eingeplant`}
      className="relative h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
    >
      <div
        className="absolute inset-y-0 left-0 bg-indigo-200 dark:bg-indigo-400/20"
        style={{ width: percent(planned) }}
      />
      <div
        className="absolute inset-y-0 left-0 bg-indigo-600 dark:bg-indigo-400"
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
  return (
    <li className={cn(depth > 0 && 'mt-2 border-l border-zinc-200 pl-3 dark:border-zinc-800')}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{node.label ?? node.id}</span>
        {node.value !== null ? (
          <span className="text-zinc-600 dark:text-zinc-400">
            Ø {formatGradeString(node.value)}
            {node.rounded !== null ? ` → ${formatGradeString(node.rounded)}` : ''}
            {node.weight !== null ? ` · Gewicht ${formatGradeString(node.weight)}` : ''}
          </span>
        ) : (
          <span className="text-zinc-500">noch keine Note</span>
        )}
      </div>
      <ul className="mt-1 space-y-0.5">
        {node.modules.map((module) => (
          <li key={module.code} className="flex justify-between gap-3 text-zinc-600 dark:text-zinc-400">
            <span className="truncate">{names.get(module.code) ?? module.code}</span>
            <span className="shrink-0">
              {module.grade !== null ? `${formatGradeString(module.grade)} · ` : ''}
              {STATUS_LABEL[module.status]}
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
  const { overall, credits } = summary
  const label = plan.preset.creditLabel
  const names = new Map(plan.modules.map((m) => [m.code, m.name]))

  return (
    <aside
      aria-label="Überblick"
      className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,1fr)]"
    >
      <section className="rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
        <h2 className="text-sm text-zinc-600 dark:text-zinc-400">Aktueller Schnitt</h2>
        <p className="mt-1 text-3xl font-semibold tabular-nums" data-testid="overall-grade">
          {overall.value !== null ? formatGradeString(overall.value) : '–'}
        </p>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          {overall.value !== null
            ? `Vorläufig, aus ${formatCredits(overall.countedCredits)} ${label}, ${describeRounding(plan.rules.finalRounding)}`
            : 'Noch keine benotete Prüfung bestanden'}
        </p>
      </section>

      <section className="rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
        <h2 className="text-sm text-zinc-600 dark:text-zinc-400">Fortschritt</h2>
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
            label={`${label} gesamt`}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
          {formatCredits(credits.planned)} {label} eingeplant
        </p>
      </section>

      <section className="col-span-2 rounded-xl bg-white p-4 ring-1 ring-zinc-200 lg:col-span-1 dark:bg-zinc-900 dark:ring-zinc-800">
        <h2 className="text-sm text-zinc-600 dark:text-zinc-400">Bereiche</h2>
        <ul className="mt-2 space-y-2.5">
          {summary.areas.map((area) => (
            <li key={area.id}>
              <div className="flex justify-between gap-2 text-sm">
                <span className="truncate">{area.name}</span>
                <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-400">
                  {formatCredits(area.earnedCredits)} / {formatCredits(area.minCredits)}
                  {area.maxCredits !== undefined && area.maxCredits !== area.minCredits
                    ? ` (max. ${formatCredits(area.maxCredits)})`
                    : ''}
                </span>
              </div>
              <div className="mt-1">
                <CreditBar
                  earned={area.earnedCredits}
                  planned={area.plannedCredits}
                  total={Math.max(area.minCredits, area.plannedCredits)}
                  label={area.name}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <details className="col-span-2 rounded-xl print:hidden bg-white p-4 text-sm ring-1 ring-zinc-200 lg:col-span-3 dark:bg-zinc-900 dark:ring-zinc-800">
        <summary className="cursor-pointer font-medium">So wird dein Schnitt berechnet</summary>
        <ul className="mt-3">
          <TraceGroup node={overall.trace} names={names} depth={0} />
        </ul>
      </details>
    </aside>
  )
}
