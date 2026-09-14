import { z } from 'zod'
import { gradeValueSchema } from '../schema/rules.ts'
import type { Plan } from './plan.ts'

/**
 * The grades of a plan, taken out before the plan leaves the browser for the account. The browser encrypts them
 * (see `sealedGradesSchema`); everything else in the plan stays readable for the server.
 */
export const gradeSecretsSchema = z.object({
  targetGrade: gradeValueSchema.optional(),
  /** Module code, then attempt number, then grade. */
  grades: z.record(z.string(), z.record(z.string().regex(/^\d+$/), gradeValueSchema)),
})
export type GradeSecrets = z.infer<typeof gradeSecretsSchema>

const base64 = /^[A-Za-z0-9+/]+={0,2}$/

/** AES-GCM ciphertext of the JSON of `GradeSecrets`, base64 encoded. Only the student's browser holds the key. */
export const sealedGradesSchema = z.object({
  v: z.literal(1),
  iv: z.string().max(64).regex(base64),
  data: z.string().max(2_000_000).regex(base64),
})
export type SealedGrades = z.infer<typeof sealedGradesSchema>

/** True when the plan holds a grade or a target grade in plain text. */
export function planHasGrades(plan: Pick<Plan, 'modules' | 'targetGrade'>): boolean {
  return (
    plan.targetGrade !== undefined ||
    plan.modules.some((module) => module.attempts.some((attempt) => attempt.grade !== undefined))
  )
}

/**
 * Splits a plan into the plan without grades and the grades themselves. Attempts keep their result (passed,
 * failed, …), so the plan stays valid and credits still count; only the grade values and the target grade move.
 */
export function extractGrades(plan: Plan): { plan: Plan; secrets: GradeSecrets | null } {
  if (!planHasGrades(plan)) return { plan, secrets: null }
  const grades: GradeSecrets['grades'] = {}
  const modules = plan.modules.map((module) => {
    if (!module.attempts.some((attempt) => attempt.grade !== undefined)) return module
    const byAttempt: Record<string, number> = {}
    const attempts = module.attempts.map(({ grade, ...attempt }) => {
      if (grade !== undefined) byAttempt[String(attempt.attemptNo)] = grade
      return attempt
    })
    grades[module.code] = byAttempt
    return { ...module, attempts }
  })
  const { targetGrade, ...rest } = plan
  return {
    plan: { ...rest, modules },
    secrets: { ...(targetGrade === undefined ? {} : { targetGrade }), grades },
  }
}

/** Puts extracted grades back. Grades of modules or attempts the plan no longer has are dropped. */
export function mergeGrades(plan: Plan, secrets: GradeSecrets): Plan {
  const modules = plan.modules.map((module) => {
    const byAttempt = secrets.grades[module.code]
    if (!byAttempt) return module
    return {
      ...module,
      attempts: module.attempts.map((attempt) => {
        const grade = byAttempt[String(attempt.attemptNo)]
        return grade === undefined ? attempt : { ...attempt, grade }
      }),
    }
  })
  return {
    ...plan,
    modules,
    ...(secrets.targetGrade === undefined ? {} : { targetGrade: secrets.targetGrade }),
  }
}
