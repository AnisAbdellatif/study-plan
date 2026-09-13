import { effectiveGradeTenths, type ModuleRecord, type RulesForAttempts } from './compute.ts'
import { toHalves } from './units.ts'

export interface CreditProgress {
  /** Credits of all passed modules, graded or not. */
  earnedCredits: number
  /** Credits of passed graded modules. */
  gradedCredits: number
  requiredCredits: number
}

export function isModulePassed(record: ModuleRecord, rules: RulesForAttempts): boolean {
  if (record.grading === 'pass_fail') return record.attempts.some((attempt) => attempt.result === 'passed')
  return effectiveGradeTenths(record, rules) !== null
}

export function computeCreditProgress(
  records: Iterable<ModuleRecord>,
  rules: RulesForAttempts,
  requiredCredits: number,
): CreditProgress {
  let earnedHalves = 0
  let gradedHalves = 0
  for (const record of records) {
    if (!isModulePassed(record, rules)) continue
    const halves = toHalves(record.credits)
    earnedHalves += halves
    if (record.grading === 'graded') gradedHalves += halves
  }
  return { earnedCredits: earnedHalves / 2, gradedCredits: gradedHalves / 2, requiredCredits }
}
