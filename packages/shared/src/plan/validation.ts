import { isModulePassed } from '../engine/progress.ts'
import { toHalves } from '../engine/units.ts'
import { type Prerequisite, prerequisiteCodes } from '../schema/preset.ts'
import type { Plan } from './plan.ts'
import { addTerms, type Term } from './terms.ts'

/** Something about a plan the student should look at. Warnings need action, infos are expected while planning. */
export type PlanIssue =
  | {
      kind: 'wrong_term'
      severity: 'warning'
      code: string
      semesterId: string
      offering: 'winter' | 'summer'
      term: Term
    }
  | { kind: 'irregular_offering'; severity: 'info'; code: string; semesterId: string }
  | {
      kind: 'missing_prerequisite'
      severity: 'warning'
      code: string
      semesterId: string
      /** Prerequisites that are neither passed nor planned in an earlier semester. */
      missing: Prerequisite[]
    }
  | {
      kind: 'not_enough_credits'
      severity: 'warning'
      code: string
      semesterId: string
      required: number
      /** Credits passed or planned in earlier semesters. */
      available: number
    }
  | { kind: 'area_below_minimum'; severity: 'info'; areaId: string; planned: number; minCredits: number }
  | { kind: 'area_above_maximum'; severity: 'warning'; areaId: string; planned: number; maxCredits: number }

/**
 * Checks placement rules. Modules that are already passed are never flagged: what happened is a fact,
 * even if it broke a planning rule. Modules in earlier semesters are assumed to be passed by then.
 */
export function validatePlan(plan: Plan): PlanIssue[] {
  const modules = new Map(plan.modules.map((module) => [module.code, module]))
  const passed = new Set(
    plan.modules.filter((module) => isModulePassed(module, plan.rules)).map((m) => m.code),
  )
  const semesterOf = new Map<string, number>()
  plan.semesters.forEach((semester, index) => {
    for (const code of semester.moduleCodes) semesterOf.set(code, index)
  })
  const issues: PlanIssue[] = []

  plan.semesters.forEach((semester, index) => {
    const term = addTerms(plan.startTerm, index)
    const doneBefore = (code: string) =>
      passed.has(code) || (semesterOf.get(code) ?? Number.POSITIVE_INFINITY) < index

    for (const code of semester.moduleCodes) {
      const module = modules.get(code)
      if (!module || passed.has(code)) continue

      if ((module.offering === 'winter' || module.offering === 'summer') && module.offering !== term.season) {
        issues.push({
          kind: 'wrong_term',
          severity: 'warning',
          code,
          semesterId: semester.id,
          offering: module.offering,
          term,
        })
      } else if (module.offering === 'irregular') {
        issues.push({ kind: 'irregular_offering', severity: 'info', code, semesterId: semester.id })
      }

      const missing = (module.prerequisites ?? []).filter(
        (prerequisite) => !prerequisiteCodes(prerequisite).some(doneBefore),
      )
      if (missing.length > 0) {
        issues.push({
          kind: 'missing_prerequisite',
          severity: 'warning',
          code,
          semesterId: semester.id,
          missing,
        })
      }

      if (module.requiresCredits !== undefined) {
        let halves = 0
        for (const other of plan.modules) {
          if (other.code !== code && doneBefore(other.code)) halves += toHalves(other.credits)
        }
        if (halves < toHalves(module.requiresCredits)) {
          issues.push({
            kind: 'not_enough_credits',
            severity: 'warning',
            code,
            semesterId: semester.id,
            required: module.requiresCredits,
            available: halves / 2,
          })
        }
      }
    }
  })

  const counted = new Set([...plan.semesters.flatMap((semester) => semester.moduleCodes), ...passed])
  for (const area of plan.areas) {
    let halves = 0
    for (const code of area.moduleCodes) {
      const module = modules.get(code)
      if (module && counted.has(code)) halves += toHalves(module.credits)
    }
    const planned = halves / 2
    if (planned < area.minCredits) {
      issues.push({
        kind: 'area_below_minimum',
        severity: 'info',
        areaId: area.id,
        planned,
        minCredits: area.minCredits,
      })
    } else if (area.maxCredits !== undefined && planned > area.maxCredits) {
      issues.push({
        kind: 'area_above_maximum',
        severity: 'warning',
        areaId: area.id,
        planned,
        maxCredits: area.maxCredits,
      })
    }
  }

  return issues
}
