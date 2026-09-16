import type { PresetModule } from '../schema/preset.ts'
import { creditValueSchema } from '../schema/rules.ts'
import { findModule, PlanError } from './operations.ts'
import { CUSTOM_CATEGORY, detachFromGroup, type Plan, type PlanModule } from './plan.ts'

export interface CustomModuleInput {
  name: string
  credits: number
  grading: 'graded' | 'pass_fail'
  /** Ignored for ungraded modules, which never count. */
  countsTowardAverage: boolean
  offering: PresetModule['offering']
  /** Area the module's credits belong to, or null for none. */
  areaId: string | null
}

function validated(plan: Plan, input: CustomModuleInput): CustomModuleInput {
  const name = input.name.trim()
  if (name.length === 0 || name.length > 200) throw new PlanError('A custom module needs a name')
  if (input.credits <= 0 || !creditValueSchema.safeParse(input.credits).success) {
    throw new PlanError(`Invalid credits ${input.credits}`)
  }
  if (input.areaId !== null && !plan.areas.some((area) => area.id === input.areaId)) {
    throw new PlanError(`Unknown area "${input.areaId}"`)
  }
  return { ...input, name, countsTowardAverage: input.grading === 'graded' && input.countsTowardAverage }
}

const nextCode = (plan: Plan): string => {
  const taken = new Set(plan.modules.map((module) => module.code))
  let index = 1
  while (taken.has(`custom-${index}`)) index++
  return `custom-${index}`
}

const withArea = (plan: Plan, code: string, areaId: string | null): Plan['areas'] =>
  plan.areas.map((area) => {
    const others = area.moduleCodes.filter((item) => item !== code)
    return { ...area, moduleCodes: area.id === areaId ? [...others, code] : others }
  })

/** Adds a module the student defines. It starts unplanned. */
export function addCustomModule(plan: Plan, input: CustomModuleInput): { plan: Plan; code: string } {
  const data = validated(plan, input)
  const code = nextCode(plan)
  const module: PlanModule = {
    code,
    name: data.name,
    credits: data.credits,
    grading: data.grading,
    countsTowardAverage: data.countsTowardAverage,
    category: CUSTOM_CATEGORY,
    offering: data.offering,
    attempts: [],
    custom: true,
  }
  return {
    code,
    plan: {
      ...plan,
      modules: [...plan.modules, module],
      backlog: [...plan.backlog, code],
      areas: withArea(plan, code, data.areaId),
    },
  }
}

/** Changes a custom module. Results are removed when the grading type changes, because they no longer fit. */
export function updateCustomModule(plan: Plan, code: string, input: CustomModuleInput): Plan {
  const current = findModule(plan, code)
  if (!current.custom) throw new PlanError(`Module "${code}" is not a custom module`)
  const data = validated(plan, input)
  return {
    ...plan,
    areas: withArea(plan, code, data.areaId),
    modules: plan.modules.map((module) =>
      module.code === code
        ? {
            ...module,
            name: data.name,
            credits: data.credits,
            grading: data.grading,
            countsTowardAverage: data.countsTowardAverage,
            offering: data.offering,
            attempts: module.grading === data.grading ? module.attempts : [],
          }
        : module,
    ),
  }
}

export function removeCustomModule(plan: Plan, code: string): Plan {
  if (!findModule(plan, code).custom) throw new PlanError(`Module "${code}" is not a custom module`)
  const drop = (codes: readonly string[]) => codes.filter((item) => item !== code)
  return {
    ...detachFromGroup(plan, code),
    modules: plan.modules.filter((module) => module.code !== code),
    semesters: plan.semesters.map((semester) => ({ ...semester, moduleCodes: drop(semester.moduleCodes) })),
    backlog: drop(plan.backlog),
    areas: plan.areas.map((area) => ({ ...area, moduleCodes: drop(area.moduleCodes) })),
  }
}

/** The area a custom module belongs to, if any. */
export const customModuleArea = (plan: Plan, code: string): string | null =>
  plan.areas.find((area) => area.moduleCodes.includes(code))?.id ?? null
