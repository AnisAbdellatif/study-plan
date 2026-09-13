import type { Attempt } from '../engine/compute.ts'
import { isModulePassed } from '../engine/progress.ts'
import { findModule, isIsoDate, PlanError } from './operations.ts'
import type { Plan, PlanModule } from './plan.ts'

/** One exam attempt as the student enters it. */
export type AttemptEntry =
  | { kind: 'graded'; grade: number; date?: string }
  | { kind: 'passed' | 'failed' | 'registered' | 'absent' | 'withdrawn'; date?: string }

export type AttemptOutcome = 'passed' | 'failed' | 'pending' | 'not_counted'

/**
 * What an attempt means for the attempt count. Not showing up counts as failed; a withdrawal does not count.
 * For graded modules, passing follows from the grade.
 */
export function attemptOutcome(
  attempt: Attempt,
  module: Pick<PlanModule, 'grading'>,
  rules: Pick<Plan['rules'], 'passThreshold'>,
): AttemptOutcome {
  if (attempt.result === 'withdrawn') return 'not_counted'
  if (attempt.result === 'registered') return 'pending'
  if (attempt.result === 'absent') return 'failed'
  if (module.grading === 'graded') {
    if (attempt.grade === undefined) return attempt.result === 'failed' ? 'failed' : 'pending'
    return attempt.grade <= rules.passThreshold ? 'passed' : 'failed'
  }
  return attempt.result === 'passed' ? 'passed' : 'failed'
}

export interface AttemptStatus {
  passed: boolean
  /** Failed attempts, including no-shows. Withdrawals do not count. */
  used: number
  /** The latest attempt is registered but has no result yet. */
  pending: boolean
  /** Null when the preset sets no limit. */
  maxAttempts: number | null
  /** Attempts still possible. Null when passed or unlimited. */
  remaining: number | null
  /** One failed attempt is left, so the next (or pending) attempt is the last one. */
  lastAttempt: boolean
  /** Every attempt is used up without passing. */
  exhausted: boolean
  /** Attempts were recorded after passing although the exam rules do not allow retakes. */
  retakenAfterPass: boolean
}

export function maxAttemptsFor(module: PlanModule, plan: Pick<Plan, 'preset'>): number | null {
  return module.maxAttempts ?? plan.preset.maxAttempts ?? null
}

export function attemptStatus(module: PlanModule, plan: Pick<Plan, 'preset' | 'rules'>): AttemptStatus {
  const maxAttempts = maxAttemptsFor(module, plan)
  const passed = isModulePassed(module, plan.rules)
  let used = 0
  let passedBefore = false
  let retaken = false
  let latest: AttemptOutcome | null = null

  for (const attempt of [...module.attempts].sort((a, b) => a.attemptNo - b.attemptNo)) {
    const outcome = attemptOutcome(attempt, module, plan.rules)
    if (outcome === 'not_counted') continue
    if (passedBefore) retaken = true
    if (outcome === 'failed') used++
    if (outcome === 'passed') passedBefore = true
    latest = outcome
  }

  const exhausted = !passed && maxAttempts !== null && used >= maxAttempts
  return {
    passed,
    used,
    pending: latest === 'pending',
    maxAttempts,
    remaining: passed || maxAttempts === null ? null : Math.max(0, maxAttempts - used),
    lastAttempt: !passed && !exhausted && maxAttempts !== null && used > 0 && used === maxAttempts - 1,
    exhausted,
    retakenAfterPass: retaken && plan.preset.retakePassedExams === false,
  }
}

/** The attempts of a module as entries, in attempt order. */
export function attemptEntries(module: PlanModule): AttemptEntry[] {
  return [...module.attempts]
    .sort((a, b) => a.attemptNo - b.attemptNo)
    .map((attempt) => {
      const date = attempt.date ? { date: attempt.date } : {}
      if (attempt.grade !== undefined) return { kind: 'graded', grade: attempt.grade, ...date }
      return { kind: attempt.result, ...date }
    })
}

/**
 * Replaces a module's attempts, numbered in the given order. Attempt limits are not enforced here:
 * a plan records what happened, and validation points out attempts beyond the limit.
 */
export function setModuleAttempts(plan: Plan, code: string, entries: readonly AttemptEntry[]): Plan {
  const module = findModule(plan, code)
  const attempts: Attempt[] = entries.map((entry, index) => {
    if (entry.date !== undefined && !isIsoDate(entry.date)) {
      throw new PlanError(`Invalid attempt date "${entry.date}"`)
    }
    const base = { attemptNo: index + 1, ...(entry.date ? { date: entry.date } : {}) }
    switch (entry.kind) {
      case 'graded':
        if (module.grading !== 'graded') throw new PlanError(`Module "${code}" is not graded`)
        if (!plan.rules.allowedValues.includes(entry.grade)) {
          throw new PlanError(`Grade ${entry.grade} is not allowed for this plan`)
        }
        return {
          ...base,
          result: entry.grade <= plan.rules.passThreshold ? 'passed' : 'failed',
          grade: entry.grade,
        }
      case 'passed':
      case 'failed':
        if (module.grading !== 'pass_fail') throw new PlanError(`Module "${code}" needs a grade`)
        return { ...base, result: entry.kind }
      default:
        return { ...base, result: entry.kind }
    }
  })
  return { ...plan, modules: plan.modules.map((m) => (m.code === code ? { ...m, attempts } : m)) }
}
