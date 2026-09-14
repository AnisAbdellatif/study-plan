import type { Plan } from './plan.ts'

export interface SharedPlanOptions {
  /** Keep results and grades, when the owner chose to share them. Exam dates and the target grade still go. */
  includeGrades?: boolean
}

/**
 * What a share link reveals: the plan's structure, and results only when the owner chose to share grades. Exam
 * dates and the target grade always stay private. Stripping happens on the server before anything leaves it,
 * and this function is the single definition.
 */
export function toSharedPlan(plan: Plan, options: SharedPlanOptions = {}): Plan {
  const { targetGrade: _targetGrade, ...rest } = plan
  return {
    ...rest,
    id: 'shared',
    // Recognition details (where and what the student studied before) are personal too.
    modules: plan.modules.map(({ examDate: _examDate, recognition: _recognition, ...module }) =>
      options.includeGrades ? module : { ...module, attempts: [] },
    ),
  }
}

/** An independent copy of a shared plan for the student who opened the link. Someone else's grades never come along. */
export function forkPlan(shared: Plan, options: { id: string; now: Date }): Plan {
  const timestamp = options.now.toISOString()
  return { ...toSharedPlan(shared), id: options.id, createdAt: timestamp, updatedAt: timestamp }
}
