import { prerequisiteCodes } from '../schema/preset.ts'
import type { Plan, PlanModule } from './plan.ts'

/** Modules that list `code` among their binding prerequisites, alone or as one of several choices. */
export function dependentModules(plan: Pick<Plan, 'modules'>, code: string): PlanModule[] {
  return plan.modules.filter(
    (module) =>
      !module.retired &&
      (module.prerequisites ?? []).some((prerequisite) => prerequisiteCodes(prerequisite).includes(code)),
  )
}
