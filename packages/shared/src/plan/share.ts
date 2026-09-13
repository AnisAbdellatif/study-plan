import type { Plan } from './plan.ts'

/**
 * What a share link reveals: the plan's structure. Results, exam dates and the target grade stay private.
 * Stripping happens on the server before anything leaves it, and this function is the single definition.
 */
export function toSharedPlan(plan: Plan): Plan {
  const { targetGrade: _targetGrade, ...rest } = plan
  return {
    ...rest,
    id: 'shared',
    modules: plan.modules.map(({ examDate: _examDate, ...module }) => ({ ...module, attempts: [] })),
  }
}

/** An independent copy of a shared plan for the student who opened the link. */
export function forkPlan(shared: Plan, options: { id: string; now: Date }): Plan {
  const timestamp = options.now.toISOString()
  return { ...toSharedPlan(shared), id: options.id, createdAt: timestamp, updatedAt: timestamp }
}
