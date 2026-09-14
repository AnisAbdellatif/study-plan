import { isModulePassed } from '../engine/progress.ts'
import { toHalves } from '../engine/units.ts'
import { prerequisiteCodes } from '../schema/preset.ts'
import { SEMESTER_KIND_WEIGHT } from './forecast.ts'
import { insertSemester } from './operations.ts'
import { choiceOptionCodes, placeholderCredits } from './placeholders.ts'
import type { Plan, PlanModule, PlanSemester } from './plan.ts'
import { addTerms } from './terms.ts'

export const DEFAULT_CREDITS_PER_SEMESTER = 30
/** The most semesters a plan may have, see planSchema. */
const MAX_SEMESTERS = 20

export interface SuggestPlanOptions {
  /** First semester the suggestion may change, usually the current one. Earlier semesters stay as they are. */
  fromSemesterIndex: number
  /** Credits per full-time semester; part-time semesters get half, leave semesters none. */
  creditsPerSemester?: number
  /** Also place required modules that are not planned yet. Electives and choice options stay unplanned. */
  includeUnplanned?: boolean
}

export interface PlanSuggestion {
  plan: Plan
  /** Modules that end up in another semester than before, including ones that were unplanned. */
  moved: string[]
  /** Modules that fit into no semester within the maximum number; they stay or become unplanned. */
  unplaced: string[]
}

/**
 * Spreads the open modules over the semesters from `fromSemesterIndex` on. Each module goes to the earliest
 * semester that offers it in the right term, comes after its prerequisites, meets its credit requirement and has
 * room within the credit target; a module larger than the target gets a semester to itself. Passed modules,
 * placeholders and earlier semesters stay where they are. Semesters are added when needed and empty ones at the
 * end removed, down to the Regelstudienzeit.
 */
export function suggestPlan(plan: Plan, options: SuggestPlanOptions): PlanSuggestion {
  const target = toHalves(options.creditsPerSemester ?? DEFAULT_CREDITS_PER_SEMESTER)
  const from = Math.max(0, Math.min(options.fromSemesterIndex, plan.semesters.length))
  const modules = new Map(plan.modules.map((module) => [module.code, module]))
  const passed = new Set(
    plan.modules.filter((module) => isModulePassed(module, plan.rules)).map((module) => module.code),
  )
  const estimates = placeholderCredits(plan)
  const halvesOf = (code: string): number => {
    const estimate = estimates.get(code)
    return estimate !== undefined ? toHalves(estimate) : toHalves(modules.get(code)?.credits ?? 0)
  }

  const originalIndex = new Map<string, number>()
  plan.semesters.forEach((semester, index) => {
    for (const code of semester.moduleCodes) originalIndex.set(code, index)
  })

  const candidates: PlanModule[] = []
  for (const semester of plan.semesters.slice(from)) {
    for (const code of semester.moduleCodes) {
      const module = modules.get(code)
      if (module && !passed.has(code)) candidates.push(module)
    }
  }
  if (options.includeUnplanned) {
    const choices = new Set([...choiceOptionCodes(plan).values()].flat())
    for (const code of plan.backlog) {
      const module = modules.get(code)
      if (
        module &&
        !passed.has(code) &&
        !module.elective &&
        !module.custom &&
        !module.retired &&
        !choices.has(code)
      )
        candidates.push(module)
    }
  }
  const candidateCodes = new Set(candidates.map((module) => module.code))

  let semesters: PlanSemester[] = plan.semesters.map((semester, index) =>
    index < from
      ? semester
      : { ...semester, moduleCodes: semester.moduleCodes.filter((code) => !candidateCodes.has(code)) },
  )
  /** Where everything that is not a candidate sits, and later where candidates were placed. */
  const placedAt = new Map<string, number>()
  semesters.forEach((semester, index) => {
    for (const code of semester.moduleCodes) placedAt.set(code, index)
  })
  const load = semesters.map((semester) =>
    semester.moduleCodes.reduce((sum, code) => sum + (passed.has(code) ? 0 : halvesOf(code)), 0),
  )
  let earned = 0
  for (const code of passed) earned += halvesOf(code)
  const creditsBefore = (index: number): number => {
    let halves = earned
    for (const [code, at] of placedAt) if (at < index && !passed.has(code)) halves += halvesOf(code)
    return halves
  }

  // Credit-gated modules (usually the thesis) last, then by recommended semester, then as they were on the board.
  const position = (module: PlanModule) => candidates.indexOf(module)
  const ranked = [...candidates].sort(
    (a, b) =>
      Number(a.requiresCredits !== undefined) - Number(b.requiresCredits !== undefined) ||
      (a.typicalSemester ?? 99) - (b.typicalSemester ?? 99) ||
      position(a) - position(b),
  )
  // A module waits for candidates it depends on, unless a prerequisite choice is already passed or placed.
  const ordered: PlanModule[] = []
  const done = new Set<string>()
  const pending = [...ranked]
  const ready = (module: PlanModule) =>
    (module.prerequisites ?? []).every((prerequisite) => {
      const choices = prerequisiteCodes(prerequisite)
      if (
        choices.some(
          (code) => passed.has(code) || done.has(code) || (placedAt.has(code) && !candidateCodes.has(code)),
        )
      )
        return true
      return !choices.some((code) => candidateCodes.has(code))
    })
  while (pending.length > 0) {
    const index = pending.findIndex(ready)
    // A prerequisite cycle can't be resolved; take the next module in rank order.
    const [next] = pending.splice(index === -1 ? 0 : index, 1)
    if (!next) break
    ordered.push(next)
    done.add(next.code)
  }

  const unplaced: string[] = []
  for (const module of ordered) {
    const credits = toHalves(module.credits)
    let earliest = from
    for (const prerequisite of module.prerequisites ?? []) {
      const choices = prerequisiteCodes(prerequisite)
      if (choices.some((code) => passed.has(code))) continue
      const at = choices
        .map((code) => placedAt.get(code))
        .filter((index): index is number => index !== undefined)
      if (at.length > 0) earliest = Math.max(earliest, Math.min(...at) + 1)
    }

    let chosen = -1
    for (let index = earliest; index < MAX_SEMESTERS; index++) {
      if (index >= semesters.length) {
        semesters = insertSemester({ ...plan, semesters }, semesters.length).semesters
        load.push(0)
      }
      const semester = semesters[index]
      if (!semester) break
      const capacity = target * SEMESTER_KIND_WEIGHT[semester.kind]
      if (capacity === 0) continue
      const season = addTerms(plan.startTerm, index).season
      if ((module.offering === 'winter' || module.offering === 'summer') && module.offering !== season)
        continue
      if ((load[index] ?? 0) > 0 && (load[index] ?? 0) + credits > capacity) continue
      if (module.requiresCredits !== undefined && creditsBefore(index) < toHalves(module.requiresCredits))
        continue
      chosen = index
      break
    }
    if (chosen === -1) {
      unplaced.push(module.code)
      continue
    }
    semesters = semesters.map((semester, index) =>
      index === chosen ? { ...semester, moduleCodes: [...semester.moduleCodes, module.code] } : semester,
    )
    load[chosen] = (load[chosen] ?? 0) + credits
    placedAt.set(module.code, chosen)
  }

  const keep = Math.max(from, plan.preset.standardSemesters, 1)
  while (semesters.length > keep && semesters.at(-1)?.moduleCodes.length === 0)
    semesters = semesters.slice(0, -1)

  const unplacedSet = new Set(unplaced)
  const backlog = [
    ...plan.backlog.filter((code) => !candidateCodes.has(code) || unplacedSet.has(code)),
    ...unplaced.filter((code) => !plan.backlog.includes(code)),
  ]
  const moved = ordered
    .map((module) => module.code)
    .filter((code) => !unplacedSet.has(code) && originalIndex.get(code) !== placedAt.get(code))

  return { plan: { ...plan, semesters, backlog }, moved, unplaced }
}
