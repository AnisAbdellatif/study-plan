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
  /**
   * True for a module the student picks among alternatives (one of several Proseminare, a Wahlpflicht catalogue).
   * Such modules start unplanned. False keeps a module in its recommended semester even inside a choice area.
   * Omitted: the planner infers choices from the areas, see `createPlanFromPreset`.
   */
  elective: z.boolean().optional(),
  /**
   * True for a work placement outside the university (Betriebspraktikum, Industriepraktikum, Praxisphase).
   * Lab and practical courses at the university (Programmierpraktikum, Laborpraktikum) are ordinary modules.
   */
  internship: z.boolean().optional(),
  /**
   * Modules with the same group exclude each other: only one of them may be taken, e.g. the 15 and 20 LP
   * variants of an optional Betriebspraktikum, or a Praktikum and an Auslandsstudium that replace the same credits.
   */
  alternativeGroup: slugSchema.optional(),
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

/**
 * Areas of which the student takes exactly one, e.g. the Nebenfach. Until the student picks one, every module of
 * these areas is an option and their credit requirements don't apply. Afterwards only the picked area counts, and
 * its compulsory modules become compulsory for the student.
 */
export const presetAreaChoiceSchema = z.object({
  id: slugSchema,
  /** What the student picks, e.g. "Nebenfach". */
  name: z.string().min(1),
  areaIds: z.array(slugSchema).min(2),
  /** True when the student may also take none of the areas. */
  optional: z.boolean().optional(),
})
export type PresetAreaChoice = z.infer<typeof presetAreaChoiceSchema>

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
    /** "<university>/<programme>", e.g. "custom/informatik-bsc-1a2b3c4d" for extracted programmes. */
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
    /** Free-text maintainer notes. JSON has no comments, so they live here. */
    notes: z.string().optional(),
    gradeRules: gradeRulesSchema,
    modules: z.array(presetModuleSchema).min(1),
    areas: z.array(presetAreaSchema),
    /** Groups of areas the student picks one of, e.g. the Nebenfach. */
    areaChoices: z.array(presetAreaChoiceSchema).optional(),
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

    const groupSizes = new Map<string, number>()
    for (const module of preset.modules) {
      if (module.alternativeGroup)
        groupSizes.set(module.alternativeGroup, (groupSizes.get(module.alternativeGroup) ?? 0) + 1)
    }
    preset.modules.forEach((module, index) => {
      if (module.alternativeGroup && groupSizes.get(module.alternativeGroup) === 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['modules', index, 'alternativeGroup'],
          message: `alternativeGroup "${module.alternativeGroup}" is used by only one module`,
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

    const areaIds = new Set(preset.areas.map((area) => area.id))
    const choiceIds = new Set<string>()
    const choiceOfArea = new Map<string, string>()
    for (const [index, choice] of (preset.areaChoices ?? []).entries()) {
      if (choiceIds.has(choice.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['areaChoices', index, 'id'],
          message: `Duplicate area choice "${choice.id}"`,
        })
      }
      choiceIds.add(choice.id)
      for (const areaId of choice.areaIds) {
        const other = choiceOfArea.get(areaId)
        if (!areaIds.has(areaId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['areaChoices', index, 'areaIds'],
            message: `Unknown area "${areaId}"`,
          })
        } else if (other !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['areaChoices', index, 'areaIds'],
            message: `Area "${areaId}" is already part of area choice "${other}"`,
          })
        } else {
          choiceOfArea.set(areaId, choice.id)
        }
      }
    }

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
