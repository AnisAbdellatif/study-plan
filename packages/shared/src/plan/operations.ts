import type { Attempt } from '../engine/compute.ts'
import type { Plan, PlanModule } from './plan.ts'

/** Thrown when an operation refers to a module or semester the plan does not have. */
export class PlanError extends Error {
  override readonly name = 'PlanError'
}

export interface ModuleLocation {
  /** Null means the backlog. */
  semesterId: string | null
  index: number
}

export function findModule(plan: Plan, code: string): PlanModule {
  const module = plan.modules.find((m) => m.code === code)
  if (!module) throw new PlanError(`Unknown module "${code}"`)
  return module
}

export function locateModule(plan: Plan, code: string): ModuleLocation {
  for (const semester of plan.semesters) {
    const index = semester.moduleCodes.indexOf(code)
    if (index !== -1) return { semesterId: semester.id, index }
  }
  const index = plan.backlog.indexOf(code)
  if (index !== -1) return { semesterId: null, index }
  throw new PlanError(`Module "${code}" is not placed`)
}

/**
 * Moves a module to a semester (or the backlog when `targetSemesterId` is null).
 * `targetIndex` is the position in the target list after the module was removed from its old place;
 * omitted or out of range means the end.
 */
export function moveModule(
  plan: Plan,
  code: string,
  targetSemesterId: string | null,
  targetIndex?: number,
): Plan {
  findModule(plan, code)
  if (targetSemesterId !== null && !plan.semesters.some((s) => s.id === targetSemesterId)) {
    throw new PlanError(`Unknown semester "${targetSemesterId}"`)
  }

  const without = (codes: readonly string[]) => codes.filter((c) => c !== code)
  const insert = (codes: readonly string[]) => {
    const index = Math.max(0, Math.min(targetIndex ?? codes.length, codes.length))
    return [...codes.slice(0, index), code, ...codes.slice(index)]
  }

  return {
    ...plan,
    semesters: plan.semesters.map((semester) => {
      const codes = without(semester.moduleCodes)
      return { ...semester, moduleCodes: semester.id === targetSemesterId ? insert(codes) : codes }
    }),
    backlog: targetSemesterId === null ? insert(without(plan.backlog)) : without(plan.backlog),
  }
}

/** What a student can enter for a module in guest mode. One field, one attempt. */
export type ResultEntry =
  | { kind: 'open' }
  | { kind: 'graded'; grade: number }
  | { kind: 'passed' }
  | { kind: 'failed' }

export function currentResult(module: PlanModule): ResultEntry {
  const attempt = module.attempts.at(-1)
  if (!attempt) return { kind: 'open' }
  if (attempt.grade !== undefined) return { kind: 'graded', grade: attempt.grade }
  if (attempt.result === 'passed') return { kind: 'passed' }
  if (attempt.result === 'failed') return { kind: 'failed' }
  return { kind: 'open' }
}

/**
 * Replaces a module's attempts with a single attempt matching the entry.
 * Multi-attempt tracking and attempt policies come in a later milestone.
 */
export function setModuleResult(plan: Plan, code: string, entry: ResultEntry): Plan {
  const module = findModule(plan, code)
  let attempts: Attempt[]

  switch (entry.kind) {
    case 'open':
      attempts = []
      break
    case 'graded':
      if (module.grading !== 'graded') throw new PlanError(`Module "${code}" is not graded`)
      if (!plan.rules.allowedValues.includes(entry.grade)) {
        throw new PlanError(`Grade ${entry.grade} is not allowed for this plan`)
      }
      attempts = [
        {
          attemptNo: 1,
          result: entry.grade <= plan.rules.passThreshold ? 'passed' : 'failed',
          grade: entry.grade,
        },
      ]
      break
    case 'passed':
    case 'failed':
      if (module.grading !== 'pass_fail') throw new PlanError(`Module "${code}" needs a grade`)
      attempts = [{ attemptNo: 1, result: entry.kind }]
      break
  }

  return { ...plan, modules: plan.modules.map((m) => (m.code === code ? { ...m, attempts } : m)) }
}

export function addSemester(plan: Plan): Plan {
  const highest = plan.semesters.reduce((max, semester) => {
    const match = /^s(\d+)$/.exec(semester.id)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return {
    ...plan,
    semesters: [...plan.semesters, { id: `s${highest + 1}`, kind: 'regular', moduleCodes: [] }],
  }
}

/** Removes the last semester. Its modules move to the end of the backlog. */
export function removeLastSemester(plan: Plan): Plan {
  const last = plan.semesters.at(-1)
  if (!last || plan.semesters.length === 1) throw new PlanError('A plan needs at least one semester')
  return {
    ...plan,
    semesters: plan.semesters.slice(0, -1),
    backlog: [...plan.backlog, ...last.moduleCodes],
  }
}
