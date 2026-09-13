import type { Attempt } from '../engine/compute.ts'
import { isPlaceholderId, type Plan, type PlanModule } from './plan.ts'

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
  if (isPlaceholderId(code)) {
    if (!plan.placeholders?.some((placeholder) => placeholder.id === code)) {
      throw new PlanError(`Unknown placeholder "${code}"`)
    }
    // A placeholder moved out of the semesters is simply gone.
    if (targetSemesterId === null) return removePlaceholderEntry(plan, code)
  } else {
    findModule(plan, code)
  }
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

/** Replaces a module's attempts with a single attempt matching the entry. See `setModuleAttempts` for several. */
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
  return insertSemester(plan, plan.semesters.length)
}

/** A semester id no semester has yet. Ids stay with their semester when semesters are moved. */
function nextSemesterId(plan: Plan): string {
  const highest = plan.semesters.reduce((max, semester) => {
    const match = /^s(\d+)$/.exec(semester.id)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `s${highest + 1}`
}

/**
 * Inserts an empty semester at `index` (0 = before the first, length = after the last). Terms follow the position,
 * so the semesters after it start one term later.
 */
export function insertSemester(plan: Plan, index: number): Plan {
  if (!Number.isInteger(index) || index < 0 || index > plan.semesters.length) {
    throw new PlanError(`Invalid semester position ${index}`)
  }
  const semesters = [...plan.semesters]
  semesters.splice(index, 0, { id: nextSemesterId(plan), kind: 'regular', moduleCodes: [] })
  return { ...plan, semesters }
}

/** Moves a semester with everything in it to `toIndex`; the other semesters close the gap. */
export function moveSemester(plan: Plan, semesterId: string, toIndex: number): Plan {
  const from = plan.semesters.findIndex((semester) => semester.id === semesterId)
  if (from === -1) throw new PlanError(`Unknown semester "${semesterId}"`)
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= plan.semesters.length) {
    throw new PlanError(`Invalid semester position ${toIndex}`)
  }
  if (from === toIndex) return plan
  const semesters = [...plan.semesters]
  const [moved] = semesters.splice(from, 1)
  if (moved) semesters.splice(toIndex, 0, moved)
  return { ...plan, semesters }
}

/**
 * Removes a semester. Its modules move to the end of the backlog; its placeholders are dropped, because a
 * placeholder only exists inside a semester.
 */
export function removeSemester(plan: Plan, semesterId: string): Plan {
  const target = plan.semesters.find((semester) => semester.id === semesterId)
  if (!target) throw new PlanError(`Unknown semester "${semesterId}"`)
  if (plan.semesters.length === 1) throw new PlanError('A plan needs at least one semester')
  const removedPlaceholders = new Set(target.moduleCodes.filter(isPlaceholderId))
  return {
    ...plan,
    semesters: plan.semesters.filter((semester) => semester.id !== semesterId),
    backlog: [...plan.backlog, ...target.moduleCodes.filter((code) => !isPlaceholderId(code))],
    ...(plan.placeholders
      ? { placeholders: plan.placeholders.filter((placeholder) => !removedPlaceholders.has(placeholder.id)) }
      : {}),
  }
}

/** Removes the last semester. Its modules move to the end of the backlog. */
export function removeLastSemester(plan: Plan): Plan {
  const last = plan.semesters.at(-1)
  if (!last || plan.semesters.length === 1) throw new PlanError('A plan needs at least one semester')
  return removeSemester(plan, last.id)
}

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Sets or clears a module's exam date. Dates are calendar dates, YYYY-MM-DD. */
export function setExamDate(plan: Plan, code: string, examDate: string | null): Plan {
  findModule(plan, code)
  if (examDate !== null && !isIsoDate(examDate)) throw new PlanError(`Invalid exam date "${examDate}"`)
  return {
    ...plan,
    modules: plan.modules.map((module) => {
      if (module.code !== code) return module
      const { examDate: _previous, ...rest } = module
      return examDate === null ? rest : { ...rest, examDate }
    }),
  }
}

/** Sets or clears the Zielschnitt used by the what-if analysis. */
export function setTargetGrade(plan: Plan, grade: number | null): Plan {
  if (grade !== null && !plan.rules.allowedValues.includes(grade)) {
    throw new PlanError(`Grade ${grade} is not allowed for this plan`)
  }
  const { targetGrade: _previous, ...rest } = plan
  return grade === null ? rest : { ...rest, targetGrade: grade }
}

/** Removes a placeholder from its semester and from the plan. */
export function removePlaceholderEntry(plan: Plan, id: string): Plan {
  const placeholders = (plan.placeholders ?? []).filter((placeholder) => placeholder.id !== id)
  return {
    ...plan,
    placeholders,
    semesters: plan.semesters.map((semester) => ({
      ...semester,
      moduleCodes: semester.moduleCodes.filter((code) => code !== id),
    })),
  }
}
