import { computeOverall, type ModuleRecord } from '../engine/compute.ts'
import { isModulePassed } from '../engine/progress.ts'
import { gradeToTenths, toHalves } from '../engine/units.ts'
import type { Plan } from './plan.ts'

export interface WhatIfTarget {
  grade: number
  reachable: boolean
  /**
   * The worst grade that, written in every open module, still reaches the target.
   * Null when the target is unreachable or nothing is open.
   */
  requiredGrade: number | null
}

export interface WhatIfAnalysis {
  /** Graded modules that count, are planned in a semester and are not passed yet. */
  openCodes: string[]
  openCredits: number
  current: string | null
  /** Overall grade with the best grade in every open module. */
  bestCase: string | null
  /** Overall grade with a bare pass in every open module. */
  worstCase: string | null
  target: WhatIfTarget | null
}

/** "1.65" -> 165. Engine values have at most two decimals. */
const toHundredths = (value: string): number => {
  const [whole = '0', fraction = ''] = value.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2))
}

/**
 * Runs the real grade engine on hypothetical results, so truncation, groups and best-of rules all apply.
 * Assumes the same grade in every open module, which gives a clear answer to "what do I need on average".
 */
export function analyzeWhatIf(plan: Plan, targetGrade?: number): WhatIfAnalysis {
  const placed = new Set(plan.semesters.flatMap((semester) => semester.moduleCodes))
  const open = plan.modules.filter(
    (module) =>
      module.grading === 'graded' &&
      module.countsTowardAverage &&
      placed.has(module.code) &&
      !isModulePassed(module, plan.rules),
  )
  const openCodes = new Set(open.map((module) => module.code))
  const candidates = (plan.rules.standardGrades ?? plan.rules.allowedValues)
    .filter((grade) => grade <= plan.rules.passThreshold)
    .sort((a, b) => a - b)

  const withUniformGrade = (grade: number) =>
    computeOverall(
      plan.rules,
      plan.modules.map(
        (module): ModuleRecord =>
          openCodes.has(module.code)
            ? { ...module, attempts: [{ attemptNo: 1, result: 'passed', grade }] }
            : module,
      ),
    ).value

  const current = computeOverall(plan.rules, plan.modules).value
  const best = candidates[0]
  const worst = candidates.at(-1)
  const hasOpen = open.length > 0

  let target: WhatIfTarget | null = null
  if (targetGrade !== undefined) {
    const goal = gradeToTenths(targetGrade) * 10
    const meets = (value: string | null) => value !== null && toHundredths(value) <= goal
    if (!hasOpen) {
      target = { grade: targetGrade, reachable: meets(current), requiredGrade: null }
    } else {
      // The overall grade only gets worse as the uniform grade gets worse, so the first hit from the bottom is the answer.
      const requiredGrade = [...candidates].reverse().find((grade) => meets(withUniformGrade(grade))) ?? null
      target = { grade: targetGrade, reachable: requiredGrade !== null, requiredGrade }
    }
  }

  return {
    openCodes: [...openCodes],
    openCredits: open.reduce((sum, module) => sum + toHalves(module.credits), 0) / 2,
    current,
    bestCase: hasOpen && best !== undefined ? withUniformGrade(best) : current,
    worstCase: hasOpen && worst !== undefined ? withUniformGrade(worst) : current,
    target,
  }
}
