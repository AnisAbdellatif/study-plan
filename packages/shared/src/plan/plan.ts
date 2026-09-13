import { z } from 'zod'
import { type Preset, presetAreaSchema, presetModuleSchema } from '../schema/preset.ts'
import { creditValueSchema, gradeRulesSchema, gradeValueSchema } from '../schema/rules.ts'
import { type Term, termSchema } from './terms.ts'

export const attemptSchema = z.object({
  attemptNo: z.number().int().min(1),
  result: z.enum(['passed', 'failed', 'registered', 'absent', 'withdrawn']),
  grade: gradeValueSchema.optional(),
  /** Exam date of this attempt, YYYY-MM-DD. */
  date: z.iso.date().optional(),
})

/** A module snapshotted from the preset when the plan was created, plus the student's attempts. */
export const planModuleSchema = presetModuleSchema.extend({
  attempts: z.array(attemptSchema),
  /** Exam date the student entered, YYYY-MM-DD. */
  examDate: z.iso.date().optional(),
  /** Set when a preset update removed the module but it stays in the plan because it has a result. */
  retired: z.literal(true).optional(),
})
export type PlanModule = z.infer<typeof planModuleSchema>

export const semesterKindSchema = z.enum(['regular', 'part_time', 'leave', 'abroad'])

export const planSemesterSchema = z.object({
  id: z.string().min(1),
  kind: semesterKindSchema,
  /** Module codes in display order. */
  moduleCodes: z.array(z.string()),
})
export type PlanSemester = z.infer<typeof planSemesterSchema>

/** The preset facts a plan keeps, so it stays readable when the preset changes or disappears. */
export const presetInfoSchema = z.object({
  id: z.string().min(1),
  universityName: z.string().min(1),
  programmeName: z.string().min(1),
  degree: z.enum(['bsc', 'msc']),
  poVersion: z.string().min(1),
  handbookVersion: z.string().min(1),
  standardSemesters: z.number().int().min(1),
  totalCredits: creditValueSchema,
  creditLabel: z.enum(['ECTS', 'LP', 'CP']),
  /** Missing in plans created before the flag existed; treat as true. */
  codesAreOfficial: z.boolean().optional(),
  /** Last day to withdraw from an exam, in days before it. From the preset's exam rules. */
  withdrawalDaysBeforeExam: z.number().int().min(0).max(60).optional(),
  /** Attempt policy from the preset's exam rules. Missing means unknown, so no attempt warnings. */
  maxAttempts: z.number().int().min(1).max(10).optional(),
  retakePassedExams: z.boolean().optional(),
  supplementaryExamOnLastAttempt: z.boolean().optional(),
})
export type PresetInfo = z.infer<typeof presetInfoSchema>

export const planSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(120),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    preset: presetInfoSchema,
    rules: gradeRulesSchema,
    areas: z.array(presetAreaSchema),
    startTerm: termSchema,
    semesters: z.array(planSemesterSchema).min(1).max(20),
    /** Module codes that are not placed in any semester yet ("Nicht eingeplant"). */
    backlog: z.array(z.string()),
    modules: z.array(planModuleSchema),
    /** Zielschnitt for the what-if analysis. */
    targetGrade: gradeValueSchema.optional(),
  })
  .superRefine((plan, ctx) => {
    const codes = new Set<string>()
    for (const module of plan.modules) {
      if (codes.has(module.code)) {
        ctx.addIssue({ code: 'custom', path: ['modules'], message: `Duplicate module "${module.code}"` })
      }
      codes.add(module.code)
    }

    const semesterIds = new Set<string>()
    for (const semester of plan.semesters) {
      if (semesterIds.has(semester.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['semesters'],
          message: `Duplicate semester id "${semester.id}"`,
        })
      }
      semesterIds.add(semester.id)
    }

    const placed = new Map<string, number>()
    for (const code of [...plan.semesters.flatMap((s) => s.moduleCodes), ...plan.backlog]) {
      placed.set(code, (placed.get(code) ?? 0) + 1)
    }
    for (const code of codes) {
      const count = placed.get(code) ?? 0
      if (count !== 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['semesters'],
          message: `Module "${code}" must be placed exactly once, found ${count}`,
        })
      }
    }
    for (const code of placed.keys()) {
      if (!codes.has(code)) {
        ctx.addIssue({
          code: 'custom',
          path: ['semesters'],
          message: `Placement of unknown module "${code}"`,
        })
      }
    }
  })
export type Plan = z.infer<typeof planSchema>

const DEGREE_LABEL = { bsc: 'B.Sc.', msc: 'M.Sc.' } as const

/** The preset facts a plan snapshots. Used when creating a plan and when updating it to a newer preset. */
export function presetInfoFrom(preset: Preset): PresetInfo {
  return {
    id: preset.id,
    universityName: preset.university.name,
    programmeName: preset.programme.name,
    degree: preset.programme.degree,
    poVersion: preset.poVersion,
    handbookVersion: preset.handbookVersion,
    standardSemesters: preset.standardSemesters,
    totalCredits: preset.totalCredits,
    creditLabel: preset.creditLabel,
    codesAreOfficial: preset.codesAreOfficial,
    withdrawalDaysBeforeExam: preset.examRules?.withdrawalDaysBeforeExam,
    maxAttempts: preset.examRules?.maxAttempts,
    retakePassedExams: preset.examRules?.retakePassedExams,
    supplementaryExamOnLastAttempt: preset.examRules?.supplementaryExamOnLastAttempt,
  }
}

export interface CreatePlanOptions {
  id: string
  startTerm: Term
  now: Date
  name?: string
}

/**
 * Creates a plan by snapshotting a preset. Modules land in their typical semester when it exists
 * within the standard duration, otherwise in the backlog.
 */
export function createPlanFromPreset(preset: Preset, options: CreatePlanOptions): Plan {
  const semesters: PlanSemester[] = Array.from({ length: preset.standardSemesters }, (_, index) => ({
    id: `s${index + 1}`,
    kind: 'regular',
    moduleCodes: [],
  }))
  const backlog: string[] = []

  for (const module of preset.modules) {
    const target = module.typicalSemester === undefined ? undefined : semesters[module.typicalSemester - 1]
    if (target) target.moduleCodes.push(module.code)
    else backlog.push(module.code)
  }

  const timestamp = options.now.toISOString()
  return {
    id: options.id,
    name: options.name ?? `${preset.programme.name} ${DEGREE_LABEL[preset.programme.degree]}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    preset: presetInfoFrom(preset),
    rules: structuredClone(preset.gradeRules),
    areas: structuredClone(preset.areas),
    startTerm: { ...options.startTerm },
    semesters,
    backlog,
    modules: preset.modules.map((module) => ({ ...structuredClone(module), attempts: [] })),
  }
}
