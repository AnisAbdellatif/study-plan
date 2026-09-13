import { z } from 'zod'
import { type AggregationNode, creditValueSchema, gradeRulesSchema } from './rules.ts'

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and dashes')

/** A prerequisite is a module code, or a group where any one of the listed modules suffices. */
export const prerequisiteSchema = z.union([
  z.string().min(1),
  z.object({ anyOf: z.array(z.string().min(1)).min(2) }),
])
export type Prerequisite = z.infer<typeof prerequisiteSchema>

export const presetModuleSchema = z.object({
  code: z.string().min(1),
  /** Kept verbatim from the Modulhandbuch. */
  name: z.string().min(1),
  credits: creditValueSchema,
  grading: z.enum(['graded', 'pass_fail']),
  /** False for Schlüsselqualifikationen, Zusatzleistungen and similar modules that never enter the average. */
  countsTowardAverage: z.boolean(),
  category: z.string().min(1),
  /** Turnus. `irregular` for modules without a fixed cycle. */
  offering: z.enum(['winter', 'summer', 'both', 'irregular']),
  typicalSemester: z.number().int().min(1).max(14).optional(),
  /** All listed prerequisites must be met. */
  prerequisites: z.array(prerequisiteSchema).optional(),
  /** Minimum earned credits before the module can be taken, e.g. 120 for a Bachelorarbeit. */
  requiresCredits: creditValueSchema.optional(),
})
export type PresetModule = z.infer<typeof presetModuleSchema>

export const presetAreaSchema = z.object({
  id: slugSchema,
  name: z.string().min(1),
  minCredits: creditValueSchema,
  maxCredits: creditValueSchema.optional(),
  moduleCodes: z.array(z.string()).min(1),
})
export type PresetArea = z.infer<typeof presetAreaSchema>

function* walkAggregation(node: AggregationNode): Generator<{ node: AggregationNode; code?: string }> {
  yield { node }
  for (const child of node.children) {
    if (child.kind === 'module') yield { node, code: child.code }
    else yield* walkAggregation(child.node)
  }
}

export const prerequisiteCodes = (prerequisite: Prerequisite): string[] =>
  typeof prerequisite === 'string' ? [prerequisite] : prerequisite.anyOf

export const presetSchema = z
  .object({
    $schema: z.string().optional(),
    schemaVersion: z.literal(1),
    /** "<university>/<programme>-<po-year>", matching the file path under presets/. */
    id: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
    university: z.object({ slug: slugSchema, name: z.string().min(1) }),
    programme: z.object({ slug: slugSchema, name: z.string().min(1), degree: z.enum(['bsc', 'msc']) }),
    poVersion: z.string().min(1),
    handbookVersion: z.string().min(1),
    standardSemesters: z.number().int().min(1).max(14),
    totalCredits: creditValueSchema,
    creditLabel: z.enum(['ECTS', 'LP', 'CP']),
    /** False when the module codes were made up for this preset because the university publishes none. */
    codesAreOfficial: z.boolean(),
    /** Exam procedure rules used for deadline reminders. */
    examRules: z
      .object({
        /** Withdrawal is possible until this many days before the exam. */
        withdrawalDaysBeforeExam: z.number().int().min(0).max(60).optional(),
      })
      .optional(),
    /** Free-text maintainer notes. JSON has no comments, so they live here. */
    notes: z.string().optional(),
    gradeRules: gradeRulesSchema,
    modules: z.array(presetModuleSchema).min(1),
    areas: z.array(presetAreaSchema),
  })
  .superRefine((preset, ctx) => {
    const modules = new Map<string, PresetModule>()
    preset.modules.forEach((module, index) => {
      if (modules.has(module.code)) {
        ctx.addIssue({
          code: 'custom',
          path: ['modules', index, 'code'],
          message: `Duplicate module code "${module.code}"`,
        })
      }
      modules.set(module.code, module)
    })

    preset.modules.forEach((module, index) => {
      for (const code of (module.prerequisites ?? []).flatMap(prerequisiteCodes)) {
        if (!modules.has(code)) {
          ctx.addIssue({
            code: 'custom',
            path: ['modules', index, 'prerequisites'],
            message: `Unknown prerequisite "${code}"`,
          })
        }
      }
      if (module.requiresCredits !== undefined && module.requiresCredits > preset.totalCredits) {
        ctx.addIssue({
          code: 'custom',
          path: ['modules', index, 'requiresCredits'],
          message: 'requiresCredits exceeds the total credits of the programme',
        })
      }
    })

    preset.areas.forEach((area, index) => {
      if (area.maxCredits !== undefined && area.maxCredits < area.minCredits) {
        ctx.addIssue({ code: 'custom', path: ['areas', index], message: 'maxCredits is below minCredits' })
      }
      for (const code of area.moduleCodes) {
        if (!modules.has(code)) {
          ctx.addIssue({
            code: 'custom',
            path: ['areas', index, 'moduleCodes'],
            message: `Unknown module "${code}"`,
          })
        }
      }
    })

    const nodeIds = new Set<string>()
    const aggregated = new Set<string>()
    for (const { node, code } of walkAggregation(preset.gradeRules.aggregation)) {
      const path = ['gradeRules', 'aggregation']
      if (code === undefined) {
        if (nodeIds.has(node.id))
          ctx.addIssue({ code: 'custom', path, message: `Duplicate node id "${node.id}"` })
        nodeIds.add(node.id)
        continue
      }
      const module = modules.get(code)
      if (!module) {
        ctx.addIssue({ code: 'custom', path, message: `Aggregation references unknown module "${code}"` })
      } else if (module.grading !== 'graded' || !module.countsTowardAverage) {
        ctx.addIssue({
          code: 'custom',
          path,
          message: `Module "${code}" is aggregated but is ungraded or excluded from the average`,
        })
      }
      if (aggregated.has(code)) {
        ctx.addIssue({
          code: 'custom',
          path,
          message: `Module "${code}" appears more than once in the aggregation`,
        })
      }
      aggregated.add(code)
    }
  })

export type Preset = z.infer<typeof presetSchema>
