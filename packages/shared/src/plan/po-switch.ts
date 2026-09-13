import type { Prerequisite, Preset, PresetTransition } from '../schema/preset.ts'
import type { Plan } from './plan.ts'
import { applyPresetUpdate, diffPresetUpdate, type PresetDiff } from './preset-update.ts'

export interface AvailableTransition {
  preset: Preset
  transition: PresetTransition
}

/** Presets the plan can switch to, i.e. newer POs that declare a transition from the plan's preset. */
export function findTransitions(plan: Plan, presets: readonly Preset[]): AvailableTransition[] {
  return presets.flatMap((preset) =>
    (preset.transitions ?? [])
      .filter((transition) => transition.fromPresetId === plan.preset.id && preset.id !== plan.preset.id)
      .map((transition) => ({ preset, transition })),
  )
}

export interface MappedModule {
  from: string
  fromName: string
  to: string
  toName: string
  hasResult: boolean
}

interface Renaming {
  plan: Plan
  mapped: MappedModule[]
}

/**
 * Renames modules according to the transition. When the plan already has a module under the target code,
 * the one with results wins and the other is removed.
 */
function renameModules(plan: Plan, preset: Preset, transition: PresetTransition): Renaming {
  const byCode = new Map(plan.modules.map((module) => [module.code, module]))
  const rename = new Map(
    transition.moduleMap
      .filter(({ from, to }) => from !== to && byCode.has(from))
      .map(({ from, to }) => [from, to] as const),
  )

  const dropped = new Set<string>()
  for (const [from, to] of rename) {
    const existing = byCode.get(to)
    if (!existing || rename.has(to)) continue
    const incoming = byCode.get(from)
    if (existing.attempts.length > 0 && incoming?.attempts.length === 0) dropped.add(from)
    else dropped.add(to)
  }

  const newCode = (code: string) => (dropped.has(code) ? code : (rename.get(code) ?? code))
  const codes = (list: readonly string[]) => list.filter((code) => !dropped.has(code)).map(newCode)
  const renamePrerequisite = (prerequisite: Prerequisite): Prerequisite =>
    typeof prerequisite === 'string' ? newCode(prerequisite) : { anyOf: prerequisite.anyOf.map(newCode) }

  const mapped: MappedModule[] = [...rename]
    .filter(([from]) => !dropped.has(from))
    .map(([from, to]) => {
      const module = byCode.get(from)
      return {
        from,
        fromName: module?.name ?? from,
        to,
        toName: preset.modules.find((candidate) => candidate.code === to)?.name ?? to,
        hasResult: (module?.attempts.length ?? 0) > 0,
      }
    })

  return {
    mapped,
    plan: {
      ...plan,
      modules: plan.modules
        .filter((module) => !dropped.has(module.code))
        .map((module) => ({
          ...module,
          code: newCode(module.code),
          ...(module.prerequisites ? { prerequisites: module.prerequisites.map(renamePrerequisite) } : {}),
        })),
      semesters: plan.semesters.map((semester) => ({
        ...semester,
        moduleCodes: codes(semester.moduleCodes),
      })),
      backlog: codes(plan.backlog),
    },
  }
}

export interface PoSwitchPreview {
  /** Modules that continue under a new code, with their results where they fit. */
  mapped: MappedModule[]
  /** Everything else, as for a preset update after the renaming. */
  diff: PresetDiff
}

export function previewPoSwitch(plan: Plan, preset: Preset, transition: PresetTransition): PoSwitchPreview {
  const renamed = renameModules(plan, preset, transition)
  return { mapped: renamed.mapped, diff: diffPresetUpdate(renamed.plan, preset) }
}

/**
 * Moves a plan to another preset, typically a newer Prüfungsordnung. Mapped modules keep placement, results
 * and exam dates under their new code; the rest follows the preset update rules.
 */
export function switchPo(plan: Plan, preset: Preset, transition: PresetTransition): Plan {
  if (transition.fromPresetId !== plan.preset.id) {
    throw new Error(`Transition from "${transition.fromPresetId}" does not apply to "${plan.preset.id}"`)
  }
  return applyPresetUpdate(renameModules(plan, preset, transition).plan, preset)
}
