import { DEFAULT_ALLOWED_GRADES, type GradeRules, type RoundingSpec } from '../schema/rules.ts'
import type { ModuleRecord } from './compute.ts'

/** A graded module with one attempt per grade, in order. Grades above 4.0 are failed attempts. */
export function graded(code: string, credits: number, ...grades: number[]): ModuleRecord {
  return {
    code,
    credits,
    grading: 'graded',
    countsTowardAverage: true,
    attempts: grades.map((grade, index) => ({
      attemptNo: index + 1,
      result: grade <= 4 ? 'passed' : 'failed',
      grade,
    })),
  }
}

/** Credit-weighted rules over a flat list of modules. */
export function flatRules(
  codes: readonly string[],
  finalRounding: RoundingSpec = { mode: 'truncate', precision: 1 },
  overrides: Partial<GradeRules> = {},
): GradeRules {
  return {
    allowedValues: DEFAULT_ALLOWED_GRADES,
    passThreshold: 4,
    attemptSelection: 'best',
    finalRounding,
    aggregation: {
      id: 'root',
      weightMode: 'credits',
      children: codes.map((code) => ({ kind: 'module' as const, code })),
    },
    ...overrides,
  }
}
