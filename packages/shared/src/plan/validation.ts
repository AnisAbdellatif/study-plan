import { isModulePassed } from '../engine/progress.ts'
import { toHalves } from '../engine/units.ts'
import { type Prerequisite, prerequisiteCodes } from '../schema/preset.ts'
import { attemptStatus } from './attempts.ts'
import { placeholderCredits } from './placeholders.ts'
import type { Plan } from './plan.ts'
import { addTerms, type Term } from './terms.ts'

/** Why a planned prerequisite blocks a module: its semester is over without a pass, or no attempt is left. */
export type PrerequisiteBlockReason = 'semester_over' | 'exhausted'

export interface ValidationOptions {
  /**
   * Zero-based index of the semester running now (see `semesterIndexAt`). Needed to tell that a prerequisite's
   * semester is over; without it only exhausted attempts are detected.
   */
  currentSemesterIndex?: number
}

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
  | { kind: 'attempts_exhausted'; severity: 'warning'; code: string; maxAttempts: number }
  | {
      kind: 'last_attempt'
      severity: 'warning'
      code: string
      maxAttempts: number
      /** A failed Klausur in the last attempt is followed by a supplementary oral exam. */
      supplementaryExam: boolean
    }
  | { kind: 'retaken_after_pass'; severity: 'warning'; code: string }
  | {
      kind: 'prerequisite_not_passed'
      severity: 'error'
      code: string
      semesterId: string
      /** Prerequisites planned in an earlier semester that did not end in a pass and no longer can in time. */
      blocked: { code: string; reason: PrerequisiteBlockReason }[]
    }
  | { kind: 'area_below_minimum'; severity: 'info'; areaId: string; planned: number; minCredits: number }
  | { kind: 'area_above_maximum'; severity: 'warning'; areaId: string; planned: number; maxCredits: number }

/**
 * Checks placement rules. Modules that are already passed are never flagged: what happened is a fact,
 * even if it broke a planning rule. Modules in earlier semesters are assumed to be passed by then.
 */
export function validatePlan(plan: Plan, options: ValidationOptions = {}): PlanIssue[] {
  const modules = new Map(plan.modules.map((module) => [module.code, module]))
  const passed = new Set(
    plan.modules.filter((module) => isModulePassed(module, plan.rules)).map((m) => m.code),
  )
  const semesterOf = new Map<string, number>()
  plan.semesters.forEach((semester, index) => {
    for (const code of semester.moduleCodes) semesterOf.set(code, index)
  })
  const issues: PlanIssue[] = []
  const current = options.currentSemesterIndex
  const estimates = placeholderCredits(plan)

  /** Null while the prerequisite can still be passed before the module's semester. */
  const blockReason = (code: string): PrerequisiteBlockReason | null => {
    const prerequisite = modules.get(code)
    if (!prerequisite) return null
    if (attemptStatus(prerequisite, plan).exhausted) return 'exhausted'
    const planned = semesterOf.get(code)
    return current !== undefined && planned !== undefined && planned < current ? 'semester_over' : null
  }

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

      const missing: Prerequisite[] = []
      const blocked: { code: string; reason: PrerequisiteBlockReason }[] = []
      for (const prerequisite of module.prerequisites ?? []) {
        const choices = prerequisiteCodes(prerequisite)
        if (choices.some((choice) => passed.has(choice))) continue
        const earlier = choices.filter(
          (choice) => (semesterOf.get(choice) ?? Number.POSITIVE_INFINITY) < index,
        )
        if (earlier.length === 0) {
          missing.push(prerequisite)
          continue
        }
        const reasons = earlier.map((choice) => ({ code: choice, reason: blockReason(choice) }))
        // Blocked only when every choice planned earlier is out; one that can still be passed is enough.
        if (reasons.every((item) => item.reason !== null)) {
          for (const item of reasons) if (item.reason) blocked.push({ code: item.code, reason: item.reason })
        }
      }
      if (missing.length > 0) {
        issues.push({
          kind: 'missing_prerequisite',
          severity: 'warning',
          code,
          semesterId: semester.id,
          missing,
        })
      }

      if (blocked.length > 0) {
        issues.push({
          kind: 'prerequisite_not_passed',
          severity: 'error',
          code,
          semesterId: semester.id,
          blocked,
        })
      }

      if (module.requiresCredits !== undefined) {
        let halves = 0
        for (const other of plan.modules) {
          if (other.code !== code && doneBefore(other.code)) halves += toHalves(other.credits)
        }
        // Placeholders in earlier semesters stand for modules the student will choose there.
        plan.semesters.slice(0, index).forEach((earlier) => {
          for (const id of earlier.moduleCodes) halves += toHalves(estimates.get(id) ?? 0)
        })
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

  for (const module of plan.modules) {
    const status = attemptStatus(module, plan)
    const { code } = module
    if (status.exhausted && status.maxAttempts !== null) {
      issues.push({ kind: 'attempts_exhausted', severity: 'warning', code, maxAttempts: status.maxAttempts })
    } else if (status.lastAttempt && status.maxAttempts !== null) {
      issues.push({
        kind: 'last_attempt',
        severity: 'warning',
        code,
        maxAttempts: status.maxAttempts,
        supplementaryExam: plan.preset.supplementaryExamOnLastAttempt === true,
      })
    }
    if (status.retakenAfterPass) issues.push({ kind: 'retaken_after_pass', severity: 'warning', code })
  }

  const counted = new Set([...plan.semesters.flatMap((semester) => semester.moduleCodes), ...passed])
  for (const area of plan.areas) {
    let halves = 0
    for (const code of area.moduleCodes) {
      const module = modules.get(code)
      if (module && counted.has(code)) halves += toHalves(module.credits)
    }
    for (const placeholder of plan.placeholders ?? []) {
      if (placeholder.areaId === area.id) halves += toHalves(estimates.get(placeholder.id) ?? 0)
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
