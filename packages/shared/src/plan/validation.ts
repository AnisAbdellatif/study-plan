import { isModulePassed } from '../engine/progress.ts'
import { toHalves } from '../engine/units.ts'
import { type Prerequisite, prerequisiteCodes } from '../schema/preset.ts'
import { inactiveAreaIds } from './area-choices.ts'
import { attemptStatus } from './attempts.ts'
import { countedCreditHalves } from './counted-credits.ts'
import { placeholderCredits } from './placeholders.ts'
import { countsForDegree, type Plan } from './plan.ts'
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
  | {
      kind: 'alternatives_conflict'
      severity: 'warning'
      group: string
      /** Planned or passed modules of the same alternative group; only one of them may be taken. */
      codes: string[]
    }
  | { kind: 'recognition_pending'; severity: 'info'; code: string; status: 'planned' | 'requested' }
  | { kind: 'recognition_rejected'; severity: 'warning'; code: string }
  /** Recognition approved, but the recognised result is not entered yet, so the credits don't count. */
  | { kind: 'recognition_without_result'; severity: 'warning'; code: string }
  /** Open modules in an Urlaubssemester, where many universities allow no or only some exams. */
  | { kind: 'leave_semester_modules'; severity: 'info'; semesterId: string; codes: string[] }
  | { kind: 'area_below_minimum'; severity: 'info'; areaId: string; planned: number; minCredits: number }
  | { kind: 'area_above_maximum'; severity: 'warning'; areaId: string; planned: number; maxCredits: number }
  /** A required area choice, e.g. the Nebenfach, has no pick yet, so its compulsory modules aren't open work yet. */
  | { kind: 'area_choice_missing'; severity: 'info'; choiceId: string }
  | {
      kind: 'area_choice_conflict'
      severity: 'warning'
      choiceId: string
      /** Areas of the choice with planned or passed modules besides the picked one, or all of them when none is. */
      areaIds: string[]
      chosenAreaId?: string
    }

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
  // Self-study modules count nowhere and a group of undecided options counts once.
  const counted = countedCreditHalves(plan)

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

    if (semester.kind === 'leave') {
      const open = semester.moduleCodes.filter((code) => modules.has(code) && !passed.has(code))
      if (open.length > 0) {
        issues.push({
          kind: 'leave_semester_modules',
          severity: 'info',
          semesterId: semester.id,
          codes: open,
        })
      }
    }

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
          if (other.code !== code && doneBefore(other.code) && countsForDegree(other))
            halves += counted.get(other.code) ?? 0
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

    const recognition = module.recognition
    if (recognition?.status === 'planned' || recognition?.status === 'requested') {
      issues.push({ kind: 'recognition_pending', severity: 'info', code, status: recognition.status })
    } else if (recognition?.status === 'rejected' && !passed.has(code)) {
      issues.push({ kind: 'recognition_rejected', severity: 'warning', code })
    } else if (recognition?.status === 'approved' && !passed.has(code)) {
      issues.push({ kind: 'recognition_without_result', severity: 'warning', code })
    }
  }

  const placedOrPassed = new Set([...plan.semesters.flatMap((semester) => semester.moduleCodes), ...passed])

  const groups = new Map<string, string[]>()
  for (const module of plan.modules) {
    if (!module.alternativeGroup || !placedOrPassed.has(module.code)) continue
    groups.set(module.alternativeGroup, [...(groups.get(module.alternativeGroup) ?? []), module.code])
  }
  for (const [group, codes] of groups) {
    if (codes.length > 1) issues.push({ kind: 'alternatives_conflict', severity: 'warning', group, codes })
  }

  const plannedByArea = new Map<string, number>()
  for (const area of plan.areas) {
    let halves = 0
    for (const code of area.moduleCodes) {
      const module = modules.get(code)
      // A module the student only wants to learn fills no area requirement.
      if (module && placedOrPassed.has(code)) halves += counted.get(code) ?? 0
    }
    for (const placeholder of plan.placeholders ?? []) {
      if (placeholder.areaId === area.id) halves += toHalves(estimates.get(placeholder.id) ?? 0)
    }
    plannedByArea.set(area.id, halves / 2)
  }

  const inactive = inactiveAreaIds(plan)
  for (const area of plan.areas) {
    // Areas of a choice the student didn't pick have no requirements; the choice issues below cover them.
    if (inactive.has(area.id)) continue
    const planned = plannedByArea.get(area.id) ?? 0
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

  for (const choice of plan.areaChoices ?? []) {
    const chosenAreaId = plan.chosenAreas?.[choice.id]
    const used = choice.areaIds.filter((areaId) => (plannedByArea.get(areaId) ?? 0) > 0)
    const conflicting =
      chosenAreaId === undefined
        ? used.length > 1
          ? used
          : []
        : used.filter((areaId) => areaId !== chosenAreaId)
    if (conflicting.length > 0) {
      issues.push({
        kind: 'area_choice_conflict',
        severity: 'warning',
        choiceId: choice.id,
        areaIds: conflicting,
        ...(chosenAreaId === undefined ? {} : { chosenAreaId }),
      })
    } else if (chosenAreaId === undefined && !choice.optional) {
      issues.push({ kind: 'area_choice_missing', severity: 'info', choiceId: choice.id })
    }
  }

  return issues
}
