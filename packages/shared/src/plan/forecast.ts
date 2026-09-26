import { isModulePassed } from '../engine/progress.ts'
import { toHalves } from '../engine/units.ts'
import { countedCreditHalves } from './counted-credits.ts'
import { placeholderCredits } from './placeholders.ts'
import type { Plan, PlanSemester } from './plan.ts'
import { addTerms, type Term } from './terms.ts'

/** How much of a full-time semester's workload a semester of this kind carries. */
export const SEMESTER_KIND_WEIGHT: Readonly<Record<PlanSemester['kind'], number>> = {
  regular: 1,
  abroad: 1,
  part_time: 0.5,
  leave: 0,
}

export interface FinishEstimate {
  /** Zero-based semester index of the last semester. */
  index: number
  term: Term
  /** Semesters up to and including the last one that count as Fachsemester: every kind except leave. */
  subjectSemesters: number
  /** Part-time semesters among them; some universities count those as half a Fachsemester. */
  partTimeSemesters: number
  /** Fachsemester beyond the Regelstudienzeit, 0 when within it. */
  overStandard: number
}

export interface GraduationForecast {
  /** Regelstudienzeit in semesters. */
  standardSemesters: number
  requiredCredits: number
  earnedCredits: number
  /** Credits of open modules and placeholder estimates placed in semesters. */
  plannedCredits: number
  /** Credits the plan still lacks to reach the required total; 0 when passed and planned modules are enough. */
  missingCredits: number
  /** The plan as laid out: it ends with its last semester that holds modules. Null for an empty plan. */
  planned: FinishEstimate | null
  /**
   * The finish at the pace of the semesters so far (passed credits per full-time semester). Null before a semester
   * is over, without passed credits, or once the required credits are passed.
   */
  atPace: (FinishEstimate & { creditsPerSemester: number }) | null
  /** The required credits are passed. */
  done: boolean
}

const MAX_PACE_SEMESTERS = 40

export interface ForecastOptions {
  /** Zero-based index of the semester running now (see `semesterIndexAt`); needed for the pace estimate. */
  currentSemesterIndex?: number
}

export function graduationForecast(plan: Plan, options: ForecastOptions = {}): GraduationForecast {
  const passed = new Set(
    plan.modules.filter((module) => isModulePassed(module, plan.rules)).map((module) => module.code),
  )
  // Self-study modules never reach the required credits, and a group of undecided options counts once.
  const credits = countedCreditHalves(plan)
  const estimates = placeholderCredits(plan)

  let earned = 0
  for (const code of passed) earned += credits.get(code) ?? 0
  let planned = 0
  for (const semester of plan.semesters) {
    for (const code of semester.moduleCodes) {
      const estimate = estimates.get(code)
      if (estimate !== undefined) planned += toHalves(estimate)
      else if (!passed.has(code)) planned += credits.get(code) ?? 0
    }
  }
  const required = toHalves(plan.preset.totalCredits)
  const standard = plan.preset.standardSemesters
  // Semesters beyond the plan are assumed to be regular ones.
  const kindAt = (index: number): PlanSemester['kind'] => plan.semesters[index]?.kind ?? 'regular'

  const estimateAt = (index: number): FinishEstimate => {
    let subjectSemesters = 0
    let partTimeSemesters = 0
    for (let i = 0; i <= index; i++) {
      const kind = kindAt(i)
      if (kind !== 'leave') subjectSemesters++
      if (kind === 'part_time') partTimeSemesters++
    }
    return {
      index,
      term: addTerms(plan.startTerm, index),
      subjectSemesters,
      partTimeSemesters,
      overStandard: Math.max(0, subjectSemesters - standard),
    }
  }

  let last = -1
  plan.semesters.forEach((semester, index) => {
    if (semester.moduleCodes.length > 0) last = index
  })

  const done = earned >= required
  let atPace: GraduationForecast['atPace'] = null
  const current = options.currentSemesterIndex
  if (!done && current !== undefined && current > 0 && earned > 0) {
    let elapsed = 0
    for (let index = 0; index < current; index++) elapsed += SEMESTER_KIND_WEIGHT[kindAt(index)]
    if (elapsed > 0) {
      const perSemester = earned / elapsed
      let remaining = required - earned
      let index = current
      for (; index < current + MAX_PACE_SEMESTERS; index++) {
        remaining -= perSemester * SEMESTER_KIND_WEIGHT[kindAt(index)]
        if (remaining <= 0) break
      }
      // Halves per semester to credits with one decimal.
      atPace = { ...estimateAt(index), creditsPerSemester: Math.round(perSemester * 5) / 10 }
    }
  }

  return {
    standardSemesters: standard,
    requiredCredits: required / 2,
    earnedCredits: earned / 2,
    plannedCredits: planned / 2,
    missingCredits: Math.max(0, required - earned - planned) / 2,
    planned: last === -1 ? null : estimateAt(last),
    atPace,
    done,
  }
}
