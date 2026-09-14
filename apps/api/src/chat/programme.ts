import type { GradeRules, Plan, PlanModule, PresetArea } from '@study-plan/shared'

/** A module as the chat may see it: programme facts only. */
export type ChatModule = Pick<
  PlanModule,
  | 'code'
  | 'name'
  | 'credits'
  | 'grading'
  | 'countsTowardAverage'
  | 'category'
  | 'offering'
  | 'typicalSemester'
  | 'prerequisites'
  | 'requiresCredits'
  | 'elective'
  | 'internship'
  | 'alternativeGroup'
  | 'maxAttempts'
  | 'details'
>

export interface ChatProgramme {
  university: string
  programme: string
  degree: 'bsc' | 'msc'
  poVersion: string
  handbookVersion: string
  standardSemesters: number
  totalCredits: number
  creditLabel: 'ECTS' | 'LP' | 'CP'
  examRules: {
    withdrawalDaysBeforeExam?: number
    maxAttempts?: number
    retakePassedExams?: boolean
    supplementaryExamOnLastAttempt?: boolean
  }
  gradeRules: GradeRules
  areas: PresetArea[]
  modules: ChatModule[]
}

/** Copies only defined values, so absent facts stay absent instead of becoming `undefined` keys. */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T
}

/**
 * The programme data of a plan, for a language model. This is the privacy boundary of the chat: every field is
 * copied by name, so results, attempts, grades, exam dates, the target grade, placements and anything a future
 * plan field adds never reach a third party. Modules the student added (`custom`) and modules kept only because
 * they have a result (`retired`) are left out as well.
 */
export function programmeForChat(plan: Plan): ChatProgramme {
  const modules = plan.modules
    .filter((module) => module.custom !== true && module.retired !== true)
    .map(
      (module): ChatModule =>
        defined({
          code: module.code,
          name: module.name,
          credits: module.credits,
          grading: module.grading,
          countsTowardAverage: module.countsTowardAverage,
          category: module.category,
          offering: module.offering,
          typicalSemester: module.typicalSemester,
          prerequisites: module.prerequisites,
          requiresCredits: module.requiresCredits,
          elective: module.elective,
          internship: module.internship,
          alternativeGroup: module.alternativeGroup,
          maxAttempts: module.maxAttempts,
          details: module.details,
        }),
    )
  const codes = new Set(modules.map((module) => module.code))

  return {
    university: plan.preset.universityName,
    programme: plan.preset.programmeName,
    degree: plan.preset.degree,
    poVersion: plan.preset.poVersion,
    handbookVersion: plan.preset.handbookVersion,
    standardSemesters: plan.preset.standardSemesters,
    totalCredits: plan.preset.totalCredits,
    creditLabel: plan.preset.creditLabel,
    examRules: defined({
      withdrawalDaysBeforeExam: plan.preset.withdrawalDaysBeforeExam,
      maxAttempts: plan.preset.maxAttempts,
      retakePassedExams: plan.preset.retakePassedExams,
      supplementaryExamOnLastAttempt: plan.preset.supplementaryExamOnLastAttempt,
    }),
    // The rules describe how the programme computes grades; they hold no grade of the student.
    gradeRules: plan.rules,
    areas: plan.areas.map((area) => ({
      ...area,
      moduleCodes: area.moduleCodes.filter((code) => codes.has(code)),
    })),
    modules,
  }
}
