import type { PresetArea, PresetAreaChoice } from '../schema/preset.ts'

/** What decides which areas of a preset or plan apply. */
export interface AreaChoiceState {
  areaChoices?: readonly PresetAreaChoice[]
  /** Area choice id → id of the area the student picked. */
  chosenAreas?: Readonly<Record<string, string>>
}

/**
 * Areas that don't apply yet: the areas of a choice (e.g. every Nebenfach) other than the one the student picked,
 * or all of them while nothing is picked. Their credit requirements don't count and all their modules are options.
 */
export function inactiveAreaIds(state: AreaChoiceState): Set<string> {
  const inactive = new Set<string>()
  for (const choice of state.areaChoices ?? []) {
    const chosen = state.chosenAreas?.[choice.id]
    for (const areaId of choice.areaIds) if (areaId !== chosen) inactive.add(areaId)
  }
  return inactive
}

/** An area choice such as the Nebenfach and the area the student picked, if any. */
export interface AreaChoiceStatus {
  choice: PresetAreaChoice
  chosenAreaId: string | null
}

export const areaChoiceStatuses = (state: AreaChoiceState): AreaChoiceStatus[] =>
  (state.areaChoices ?? []).map((choice) => ({
    choice,
    chosenAreaId: state.chosenAreas?.[choice.id] ?? null,
  }))

/** The area choice an area belongs to, if any. */
export const choiceOfArea = (state: AreaChoiceState, areaId: string): PresetAreaChoice | undefined =>
  state.areaChoices?.find((choice) => choice.areaIds.includes(areaId))

/**
 * Modules that only belong to areas that don't apply yet. They start unplanned, so the compulsory modules of a
 * Nebenfach only become open work once the student picks that Nebenfach.
 */
export function heldBackModuleCodes(areas: readonly PresetArea[], state: AreaChoiceState): Set<string> {
  const inactive = inactiveAreaIds(state)
  if (inactive.size === 0) return new Set()
  const active = new Set(areas.filter((area) => !inactive.has(area.id)).flatMap((area) => area.moduleCodes))
  return new Set(
    areas
      .filter((area) => inactive.has(area.id))
      .flatMap((area) => area.moduleCodes)
      .filter((code) => !active.has(code)),
  )
}
