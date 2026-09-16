import { isModulePassed } from '../engine/progress.ts'
import { toHalves } from '../engine/units.ts'
import { type Prerequisite, prerequisiteCodes } from '../schema/preset.ts'
import { placeholderCredits } from './placeholders.ts'
import { countsForDegree, type Plan } from './plan.ts'

/** Admission forecast for a module that needs a minimum of earned credits, usually the thesis. */
export interface CreditRequirement {
  code: string
  name: string
  requiredCredits: number
  /** Credits of passed modules, not counting the module itself. */
  earnedCredits: number
  passed: boolean
  eligibleNow: boolean
  /** Index of the semester the module is planned in, null when it is not placed. */
  plannedIndex: number | null
  /**
   * First semester index at whose start passed modules plus modules planned in earlier semesters reach the
   * requirement. Equals the number of semesters when only the complete plan gets there, null when it never does.
   */
  eligibleFromIndex: number | null
  /** Prerequisites that are not passed yet. */
  openPrerequisites: Prerequisite[]
}

export function creditRequirements(plan: Plan): CreditRequirement[] {
  const passed = new Set(
    plan.modules.filter((module) => isModulePassed(module, plan.rules)).map((module) => module.code),
  )
  const semesterOf = new Map<string, number>()
  plan.semesters.forEach((semester, index) => {
    for (const code of semester.moduleCodes) semesterOf.set(code, index)
  })

  const estimates = placeholderCredits(plan)
  return plan.modules
    .filter((module) => module.requiresCredits !== undefined && !module.retired && countsForDegree(module))
    .map((module) => {
      const required = toHalves(module.requiresCredits ?? 0)
      let earned = 0
      /** Credits of open modules by the semester they are planned in. */
      const plannedBySemester = plan.semesters.map(() => 0)
      for (const other of plan.modules) {
        // Self-study modules bring no credits, so they never help toward an admission requirement.
        if (other.code === module.code || !countsForDegree(other)) continue
        if (passed.has(other.code)) earned += toHalves(other.credits)
        else {
          const index = semesterOf.get(other.code)
          if (index !== undefined)
            plannedBySemester[index] = (plannedBySemester[index] ?? 0) + toHalves(other.credits)
        }
      }

      plan.semesters.forEach((semester, index) => {
        for (const id of semester.moduleCodes) {
          const estimate = estimates.get(id)
          if (estimate !== undefined)
            plannedBySemester[index] = (plannedBySemester[index] ?? 0) + toHalves(estimate)
        }
      })
      let eligibleFromIndex: number | null = null
      let available = earned
      for (let index = 0; index <= plan.semesters.length; index++) {
        if (available >= required) {
          eligibleFromIndex = index
          break
        }
        available += plannedBySemester[index] ?? 0
      }

      return {
        code: module.code,
        name: module.name,
        requiredCredits: required / 2,
        earnedCredits: earned / 2,
        passed: passed.has(module.code),
        eligibleNow: earned >= required,
        plannedIndex: semesterOf.get(module.code) ?? null,
        eligibleFromIndex,
        openPrerequisites: (module.prerequisites ?? []).filter(
          (prerequisite) => !prerequisiteCodes(prerequisite).some((code) => passed.has(code)),
        ),
      }
    })
}
