import { gradeToTenths } from '../engine/units.ts'
import type { Preset, PresetModule } from '../schema/preset.ts'
import { type Plan, type PlanModule, type PresetInfo, presetInfoFrom } from './plan.ts'

export type ModuleField =
  | 'name'
  | 'credits'
  | 'grading'
  | 'countsTowardAverage'
  | 'category'
  | 'offering'
  | 'typicalSemester'
  | 'prerequisites'
  | 'requiresCredits'
  | 'maxAttempts'
  | 'details'

const MODULE_FIELDS: ModuleField[] = [
  'name',
  'credits',
  'grading',
  'countsTowardAverage',
  'category',
  'offering',
  'typicalSemester',
  'prerequisites',
  'requiresCredits',
  'maxAttempts',
  'details',
]

export interface ModuleChange {
  code: string
  name: string
  fields: ModuleField[]
  /** The module's results no longer fit (grading changed or grade no longer allowed) and will be removed. */
  resultCleared: boolean
}

export interface RemovedModule {
  code: string
  name: string
  /** Modules with a result stay in the plan as history; untouched ones are removed. */
  kept: boolean
}

export interface PresetDiff {
  added: PresetModule[]
  removed: RemovedModule[]
  changed: ModuleChange[]
  info: (keyof PresetInfo)[]
  rulesChanged: boolean
  areasChanged: boolean
  targetGradeCleared: boolean
}

/** JSON with sorted keys and without undefined values, so equal data compares equal. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

const same = (a: unknown, b: unknown): boolean => stable(a) === stable(b)

const hasResult = (module: PlanModule): boolean => module.attempts.length > 0

function resultStillFits(module: PlanModule, next: PresetModule, allowed: ReadonlySet<number>): boolean {
  if (!hasResult(module)) return true
  if (module.grading !== next.grading) return false
  return module.attempts.every(
    (attempt) => attempt.grade === undefined || allowed.has(gradeToTenths(attempt.grade)),
  )
}

export function diffPresetUpdate(plan: Plan, preset: Preset): PresetDiff {
  const current = new Map(plan.modules.map((module) => [module.code, module]))
  const incoming = new Set(preset.modules.map((module) => module.code))
  const allowed = new Set(preset.gradeRules.allowedValues.map(gradeToTenths))

  const added = preset.modules.filter((module) => !current.has(module.code))
  const removed = plan.modules
    .filter((module) => !incoming.has(module.code) && !module.retired)
    .map((module) => ({ code: module.code, name: module.name, kept: hasResult(module) }))

  const changed: ModuleChange[] = []
  for (const next of preset.modules) {
    const module = current.get(next.code)
    if (!module) continue
    const fields = MODULE_FIELDS.filter((field) => !same(module[field], next[field]))
    const resultCleared = !resultStillFits(module, next, allowed)
    if (fields.length > 0 || resultCleared)
      changed.push({ code: next.code, name: next.name, fields, resultCleared })
  }

  const info = presetInfoFrom(preset)
  const infoKeys = Object.keys(info) as (keyof PresetInfo)[]
  const infoChanged = infoKeys.filter((key) => !same(plan.preset[key], info[key]))

  return {
    added,
    removed,
    changed,
    info: infoChanged,
    rulesChanged: !same(plan.rules, preset.gradeRules),
    areasChanged: !same(plan.areas, preset.areas),
    targetGradeCleared:
      plan.targetGrade !== undefined && !preset.gradeRules.allowedValues.includes(plan.targetGrade),
  }
}

export const hasPresetChanges = (diff: PresetDiff): boolean =>
  diff.added.length > 0 ||
  diff.removed.length > 0 ||
  diff.changed.length > 0 ||
  diff.info.length > 0 ||
  diff.rulesChanged ||
  diff.areasChanged

/**
 * Moves a plan to a newer version of its preset. Placements, results and exam dates are kept wherever they
 * still fit. New modules go to the backlog, untouched removed modules disappear, removed modules with a result
 * stay as history, and results that no longer fit are cleared.
 */
export function applyPresetUpdate(plan: Plan, preset: Preset): Plan {
  const current = new Map(plan.modules.map((module) => [module.code, module]))
  const allowed = new Set(preset.gradeRules.allowedValues.map(gradeToTenths))

  const updated: PlanModule[] = preset.modules.map((next) => {
    const module = current.get(next.code)
    const snapshot = structuredClone(next)
    if (!module) return { ...snapshot, attempts: [] }
    const kept = resultStillFits(module, next, allowed)
    return {
      ...snapshot,
      attempts: kept ? module.attempts : [],
      ...(module.examDate ? { examDate: module.examDate } : {}),
    }
  })
  const incoming = new Set(preset.modules.map((module) => module.code))
  const history = plan.modules
    .filter((module) => !incoming.has(module.code) && hasResult(module))
    .map((module) => ({ ...module, retired: true as const }))
  const modules = [...updated, ...history]
  const remaining = new Set(modules.map((module) => module.code))

  const placed = new Set(plan.semesters.flatMap((semester) => semester.moduleCodes))
  const backlog = [
    ...plan.backlog.filter((code) => remaining.has(code)),
    ...preset.modules.filter((module) => !current.has(module.code)).map((module) => module.code),
  ]
  // Kept history modules that were never placed stay reachable in the backlog.
  for (const module of history) {
    if (!placed.has(module.code) && !backlog.includes(module.code)) backlog.push(module.code)
  }

  const { targetGrade, ...rest } = plan
  const keepTarget = targetGrade !== undefined && preset.gradeRules.allowedValues.includes(targetGrade)

  return {
    ...rest,
    ...(keepTarget ? { targetGrade } : {}),
    preset: presetInfoFrom(preset),
    rules: structuredClone(preset.gradeRules),
    areas: structuredClone(preset.areas),
    semesters: plan.semesters.map((semester) => ({
      ...semester,
      moduleCodes: semester.moduleCodes.filter((code) => remaining.has(code)),
    })),
    backlog,
    modules,
  }
}
