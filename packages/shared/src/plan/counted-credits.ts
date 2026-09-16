import { isModulePassed } from '../engine/progress.ts'
import { toHalves } from '../engine/units.ts'
import { countsForDegree, type Plan } from './plan.ts'

/**
 * The credits each module brings to the plan, in halves: its own credits, except for modules the student only
 * learns (none) and for groups of options not decided yet. A group counts once: the passed members count in
 * full, and while none is passed its largest member stands for the whole group.
 */
export function countedCreditHalves(
  plan: Pick<Plan, 'modules' | 'moduleGroups' | 'rules'>,
): Map<string, number> {
  const halves = new Map(
    plan.modules.map((module) => [module.code, countsForDegree(module) ? toHalves(module.credits) : 0]),
  )
  const byCode = new Map(plan.modules.map((module) => [module.code, module]))
  for (const group of plan.moduleGroups ?? []) {
    const members = group.codes.filter((code) => byCode.has(code))
    const passed = new Set(
      members.filter((code) => {
        const module = byCode.get(code)
        return module !== undefined && isModulePassed(module, plan.rules)
      }),
    )
    // Taken is taken: every passed member counts, and the undecided rest of the group no longer does.
    const standIn =
      passed.size > 0
        ? null
        : members.reduce<string | null>(
            (best, code) =>
              best === null || (halves.get(code) ?? 0) > (halves.get(best) ?? 0) ? code : best,
            null,
          )
    for (const code of members) {
      if (!passed.has(code) && code !== standIn) halves.set(code, 0)
    }
  }
  return halves
}
