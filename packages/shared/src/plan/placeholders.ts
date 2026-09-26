import { toHalves } from '../engine/units.ts'
import type { PresetArea } from '../schema/preset.ts'
import { type AreaChoiceState, inactiveAreaIds } from './area-choices.ts'
import { countedCreditHalves } from './counted-credits.ts'
import { PlanError, removePlaceholderEntry } from './operations.ts'
import {
  detachFromGroup,
  isPlaceholderId,
  PLACEHOLDER_PREFIX,
  type Placeholder,
  type Plan,
  type PlanModule,
} from './plan.ts'

export interface ChoiceArea {
  area: PresetArea
  /** Modules the student can choose in this area, in programme order. */
  options: PlanModule[]
  /** Options already placed in a semester. */
  chosen: PlanModule[]
  /** Options still to choose from, i.e. not placed in a semester. */
  available: PlanModule[]
  placeholders: Placeholder[]
  chosenCredits: number
  /** Estimated credits of one placeholder: the most common credit value among the options. */
  placeholderCredits: number
}

/**
 * The modules a student picks from, per area. In an area of a choice the student hasn't picked (e.g. a Nebenfach
 * that isn't the chosen one) every module is an option. Otherwise explicit `elective` flags win when an area has
 * any. Otherwise, in an area with a credit maximum that lists more credits than that, modules without a recommended
 * semester and modules whose semester group exceeds the maximum are options; a compulsory module that fits keeps
 * its semester.
 */
export function choiceOptionCodes(
  plan: Pick<Plan, 'modules' | 'areas'> & AreaChoiceState,
): Map<string, string[]> {
  const byCode = new Map(plan.modules.map((module) => [module.code, module]))
  const inactive = inactiveAreaIds(plan)
  const result = new Map<string, string[]>()
  for (const area of plan.areas) {
    const members = area.moduleCodes
      .map((code) => byCode.get(code))
      .filter((module): module is PlanModule => module !== undefined && !module.custom && !module.retired)
    let options: PlanModule[]
    if (inactive.has(area.id)) {
      options = members
    } else if (members.some((module) => module.elective === true)) {
      options = members.filter((module) => module.elective === true)
    } else if (area.maxCredits !== undefined) {
      const max = toHalves(area.maxCredits)
      const total = members.reduce((sum, module) => sum + toHalves(module.credits), 0)
      if (total <= max) continue
      const groupHalves = new Map<number, number>()
      for (const module of members) {
        if (module.typicalSemester === undefined) continue
        groupHalves.set(
          module.typicalSemester,
          (groupHalves.get(module.typicalSemester) ?? 0) + toHalves(module.credits),
        )
      }
      options = members.filter(
        (module) =>
          module.elective !== false &&
          (module.typicalSemester === undefined || (groupHalves.get(module.typicalSemester) ?? 0) > max),
      )
    } else {
      continue
    }
    if (options.length > 0)
      result.set(
        area.id,
        options.map((module) => module.code),
      )
  }
  return result
}

/** The most common credit value among the options, the smaller one on a tie. */
function typicalCredits(options: readonly PlanModule[]): number {
  const counts = new Map<number, number>()
  for (const module of options) counts.set(module.credits, (counts.get(module.credits) ?? 0) + 1)
  let best = 0
  let bestCount = 0
  for (const [credits, count] of counts) {
    if (count > bestCount || (count === bestCount && credits < best)) {
      best = credits
      bestCount = count
    }
  }
  return best
}

export function choiceAreas(plan: Plan): ChoiceArea[] {
  const optionCodes = choiceOptionCodes(plan)
  const counted = countedCreditHalves(plan)
  const byCode = new Map(plan.modules.map((module) => [module.code, module]))
  const inSemesters = new Set(plan.semesters.flatMap((semester) => semester.moduleCodes))
  return plan.areas.flatMap((area) => {
    const codes = optionCodes.get(area.id)
    if (!codes) return []
    const options = codes
      .map((code) => byCode.get(code))
      .filter((module): module is PlanModule => module !== undefined)
    const chosen = options.filter((module) => inSemesters.has(module.code))
    return [
      {
        area,
        options,
        chosen,
        available: options.filter((module) => !inSemesters.has(module.code)),
        placeholders: (plan.placeholders ?? []).filter((placeholder) => placeholder.areaId === area.id),
        chosenCredits: chosen.reduce((sum, module) => sum + (counted.get(module.code) ?? 0), 0) / 2,
        placeholderCredits: typicalCredits(options),
      },
    ]
  })
}

/** Estimated credits per placeholder id, for semester load, area progress and credit forecasts. */
export function placeholderCredits(plan: Plan): Map<string, number> {
  const perArea = new Map(choiceAreas(plan).map((choice) => [choice.area.id, choice.placeholderCredits]))
  return new Map(
    (plan.placeholders ?? []).map((placeholder) => [placeholder.id, perArea.get(placeholder.areaId) ?? 0]),
  )
}

const newPlaceholderId = (plan: Plan, suffix?: string): string => {
  const taken = new Set([
    ...(plan.placeholders ?? []).map((placeholder) => placeholder.id),
    ...plan.modules.map((m) => m.code),
  ])
  if (suffix) {
    const id = `${PLACEHOLDER_PREFIX}${suffix}`
    if (!/^placeholder-[a-z0-9-]+$/.test(id) || taken.has(id))
      throw new PlanError(`Invalid placeholder id "${id}"`)
    return id
  }
  let index = (plan.placeholders ?? []).length + 1
  while (taken.has(`${PLACEHOLDER_PREFIX}${index}`)) index++
  return `${PLACEHOLDER_PREFIX}${index}`
}

/** Places a placeholder for a module to choose from `areaId`. `targetIndex` as in `moveModule`. */
export function addPlaceholder(
  plan: Plan,
  areaId: string,
  semesterId: string,
  targetIndex?: number,
  idSuffix?: string,
): Plan {
  if (!choiceOptionCodes(plan).has(areaId))
    throw new PlanError(`Area "${areaId}" has no modules to choose from`)
  if (!plan.semesters.some((semester) => semester.id === semesterId)) {
    throw new PlanError(`Unknown semester "${semesterId}"`)
  }
  const id = newPlaceholderId(plan, idSuffix)
  return {
    ...plan,
    placeholders: [...(plan.placeholders ?? []), { id, areaId }],
    semesters: plan.semesters.map((semester) => {
      if (semester.id !== semesterId) return semester
      const index = Math.max(
        0,
        Math.min(targetIndex ?? semester.moduleCodes.length, semester.moduleCodes.length),
      )
      return {
        ...semester,
        moduleCodes: [...semester.moduleCodes.slice(0, index), id, ...semester.moduleCodes.slice(index)],
      }
    }),
  }
}

export function removePlaceholder(plan: Plan, id: string): Plan {
  if (!plan.placeholders?.some((placeholder) => placeholder.id === id))
    throw new PlanError(`Unknown placeholder "${id}"`)
  return removePlaceholderEntry(plan, id)
}

/** Replaces a placeholder with a module of its area that is not placed in a semester yet. */
export function choosePlaceholder(plan: Plan, placeholderId: string, moduleCode: string): Plan {
  const placeholder = plan.placeholders?.find((item) => item.id === placeholderId)
  if (!placeholder) throw new PlanError(`Unknown placeholder "${placeholderId}"`)
  if (!(choiceOptionCodes(plan).get(placeholder.areaId) ?? []).includes(moduleCode)) {
    throw new PlanError(`Module "${moduleCode}" cannot be chosen for area "${placeholder.areaId}"`)
  }
  if (plan.semesters.some((semester) => semester.moduleCodes.includes(moduleCode))) {
    throw new PlanError(`Module "${moduleCode}" is already planned`)
  }
  return {
    ...plan,
    placeholders: (plan.placeholders ?? []).filter((item) => item.id !== placeholderId),
    semesters: plan.semesters.map((semester) => ({
      ...semester,
      moduleCodes: semester.moduleCodes.map((code) => (code === placeholderId ? moduleCode : code)),
    })),
    backlog: plan.backlog.filter((code) => code !== moduleCode),
  }
}

/**
 * Picks the area the student takes for an area choice such as the Nebenfach, or clears the pick with null. Planned
 * modules stay where they are; validation points out those of areas that are no longer picked.
 */
export function chooseArea(plan: Plan, choiceId: string, areaId: string | null): Plan {
  const choice = plan.areaChoices?.find((item) => item.id === choiceId)
  if (!choice) throw new PlanError(`Unknown area choice "${choiceId}"`)
  if (areaId !== null && !choice.areaIds.includes(areaId)) {
    throw new PlanError(`Area "${areaId}" is not part of area choice "${choiceId}"`)
  }
  const { chosenAreas: previous, ...rest } = plan
  const { [choiceId]: _replaced, ...others } = previous ?? {}
  const chosenAreas = areaId === null ? others : { ...others, [choiceId]: areaId }
  return Object.keys(chosenAreas).length > 0 ? { ...rest, chosenAreas } : rest
}

/** Turns a chosen module back into a placeholder of its area; the module returns to the unplanned modules. */
export function unchooseModule(plan: Plan, moduleCode: string, idSuffix?: string): Plan {
  if (isPlaceholderId(moduleCode)) throw new PlanError(`"${moduleCode}" is a placeholder`)
  const semester = plan.semesters.find((item) => item.moduleCodes.includes(moduleCode))
  if (!semester) throw new PlanError(`Module "${moduleCode}" is not planned in a semester`)
  const areaId = [...choiceOptionCodes(plan)].find(([, codes]) => codes.includes(moduleCode))?.[0]
  if (!areaId) throw new PlanError(`Module "${moduleCode}" is not a choice`)
  const id = newPlaceholderId(plan, idSuffix)
  return {
    ...detachFromGroup(plan, moduleCode),
    placeholders: [...(plan.placeholders ?? []), { id, areaId }],
    semesters: plan.semesters.map((item) => ({
      ...item,
      moduleCodes: item.moduleCodes.map((code) => (code === moduleCode ? id : code)),
    })),
    backlog: [...plan.backlog, moduleCode],
  }
}
