import type { OverallResult, Plan, TraceModule, TraceNode } from '@study-plan/shared'
import { useTranslation } from 'react-i18next'
import { currentIntlLocale } from '../../i18n/index.ts'
import { describeRounding, formatGrade, formatGradeString } from '../../lib/format.ts'

/**
 * Explains the grade average as a worked calculation: per group only the grades that count, grade × weight, the
 * division, then how the groups combine and how the result is rounded. Everything that doesn't count sits in a
 * collapsed list, so long module lists don't bury the numbers.
 */

// Display only: the engine's exact values stay authoritative, these just format them readably.
const formatNumber = (value: number, maximumFractionDigits = 3): string =>
  new Intl.NumberFormat(currentIntlLocale(), { maximumFractionDigits }).format(value)

const tableClass = 'w-full min-w-[22rem] text-left text-sm tabular-nums'
const headClass = 'py-1 pr-3 text-xs font-medium text-zinc-600 dark:text-zinc-400'

interface CountedModule {
  code: string
  grade: number
  weight: number
}

const countedModules = (node: TraceNode): CountedModule[] =>
  node.modules.flatMap((module) =>
    module.status === 'counted' && module.grade !== null && module.weight !== null
      ? [{ code: module.code, grade: Number(module.grade), weight: Number(module.weight) }]
      : [],
  )

/** Child groups that already have an average; the others don't enter the calculation yet. */
const valuedGroups = (node: TraceNode): TraceNode[] =>
  node.groups.filter((group) => group.value !== null && group.weight !== null)

function OtherModules({ modules, names }: { modules: TraceModule[]; names: ReadonlyMap<string, string> }) {
  const { t } = useTranslation('board')
  if (modules.length === 0) return null
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
        {t('summary.calc.otherModules', { count: modules.length })}
      </summary>
      <ul className="mt-1 space-y-0.5 pl-4">
        {modules.map((module) => (
          <li key={module.code} className="flex justify-between gap-3 text-zinc-600 dark:text-zinc-400">
            <span className="truncate">{names.get(module.code) ?? module.code}</span>
            <span className="shrink-0">{t(`summary.status.${module.status}`)}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

/** A group whose average comes straight from module grades. */
function ModuleTable({ node, names }: { node: TraceNode; names: ReadonlyMap<string, string> }) {
  const { t } = useTranslation('board')
  const modules = countedModules(node)
  const weights = modules.reduce((sum, module) => sum + module.weight, 0)
  const products = modules.reduce((sum, module) => sum + module.grade * module.weight, 0)
  return (
    <>
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={headClass}>{t('summary.calc.module')}</th>
              <th className={`${headClass} text-right`}>{t('summary.calc.grade')}</th>
              <th className={`${headClass} text-right`}>{t('summary.calc.weight')}</th>
              <th className={`${headClass} text-right`}>{t('summary.calc.product')}</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((module) => (
              <tr key={module.code} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-1 pr-3">{names.get(module.code) ?? module.code}</td>
                <td className="py-1 pr-3 text-right">{formatGrade(module.grade)}</td>
                <td className="py-1 pr-3 text-right">{formatNumber(module.weight)}</td>
                <td className="py-1 text-right">{formatNumber(module.grade * module.weight, 2)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-zinc-300 font-medium dark:border-zinc-700">
              <td className="py-1 pr-3">{t('summary.calc.sum')}</td>
              <td />
              <td className="py-1 pr-3 text-right">{formatNumber(weights)}</td>
              <td className="py-1 text-right">{formatNumber(products, 2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {node.value !== null ? (
        <p className="mt-2 text-sm">
          {t('summary.calc.division', {
            products: formatNumber(products, 2),
            weights: formatNumber(weights),
            mean: formatNumber(Number(node.value)),
          })}
        </p>
      ) : null}
    </>
  )
}

/** A group that averages its sub-groups (and possibly some modules directly), weighted by their weights. */
function CombineTable({ node, names }: { node: TraceNode; names: ReadonlyMap<string, string> }) {
  const { t } = useTranslation('board')
  const rows = [
    ...valuedGroups(node).map((group) => ({
      key: `group:${group.id}`,
      name: group.label ?? group.id,
      grade: Number(group.rounded ?? group.value),
      weight: Number(group.weight),
    })),
    ...countedModules(node).map((module) => ({
      key: `module:${module.code}`,
      name: names.get(module.code) ?? module.code,
      grade: module.grade,
      weight: module.weight,
    })),
  ]
  const total = rows.reduce((sum, row) => sum + row.weight, 0)
  return (
    <>
      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={headClass}>{t('summary.calc.part')}</th>
              <th className={`${headClass} text-right`}>{t('summary.calc.average')}</th>
              <th className={`${headClass} text-right`}>{t('summary.calc.weight')}</th>
              <th className={`${headClass} text-right`}>{t('summary.calc.share')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-1 pr-3">{row.name}</td>
                <td className="py-1 pr-3 text-right">{formatNumber(row.grade)}</td>
                <td className="py-1 pr-3 text-right">{formatNumber(row.weight)}</td>
                <td className="py-1 text-right">
                  {total > 0 ? `${formatNumber((row.weight / total) * 100, 0)} %` : '–'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {node.value !== null ? (
        <p className="mt-2 text-sm">
          {t('summary.calc.combined', { mean: formatNumber(Number(node.value)) })}
        </p>
      ) : null}
    </>
  )
}

function GroupSection({
  node,
  names,
  depth,
}: {
  node: TraceNode
  names: ReadonlyMap<string, string>
  depth: number
}) {
  const { t } = useTranslation('board')
  const hasSubGroups = node.groups.length > 0
  const counted = countedModules(node)
  const others = node.modules.filter((module) => module.status !== 'counted')
  const isRoot = depth === 0

  return (
    <section
      className={
        isRoot
          ? 'space-y-4'
          : 'rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200 dark:bg-zinc-950/40 dark:ring-zinc-800'
      }
    >
      {isRoot ? null : (
        <h3 className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 font-medium">
          <span>{node.label ?? node.id}</span>
          {node.value !== null ? (
            <span className="text-sm font-normal text-zinc-600 dark:text-zinc-400">
              {t('summary.calc.groupAverage', { mean: formatNumber(Number(node.value)) })}
            </span>
          ) : null}
        </h3>
      )}

      {hasSubGroups ? (
        <>
          <div className="space-y-3">
            {node.groups.map((group) => (
              <GroupSection key={group.id} node={group} names={names} depth={depth + 1} />
            ))}
          </div>
          {valuedGroups(node).length + counted.length > 0 ? (
            <div>
              <h3 className="mb-1 font-medium">
                {isRoot ? t('summary.calc.combineHeadingRoot') : t('summary.calc.combineHeading')}
              </h3>
              <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
                {t('summary.calc.combineIntro')}
              </p>
              <CombineTable node={node} names={names} />
            </div>
          ) : null}
        </>
      ) : counted.length > 0 ? (
        <ModuleTable node={node} names={names} />
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('summary.calc.noGradeInGroup')}</p>
      )}

      {node.rounded !== null && !isRoot ? (
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {t('summary.calc.roundedInto', { grade: formatGradeString(node.rounded) })}
        </p>
      ) : null}
      <OtherModules modules={others} names={names} />
    </section>
  )
}

export function GradeCalculation({ plan, overall }: { plan: Plan; overall: OverallResult }) {
  const { t } = useTranslation('board')
  const names = new Map(plan.modules.map((module) => [module.code, module.name]))
  const root = overall.trace

  return (
    <div className="mt-3 space-y-4">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">{t('summary.calc.intro')}</p>
      {overall.value === null ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('summary.calc.noGradeYet')}</p>
      ) : (
        <>
          <GroupSection node={root} names={names} depth={0} />
          <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-950 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-100 dark:ring-indigo-900">
            {t('summary.calc.final', {
              exact: formatNumber(Number(root.value ?? overall.value), 4),
              rounding: describeRounding(plan.rules.finalRounding),
              grade: formatGradeString(overall.value),
            })}
          </p>
        </>
      )}
    </div>
  )
}
