import { z } from 'zod'
import { toHalves } from '../engine/units.ts'
import {
  type Preset,
  type PresetArea,
  type PresetModule,
  presetAreaSchema,
  presetModuleSchema,
} from '../schema/preset.ts'
import { creditValueSchema, type GradeRules, gradeRulesSchema, gradeValueSchema } from '../schema/rules.ts'
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
  /** Added by the student, not part of the programme data. Kept through resets and programme updates. */
  custom: z.literal(true).optional(),
  /** Set when a preset update removed the module but it stays in the plan because it has a result. */
  retired: z.literal(true).optional(),
})
export type PlanModule = z.infer<typeof planModuleSchema>

export const PLACEHOLDER_PREFIX = 'placeholder-'

/** True for placement entries that stand for a module still to be chosen from an area. */
export const isPlaceholderId = (code: string): boolean => code.startsWith(PLACEHOLDER_PREFIX)

/** A slot for a module the student will choose from an area, e.g. one Vertiefung module. */
export const placeholderSchema = z.object({
  id: z.string().regex(/^placeholder-[a-z0-9-]+$/),
  areaId: z.string().min(1),
})
export type Placeholder = z.infer<typeof placeholderSchema>

/** Category of modules the student added; the UI shows its own label for it. */
export const CUSTOM_CATEGORY = 'custom'

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
    /** Placeholders placed in semesters. Missing in plans created before placeholders existed. */
    placeholders: z.array(placeholderSchema).optional(),
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

    const placeholderIds = new Set<string>()
    const areaIds = new Set(plan.areas.map((area) => area.id))
    for (const placeholder of plan.placeholders ?? []) {
      if (placeholderIds.has(placeholder.id) || codes.has(placeholder.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['placeholders'],
          message: `Duplicate placeholder "${placeholder.id}"`,
        })
      }
      if (!areaIds.has(placeholder.areaId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['placeholders'],
          message: `Placeholder "${placeholder.id}" refers to unknown area "${placeholder.areaId}"`,
        })
      }
      placeholderIds.add(placeholder.id)
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
    for (const id of placeholderIds) {
      const inSemesters = plan.semesters.reduce(
        (count, semester) => count + semester.moduleCodes.filter((code) => code === id).length,
        0,
      )
      if (inSemesters !== 1 || plan.backlog.includes(id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['semesters'],
          message: `Placeholder "${id}" must be placed in exactly one semester`,
        })
      }
    }
    for (const code of placed.keys()) {
      if (!codes.has(code) && !placeholderIds.has(code)) {
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

/**
 * Modules the student chooses from: within an area that has a credit maximum, the modules recommended for the
 * same semester add up to more than the maximum (e.g. 14 Proseminare of 5 LP each in a 10 LP area). Modules
 * that fit, like a compulsory module of the same area in another semester, are not choices.
 */
function inferredChoices(modules: readonly PresetModule[], areas: readonly PresetArea[]): Set<string> {
  const byCode = new Map(modules.map((module) => [module.code, module]))
  const choices = new Set<string>()
  for (const area of areas) {
    if (area.maxCredits === undefined) continue
    const groups = new Map<number, { codes: string[]; halves: number }>()
    for (const code of area.moduleCodes) {
      const module = byCode.get(code)
      if (!module || module.typicalSemester === undefined) continue
      const group = groups.get(module.typicalSemester) ?? { codes: [], halves: 0 }
      group.codes.push(code)
      group.halves += toHalves(module.credits)
      groups.set(module.typicalSemester, group)
    }
    for (const group of groups.values()) {
      if (group.halves > toHalves(area.maxCredits)) for (const code of group.codes) choices.add(code)
    }
  }
  return choices
}

/**
 * Where modules start in a new plan: their recommended semester, while choices, modules without a recommendation
 * and modules kept only for their results (retired) start unplanned.
 */
function defaultPlacement(
  modules: readonly (PresetModule & { retired?: true; custom?: true })[],
  areas: readonly PresetArea[],
  standardSemesters: number,
): { semesters: PlanSemester[]; backlog: string[] } {
  const semesters: PlanSemester[] = Array.from({ length: standardSemesters }, (_, index) => ({
    id: `s${index + 1}`,
    kind: 'regular',
    moduleCodes: [],
  }))
  const backlog: string[] = []
  const choices = inferredChoices(modules, areas)
  for (const module of modules) {
    const unplanned =
      module.retired === true || module.custom === true || (module.elective ?? choices.has(module.code))
    const target =
      module.typicalSemester === undefined || unplanned ? undefined : semesters[module.typicalSemester - 1]
    if (target) target.moduleCodes.push(module.code)
    else backlog.push(module.code)
  }
  return { semesters, backlog }
}

export interface ResetPlanOptions {
  /** Also remove results, exam dates, the target grade and modules that were only kept for their results. */
  clearResults?: boolean
}

/**
 * Puts every module back where a new plan from the same programme data would place it, with the standard number
 * of semesters. Results, exam dates and the target grade stay unless `clearResults` is set.
 */
export function resetPlan(plan: Plan, options: ResetPlanOptions = {}): Plan {
  const { targetGrade, placeholders: _placeholders, ...withoutTarget } = plan
  const modules = options.clearResults
    ? plan.modules
        .filter((module) => !module.retired)
        .map(({ examDate: _examDate, ...module }) => ({ ...module, attempts: [] }))
    : plan.modules
  const { semesters, backlog } = defaultPlacement(modules, plan.areas, plan.preset.standardSemesters)
  return {
    ...withoutTarget,
    ...(options.clearResults || targetGrade === undefined ? {} : { targetGrade }),
    modules,
    semesters,
    backlog,
  }
}

/** Custom modules only enter the average when the top level of the calculation weights by credits. */
export const customModulesCanCount = (plan: Pick<Plan, 'rules'>): boolean =>
  plan.rules.aggregation.weightMode === 'credits'

/**
 * The plan's grade rules with the student's own graded modules added to the top level, weighted by credits.
 * Special rules of the programme (best-of, Streichregeln, truncated groups) do not apply to them.
 */
export function planGradeRules(plan: Pick<Plan, 'rules' | 'modules'>): GradeRules {
  if (!customModulesCanCount(plan)) return plan.rules
  const extra = plan.modules.filter(
    (module) => module.custom && module.grading === 'graded' && module.countsTowardAverage,
  )
  if (extra.length === 0) return plan.rules
  return {
    ...plan.rules,
    aggregation: {
      ...plan.rules.aggregation,
      children: [
        ...plan.rules.aggregation.children,
        ...extra.map((module) => ({ kind: 'module' as const, code: module.code })),
      ],
    },
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
  const { semesters, backlog } = defaultPlacement(preset.modules, preset.areas, preset.standardSemesters)

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
