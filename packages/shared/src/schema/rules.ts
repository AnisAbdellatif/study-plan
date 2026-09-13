import { z } from 'zod'
import { isMultipleOf } from '../engine/units.ts'

/** A single grade on the German scale. The admissible set is preset data, not hard-coded. */
export const gradeValueSchema = z
  .number()
  .min(1)
  .max(5)
  .refine((v) => isMultipleOf(v, 10), { message: 'Grades have at most one decimal place' })

/** Credits (ECTS / LP / CP) in whole or half steps. */
export const creditValueSchema = z
  .number()
  .nonnegative()
  .refine((v) => isMultipleOf(v, 2), { message: 'Credits must be whole or half numbers' })

export const roundingModeSchema = z.enum([
  'truncate',
  'round_half_up',
  'round_to_nearest_allowed_ties_better',
])

export const roundingSpecSchema = z.object({
  mode: roundingModeSchema,
  /** Decimal places. Ignored by `round_to_nearest_allowed_ties_better`, which always yields an allowed value. */
  precision: z.union([z.literal(1), z.literal(2)]),
})
export type RoundingSpec = z.infer<typeof roundingSpecSchema>

export const weightFactorSchema = z.union([z.literal(0), z.literal(0.5), z.literal(1), z.literal(2)])
export type WeightFactor = z.infer<typeof weightFactorSchema>

export interface CreditQuota {
  label?: string
  /** Module codes of this node that belong to the quota, e.g. one Vertiefung area. */
  codes: string[]
  minCredits: number
  maxCredits?: number
}

/**
 * Only the best-graded modules count, up to a credit limit. Models rules such as "the elective modules
 * with the best grades that are needed to reach the required credits" (e.g. LUH PO § 20 Abs. 1–2).
 * The module that crosses the limit still counts. Quotas reserve minimum credits per sub-area first.
 */
export interface KeepBestRule {
  maxCredits: number
  quotas?: CreditQuota[]
}

export interface ModuleChild {
  kind: 'module'
  code: string
  /** Multiplier on the module's weight, e.g. 2 for a double-weighted thesis. Defaults to 1. */
  factor?: WeightFactor
  /**
   * In `credits` mode: overrides the module's credits as its weight.
   * In `fixed` mode: required integer proportion, e.g. 15 for "15/161".
   */
  weight?: number
}

export interface GroupChild {
  kind: 'group'
  /**
   * In `credits` mode: fixed credit weight for the whole group; defaults to the credits counted inside it.
   * In `fixed` mode: required integer proportion.
   */
  weight?: number
  node: AggregationNode
}

export type AggregationChild = ModuleChild | GroupChild

export interface AggregationNode {
  id: string
  label?: string
  /** `credits`: weights are credits. `fixed`: weights are integer proportions given per child. */
  weightMode: 'credits' | 'fixed'
  /** Round this node's value before the parent uses it, e.g. truncated Fachnoten. */
  roundResult?: RoundingSpec
  /** Streichregel: drop the worst graded modules directly in this node, up to this many credits. */
  dropWorst?: { maxCredits: number }
  /** Best-of selection over the modules directly in this node. Cannot be combined with `dropWorst`. */
  keepBest?: KeepBestRule
  children: AggregationChild[]
}

const moduleChildSchema = z.object({
  kind: z.literal('module'),
  code: z.string().min(1),
  factor: weightFactorSchema.optional(),
  weight: z.number().positive().optional(),
})

const groupChildSchema = z.object({
  kind: z.literal('group'),
  weight: z.number().positive().optional(),
  get node() {
    return aggregationNodeSchema
  },
})

const creditQuotaSchema = z.object({
  label: z.string().optional(),
  codes: z.array(z.string().min(1)).min(1),
  minCredits: creditValueSchema,
  maxCredits: creditValueSchema.optional(),
})

const keepBestSchema = z.object({
  maxCredits: creditValueSchema,
  quotas: z.array(creditQuotaSchema).optional(),
})

export const aggregationNodeSchema: z.ZodType<AggregationNode> = z.lazy(() =>
  z
    .object({
      id: z.string().min(1),
      label: z.string().optional(),
      weightMode: z.enum(['credits', 'fixed']),
      roundResult: roundingSpecSchema.optional(),
      dropWorst: z.object({ maxCredits: creditValueSchema }).optional(),
      keepBest: keepBestSchema.optional(),
      children: z.array(z.discriminatedUnion('kind', [moduleChildSchema, groupChildSchema])).min(1),
    })
    .superRefine((node, ctx) => {
      node.children.forEach((child, index) => {
        const path = ['children', index, 'weight']
        if (node.weightMode === 'fixed') {
          if (child.weight === undefined || !Number.isInteger(child.weight)) {
            ctx.addIssue({
              code: 'custom',
              path,
              message: `Node "${node.id}" uses fixed weights, so every child needs an integer weight`,
            })
          }
        } else if (child.weight !== undefined && !isMultipleOf(child.weight, 2)) {
          ctx.addIssue({ code: 'custom', path, message: 'Credit weights must be whole or half numbers' })
        }
      })

      if (!node.keepBest) return
      if (node.dropWorst) {
        ctx.addIssue({
          code: 'custom',
          path: ['keepBest'],
          message: `Node "${node.id}" cannot use keepBest and dropWorst together`,
        })
      }
      const direct = new Set(node.children.flatMap((child) => (child.kind === 'module' ? [child.code] : [])))
      let minimums = 0
      node.keepBest.quotas?.forEach((quota, index) => {
        minimums += quota.minCredits
        if (quota.maxCredits !== undefined && quota.maxCredits < quota.minCredits) {
          ctx.addIssue({
            code: 'custom',
            path: ['keepBest', 'quotas', index],
            message: 'Quota maxCredits is below minCredits',
          })
        }
        for (const code of quota.codes) {
          if (!direct.has(code)) {
            ctx.addIssue({
              code: 'custom',
              path: ['keepBest', 'quotas', index, 'codes'],
              message: `Quota module "${code}" is not a direct module of node "${node.id}"`,
            })
          }
        }
      })
      if (minimums > node.keepBest.maxCredits) {
        ctx.addIssue({
          code: 'custom',
          path: ['keepBest', 'quotas'],
          message: 'Quota minimums exceed keepBest.maxCredits',
        })
      }
    }),
)

export const DEFAULT_ALLOWED_GRADES = [1.0, 1.3, 1.7, 2.0, 2.3, 2.7, 3.0, 3.3, 3.7, 4.0, 5.0]

export const gradeRulesSchema = z
  .object({
    /** Every grade a module can end up with, including composite module grades like 1.2. */
    allowedValues: z.array(gradeValueSchema).min(2),
    /**
     * The grade steps of a single exam. When set, grade pickers show these first and the remaining
     * allowed values as composite module grades.
     */
    standardGrades: z.array(gradeValueSchema).optional(),
    passThreshold: gradeValueSchema,
    /** Which passing attempt counts when a module has several (Notenverbesserung). */
    attemptSelection: z.enum(['best', 'latest']),
    finalRounding: roundingSpecSchema,
    aggregation: aggregationNodeSchema,
  })
  .superRefine((rules, ctx) => {
    if (new Set(rules.allowedValues).size !== rules.allowedValues.length) {
      ctx.addIssue({ code: 'custom', path: ['allowedValues'], message: 'Allowed values must be unique' })
    }
    if (!rules.allowedValues.includes(rules.passThreshold)) {
      ctx.addIssue({
        code: 'custom',
        path: ['passThreshold'],
        message: 'The pass threshold must be one of the allowed values',
      })
    }
    for (const grade of rules.standardGrades ?? []) {
      if (!rules.allowedValues.includes(grade)) {
        ctx.addIssue({
          code: 'custom',
          path: ['standardGrades'],
          message: `Standard grade ${grade} is not an allowed value`,
        })
      }
    }
  })

export type GradeRules = z.infer<typeof gradeRulesSchema>
