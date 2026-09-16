import { findModule, moveModule, PlanError } from './operations.ts'
import { choiceOptionCodes } from './placeholders.ts'
import { detachFromGroup, type ModuleGroup, type Plan } from './plan.ts'

const groupOf = (plan: Pick<Plan, 'moduleGroups'>, code: string): ModuleGroup | undefined =>
  plan.moduleGroups?.find((group) => group.codes.includes(code))

const semesterOf = (plan: Plan, code: string): string | null =>
  plan.semesters.find((semester) => semester.moduleCodes.includes(code))?.id ?? null

/** The group a module belongs to, if any. */
export const moduleGroupOf = (plan: Pick<Plan, 'moduleGroups'>, code: string): ModuleGroup | undefined =>
  groupOf(plan, code)

/**
 * Modules a planned option can be grouped with: other options of the same area planned in any semester that are
 * not in another group. Compulsory modules and modules outside the semesters have none.
 */
export function groupCandidates(plan: Plan, code: string): string[] {
  if (semesterOf(plan, code) === null) return []
  const area = [...choiceOptionCodes(plan)].find(([, codes]) => codes.includes(code))
  if (!area) return []
  return area[1].filter(
    (other) => other !== code && semesterOf(plan, other) !== null && groupOf(plan, other) === undefined,
  )
}

const newGroupId = (plan: Plan): string => {
  const taken = new Set((plan.moduleGroups ?? []).map((group) => group.id))
  let index = (plan.moduleGroups ?? []).length + 1
  while (taken.has(`group-${index}`)) index++
  return `group-${index}`
}

/**
 * Groups `otherCode` with `code`: into the group `code` already has, or into a new one. Both stay in the
 * semesters they are planned in, so a group can keep open when a module is taken as well as which one.
 */
export function groupModules(plan: Plan, code: string, otherCode: string): Plan {
  findModule(plan, code)
  if (!groupCandidates(plan, code).includes(otherCode)) {
    throw new PlanError(`Module "${otherCode}" cannot be grouped with "${code}"`)
  }
  const own = groupOf(plan, code)
  const groups = own
    ? (plan.moduleGroups ?? []).map((group) =>
        group.id === own.id ? { ...group, codes: [...group.codes, otherCode] } : group,
      )
    : [...(plan.moduleGroups ?? []), { id: newGroupId(plan), codes: [code, otherCode] }]
  return { ...plan, moduleGroups: groups }
}

/** Takes a module out of its group; it stays planned where it is. */
export function leaveModuleGroup(plan: Plan, code: string): Plan {
  findModule(plan, code)
  if (!groupOf(plan, code)) throw new PlanError(`Module "${code}" is not in a group`)
  return detachFromGroup(plan, code)
}

/** Decides a group: `code` stays planned, the other members go back to the unplanned modules. */
export function keepFromModuleGroup(plan: Plan, code: string): Plan {
  const group = groupOf(plan, code)
  if (!group) throw new PlanError(`Module "${code}" is not in a group`)
  let next: Plan = plan
  for (const other of group.codes) {
    if (other !== code) next = moveModule(next, other, null)
  }
  return detachFromGroup(next, code)
}
