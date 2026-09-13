import { z } from 'zod'
import { type AggregationNode, creditValueSchema, gradeRulesSchema } from './rules.ts'

const presetIdSchema = z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/)

const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, digits and dashes')

const detailText = z.string().min(1)
const hours = z.number().nonnegative().max(10000)
const swsValue = z.number().nonnegative().max(60)

/**
 * Descriptive facts from the Modulkatalog entry. Everything is optional and informational: the planner never
 * computes with these fields. Texts stay in the language of the catalog.
 */
export const moduleDetailsSchema = z.object({
  /** Englischer Titel */
  englishName: detailText.optional(),
  /** Modulverantwortliche(r) */
  responsible: z.array(detailText).optional(),
  /** Dozent/in, Lehrende */
  lecturers: z.array(detailText).optional(),
  /** Prüfer/in */
  examiners: z.array(detailText).optional(),
  /** Organisationseinheit, Institut, Fakultät, Lehreinheit */
  organisationalUnit: detailText.optional(),
  /** Unterrichtssprache(n), verbatim */
  languages: z.array(detailText).optional(),
  /** Turnus as written, e.g. "jedes Wintersemester" */
  frequency: detailText.optional(),
  durationSemesters: z.number().int().min(1).max(6).optional(),
  /** Total Semesterwochenstunden */
  sws: swsValue.optional(),
  /** Courses of the module, e.g. 2V + 2Ü */
  courses: z
    .array(z.object({ type: detailText, title: detailText.optional(), sws: swsValue.optional() }))
    .optional(),
  /** Arbeitsaufwand in hours */
  workload: z
    .object({
      totalHours: hours.optional(),
      contactHours: hours.optional(),
      selfStudyHours: hours.optional(),
    })
    .optional(),
  /** Prüfungsleistung(en) as written, e.g. "Klausur (90 Min.)" */
  examForms: z.array(detailText).optional(),
  /** Prüfungsanmeldung */
  examRegistration: detailText.optional(),
  /** Studienleistung(en) */
  courseworkRequirements: z.array(detailText).optional(),
  /** Prüfungsbewertungen, Benotung */
  gradingNote: detailText.optional(),
  /** Binding Teilnahmevoraussetzungen as written */
  participationRequirements: detailText.optional(),
  /** Empfohlene Vorkenntnisse */
  recommendedPrerequisites: detailText.optional(),
  /** Qualifikationsziele, Lernergebnisse */
  learningOutcomes: detailText.optional(),
  /** Inhalt */
  content: detailText.optional(),
  /** Literatur, one entry per item */
  literature: z.array(detailText).optional(),
  /** Lehr- und Lernformen, Medien */
  teachingMethods: detailText.optional(),
  /** Verwendbarkeit, Einordnung in Studiengänge */
  usability: detailText.optional(),
  /** Schwerpunkt, Micro-Degree */
  specialisations: z.array(detailText).optional(),
  website: detailText.optional(),
  /** Weitere Angaben, Bemerkungen */
  remarks: detailText.optional(),
  /** Any other field of the catalog entry, label and value verbatim */
  additionalFields: z.array(z.object({ label: detailText, value: detailText })).optional(),
})
export type ModuleDetails = z.infer<typeof moduleDetailsSchema>

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
  /** Overrides `examRules.maxAttempts` for this module, e.g. fewer attempts for a Bachelorarbeit. */
  maxAttempts: z.number().int().min(1).max(10).optional(),
  /** Descriptive facts from the Modulkatalog. */
  details: moduleDetailsSchema.optional(),
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

export const transitionSchema = z.object({
  fromPresetId: presetIdSchema,
  moduleMap: z.array(z.object({ from: z.string().min(1), to: z.string().min(1) })),
  /** Shown to students before they switch, e.g. where the official transition rules are published. */
  notes: z.string().optional(),
})
export type PresetTransition = z.infer<typeof transitionSchema>

export const prerequisiteCodes = (prerequisite: Prerequisite): string[] =>
  typeof prerequisite === 'string' ? [prerequisite] : prerequisite.anyOf

export const presetSchema = z
  .object({
    $schema: z.string().optional(),
    schemaVersion: z.literal(1),
    /** "<university>/<programme>-<po-year>", matching the file path under presets/. */
    id: presetIdSchema,
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
        /** Attempts per exam including the first, e.g. 3 when a failed exam can be repeated twice. */
        maxAttempts: z.number().int().min(1).max(10).optional(),
        /** Whether a passed exam may be retaken to improve the grade (Notenverbesserung). */
        retakePassedExams: z.boolean().optional(),
        /** A failed Klausur in the last attempt only counts as failed after a supplementary oral exam. */
        supplementaryExamOnLastAttempt: z.boolean().optional(),
      })
      .optional(),
    /**
     * Ways to move a plan from an older preset (an earlier PO) to this one. `moduleMap` lists modules that
     * continue under a different code; modules with the same code carry over without an entry.
     */
    transitions: z.array(transitionSchema).optional(),
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

    preset.transitions?.forEach((transition, index) => {
      const path = ['transitions', index]
      if (transition.fromPresetId === preset.id) {
        ctx.addIssue({ code: 'custom', path, message: 'A preset cannot transition from itself' })
      }
      const sources = new Set<string>()
      const targets = new Set<string>()
      for (const { from, to } of transition.moduleMap) {
        if (!modules.has(to)) {
          ctx.addIssue({
            code: 'custom',
            path,
            message: `Transition target "${to}" is not a module of this preset`,
          })
        }
        if (sources.has(from))
          ctx.addIssue({ code: 'custom', path, message: `Module "${from}" is mapped twice` })
        if (targets.has(to)) {
          ctx.addIssue({ code: 'custom', path, message: `Several modules map to "${to}"` })
        }
        sources.add(from)
        targets.add(to)
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
