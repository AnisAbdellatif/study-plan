import type {
  AggregationNode,
  GradeRules,
  GroupChild,
  KeepBestRule,
  ModuleChild,
  RoundingSpec,
} from '../schema/rules.ts'
import { GradeRuleError } from './errors.ts'
import {
  absolute,
  add,
  compare,
  divide,
  formatScaled,
  formatTruncated,
  multiply,
  type Rational,
  rational,
  subtract,
  toScaledInteger,
  ZERO,
} from './rational.ts'
import { gradeToTenths, toHalves } from './units.ts'

export type AttemptResult = 'passed' | 'failed' | 'registered' | 'absent' | 'withdrawn'

export interface Attempt {
  attemptNo: number
  result: AttemptResult
  /**
   * Present for graded attempts. For graded modules, passing is derived from
   * `grade <= passThreshold`, never from `result`.
   */
  grade?: number
}

/** A module as the student recorded it. Credits and grading are snapshotted from the preset. */
export interface ModuleRecord {
  code: string
  credits: number
  grading: 'graded' | 'pass_fail'
  countsTowardAverage: boolean
  attempts: readonly Attempt[]
}

export type ModuleStatus =
  | 'counted'
  | 'dropped'
  | 'not_passed'
  | 'pass_fail'
  | 'excluded'
  | 'zero_weight'
  | 'missing'
  | 'surplus'

export interface TraceModule {
  code: string
  status: ModuleStatus
  grade: string | null
  weight: string | null
}

export interface TraceNode {
  id: string
  label?: string
  /** Exact weighted mean, truncated to 4 decimals for display. */
  value: string | null
  /** The node's value after `roundResult`, if the node rounds. */
  rounded: string | null
  /** Weight this node carried in its parent. */
  weight: string | null
  modules: TraceModule[]
  groups: TraceNode[]
}

export interface OverallResult {
  /** Final grade after `finalRounding`, e.g. "1.6". Null until at least one graded module has passed. */
  value: string | null
  /** Exact weighted mean before final rounding. */
  exact: Rational | null
  /** Raw credits of the modules that entered the average. */
  countedCredits: number
  trace: TraceNode
}

export type RulesForAttempts = Pick<GradeRules, 'allowedValues' | 'passThreshold' | 'attemptSelection'>

/**
 * The grade that counts for a module, in tenths, or null if no passing graded attempt exists.
 * Failed attempts keep their real value in the record but never contribute.
 */
export function effectiveGradeTenths(record: ModuleRecord, rules: RulesForAttempts): number | null {
  if (record.grading !== 'graded') return null
  const threshold = gradeToTenths(rules.passThreshold)
  const allowed = new Set(rules.allowedValues.map(gradeToTenths))
  let chosen: { attemptNo: number; tenths: number } | null = null

  for (const attempt of record.attempts) {
    if (attempt.grade === undefined) continue
    const tenths = gradeToTenths(attempt.grade)
    if (!allowed.has(tenths)) {
      throw new GradeRuleError(`Grade ${attempt.grade} for module "${record.code}" is not an allowed value`)
    }
    if (tenths > threshold) continue
    const better =
      chosen === null ||
      (rules.attemptSelection === 'best' ? tenths < chosen.tenths : attempt.attemptNo > chosen.attemptNo)
    if (better) chosen = { attemptNo: attempt.attemptNo, tenths }
  }
  return chosen?.tenths ?? null
}

interface Context {
  rules: GradeRules
  records: ReadonlyMap<string, ModuleRecord>
  allowedTenths: readonly number[]
}

/** All weights are integers in quarter units (credits * factor * 4) so halves times halves stay exact. */
interface Entry {
  value: Rational
  weight: bigint
  creditQuarters: bigint
  creditHalves: bigint
  dropped: boolean
  /** Only direct module entries carry a trace and are eligible for `dropWorst`. */
  module?: TraceModule
}

interface NodeResult {
  value: Rational | null
  creditQuarters: bigint
  creditHalves: bigint
  trace: TraceNode
}

const formatQuarters = (quarters: bigint): string => formatScaled(quarters * 25n, 2).replace(/\.?0+$/, '')

function roundValue(
  value: Rational,
  spec: RoundingSpec,
  allowedTenths: readonly number[],
): { value: Rational; precision: number } {
  if (spec.mode === 'round_to_nearest_allowed_ties_better') {
    let best: { candidate: Rational; distance: Rational } | null = null
    // Ascending order plus a strict comparison keeps the better (lower) grade on ties.
    for (const tenths of [...allowedTenths].sort((a, b) => a - b)) {
      const candidate = rational(BigInt(tenths), 10n)
      const distance = absolute(subtract(candidate, value))
      if (best === null || compare(distance, best.distance) < 0) best = { candidate, distance }
    }
    if (best === null) throw new GradeRuleError('No allowed grade values to round to')
    return { value: best.candidate, precision: 1 }
  }
  const scaled = toScaledInteger(value, spec.precision, spec.mode)
  return { value: rational(scaled, 10n ** BigInt(spec.precision)), precision: spec.precision }
}

function weightedMean(entries: readonly Entry[]): Rational | null {
  let total = 0n
  let sum = ZERO
  for (const entry of entries) {
    total += entry.weight
    sum = add(sum, multiply(entry.value, rational(entry.weight)))
  }
  return total === 0n ? null : divide(sum, rational(total))
}

function requireFixedWeight(node: AggregationNode, weight: number | undefined): number {
  if (weight === undefined) {
    throw new GradeRuleError(`Node "${node.id}" uses fixed weights, but a child has no weight`)
  }
  return weight
}

function moduleEntry(
  node: AggregationNode,
  child: ModuleChild,
  ctx: Context,
  trace: TraceNode,
): Entry | null {
  const module: TraceModule = { code: child.code, status: 'missing', grade: null, weight: null }
  trace.modules.push(module)

  const record = ctx.records.get(child.code)
  if (!record) return null
  if (record.grading === 'pass_fail') {
    module.status = 'pass_fail'
    return null
  }
  if (!record.countsTowardAverage) {
    module.status = 'excluded'
    return null
  }
  const tenths = effectiveGradeTenths(record, ctx.rules)
  if (tenths === null) {
    module.status = 'not_passed'
    return null
  }

  const factorHalves = BigInt(toHalves(child.factor ?? 1))
  const creditHalves = BigInt(toHalves(record.credits))
  const baseHalves =
    node.weightMode === 'fixed'
      ? BigInt(toHalves(requireFixedWeight(node, child.weight)))
      : child.weight === undefined
        ? creditHalves
        : BigInt(toHalves(child.weight))
  const weight = baseHalves * factorHalves

  module.grade = formatScaled(BigInt(tenths), 1)
  if (weight === 0n) {
    module.status = 'zero_weight'
    return null
  }
  module.status = 'counted'
  module.weight = formatQuarters(weight)
  return {
    value: rational(BigInt(tenths), 10n),
    weight,
    creditQuarters: creditHalves * factorHalves,
    creditHalves,
    dropped: false,
    module,
  }
}

function groupEntry(node: AggregationNode, child: GroupChild, ctx: Context, trace: TraceNode): Entry | null {
  const result = evaluateNode(child.node, ctx)
  trace.groups.push(result.trace)
  if (result.value === null) return null

  const weight =
    node.weightMode === 'fixed'
      ? BigInt(toHalves(requireFixedWeight(node, child.weight))) * 2n
      : child.weight === undefined
        ? result.creditQuarters
        : BigInt(toHalves(child.weight)) * 2n
  if (weight === 0n) return null

  result.trace.weight = formatQuarters(weight)
  return {
    value: result.value,
    weight,
    creditQuarters: result.creditQuarters,
    creditHalves: result.creditHalves,
    dropped: false,
  }
}

/**
 * Streichregel. Greedy: walk module entries worst grade first and drop each one that fits the
 * remaining credit budget and is strictly worse than the mean of everything else. This matches the
 * common "drop the worst modules up to N credits" wording; POs with an optimising rule need a
 * dedicated mode.
 */
function applyDropWorst(entries: Entry[], budgetHalves: bigint): void {
  let budget = budgetHalves
  const candidates = entries
    .filter((entry) => entry.module !== undefined)
    .sort((a, b) => compare(b.value, a.value) || (a.module?.code ?? '').localeCompare(b.module?.code ?? ''))

  for (const candidate of candidates) {
    if (candidate.creditHalves > budget) continue
    const othersMean = weightedMean(entries.filter((entry) => !entry.dropped && entry !== candidate))
    if (othersMean === null || compare(candidate.value, othersMean) <= 0) continue
    candidate.dropped = true
    budget -= candidate.creditHalves
    if (candidate.module) {
      candidate.module.status = 'dropped'
      candidate.module.weight = null
    }
  }
}

/**
 * Best-of selection. Quota minimums are filled first with each quota's best modules, then the remaining
 * capacity is filled best grade first. The module that crosses `maxCredits` still counts. Everything else
 * becomes a surplus module that does not enter the average. Greedy, which is optimal for equal-credit modules.
 * Group entries in the same node are not part of the selection and always count.
 */
function applyKeepBest(entries: Entry[], rule: KeepBestRule): void {
  const candidates = entries
    .filter((entry) => entry.module !== undefined)
    .sort(
      (a, b) =>
        compare(a.value, b.value) ||
        Number(b.creditHalves - a.creditHalves) ||
        (a.module?.code ?? '').localeCompare(b.module?.code ?? ''),
    )
  const quotas = (rule.quotas ?? []).map((quota) => ({
    codes: new Set(quota.codes),
    min: BigInt(toHalves(quota.minCredits)),
    max: quota.maxCredits === undefined ? null : BigInt(toHalves(quota.maxCredits)),
    counted: 0n,
  }))
  const cap = BigInt(toHalves(rule.maxCredits))
  const kept = new Set<Entry>()
  let counted = 0n

  const quotasOf = (entry: Entry) => quotas.filter((quota) => quota.codes.has(entry.module?.code ?? ''))
  const take = (entry: Entry) => {
    kept.add(entry)
    counted += entry.creditHalves
    for (const quota of quotasOf(entry)) quota.counted += entry.creditHalves
  }

  for (const quota of quotas) {
    for (const entry of candidates) {
      if (quota.counted >= quota.min) break
      if (!kept.has(entry) && quota.codes.has(entry.module?.code ?? '')) take(entry)
    }
  }
  for (const entry of candidates) {
    if (counted >= cap) break
    if (kept.has(entry)) continue
    if (quotasOf(entry).some((quota) => quota.max !== null && quota.counted + entry.creditHalves > quota.max))
      continue
    take(entry)
  }
  for (const entry of candidates) {
    if (kept.has(entry) || !entry.module) continue
    entry.dropped = true
    entry.module.status = 'surplus'
    entry.module.weight = null
  }
}

function evaluateNode(node: AggregationNode, ctx: Context): NodeResult {
  const trace: TraceNode = {
    id: node.id,
    label: node.label,
    value: null,
    rounded: null,
    weight: null,
    modules: [],
    groups: [],
  }

  const entries: Entry[] = []
  for (const child of node.children) {
    const entry =
      child.kind === 'module' ? moduleEntry(node, child, ctx, trace) : groupEntry(node, child, ctx, trace)
    if (entry) entries.push(entry)
  }
  if (node.keepBest) applyKeepBest(entries, node.keepBest)
  if (node.dropWorst) applyDropWorst(entries, BigInt(toHalves(node.dropWorst.maxCredits)))

  const active = entries.filter((entry) => !entry.dropped)
  const mean = weightedMean(active)
  if (mean === null) return { value: null, creditQuarters: 0n, creditHalves: 0n, trace }

  trace.value = formatTruncated(mean, 4)
  let value = mean
  if (node.roundResult) {
    const rounded = roundValue(mean, node.roundResult, ctx.allowedTenths)
    value = rounded.value
    trace.rounded = formatTruncated(rounded.value, rounded.precision)
  }
  return {
    value,
    creditQuarters: active.reduce((sum, entry) => sum + entry.creditQuarters, 0n),
    creditHalves: active.reduce((sum, entry) => sum + entry.creditHalves, 0n),
    trace,
  }
}

/**
 * Computes the running overall grade from the modules recorded so far.
 * Pure: the same rules and records always give the same result and trace.
 */
export function computeOverall(rules: GradeRules, records: Iterable<ModuleRecord>): OverallResult {
  const byCode = new Map<string, ModuleRecord>()
  for (const record of records) {
    if (byCode.has(record.code)) throw new GradeRuleError(`Duplicate record for module "${record.code}"`)
    byCode.set(record.code, record)
  }

  const ctx: Context = { rules, records: byCode, allowedTenths: rules.allowedValues.map(gradeToTenths) }
  const root = evaluateNode(rules.aggregation, ctx)
  if (root.value === null) return { value: null, exact: null, countedCredits: 0, trace: root.trace }

  const final = roundValue(root.value, rules.finalRounding, ctx.allowedTenths)
  return {
    value: formatTruncated(final.value, final.precision),
    exact: root.value,
    countedCredits: Number(root.creditHalves) / 2,
    trace: root.trace,
  }
}
