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

/** The choice area a planned option belongs to, or null for compulsory and unplanned modules. */
function optionAreaOf(plan: Plan, code: string, options: ReadonlyMap<string, string[]>): string | null {
  if (semesterOf(plan, code) === null) return null
  return [...options].find(([, codes]) => codes.includes(code))?.[0] ?? null
}

/**
 * Modules that may join a selection for grouping: planned options of the selection's area, in any semester.
 * Modules of one existing group can join too, which extends that group; a second group can't. With nothing
 * selected yet, every planned option is selectable.
 */
export function groupableCodes(plan: Plan, selected: readonly string[]): Set<string> {
  const options = choiceOptionCodes(plan)
  const area = selected.length > 0 ? optionAreaOf(plan, selected[0] ?? '', options) : null
  const selectedGroup = selected.map((code) => groupOf(plan, code)?.id).find((id) => id !== undefined)
  const result = new Set<string>()
  for (const [areaId, codes] of options) {
    if (area !== null && areaId !== area) continue
    for (const code of codes) {
      if (semesterOf(plan, code) === null) continue
      const group = groupOf(plan, code)
      if (group && selectedGroup !== undefined && group.id !== selectedGroup) continue
      result.add(code)
    }
  }
  if (selected.length > 0 && area === null) result.clear()
  return result
}

const newGroupId = (plan: Plan): string => {
  const taken = new Set((plan.moduleGroups ?? []).map((group) => group.id))
  let index = (plan.moduleGroups ?? []).length + 1
  while (taken.has(`group-${index}`)) index++
  return `group-${index}`
}

/**
 * Groups the selected options. They stay in the semesters they are planned in. When some of them already form
 * a group, the others join it; otherwise a new group starts.
 */
export function groupModuleCodes(plan: Plan, codes: readonly string[]): Plan {
  const unique = [...new Set(codes)]
  for (const code of unique) findModule(plan, code)
  const allowed = groupableCodes(plan, unique)
  if (unique.some((code) => !allowed.has(code))) {
    throw new PlanError('Only planned options of one area and at most one existing group can be grouped')
  }
  const existing = unique.map((code) => groupOf(plan, code)).find((group) => group !== undefined)
  const members = [...new Set([...(existing?.codes ?? []), ...unique])]
  if (members.length < 2) throw new PlanError('A group needs at least two modules')
  const groups = existing
    ? (plan.moduleGroups ?? []).map((group) =>
        group.id === existing.id ? { ...group, codes: members } : group,
      )
    : [...(plan.moduleGroups ?? []), { id: newGroupId(plan), codes: members }]
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
