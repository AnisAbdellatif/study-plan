import { type Preset, presetSchema } from '@study-plan/shared'
import example from '../../../presets/example/informatik-bsc-example.json'
import example2027 from '../../../presets/example/informatik-bsc-example-2027.json'
import luhTechnischeInformatik from '../../../presets/luh/technische-informatik-bsc-2026.json'

export interface PresetEntry {
  preset: Preset
  /** Fictional presets exist for demos and tests and are labelled as such in the UI. */
  fictional: boolean
  /** A newer bundled preset declares a transition from this one. New plans should use the newer one. */
  superseded: boolean
}

const bundled = [
  { preset: presetSchema.parse(luhTechnischeInformatik), fictional: false },
  { preset: presetSchema.parse(example2027), fictional: true },
  { preset: presetSchema.parse(example), fictional: true },
]

/** Presets bundled with the app, validated at startup so a broken file fails loudly. */
export const presets: readonly PresetEntry[] = bundled.map((entry) => ({
  ...entry,
  superseded: bundled.some((other) =>
    other.preset.transitions?.some((transition) => transition.fromPresetId === entry.preset.id),
  ),
}))

/** The presets offered when creating a plan. Older POs stay bundled so existing plans can switch. */
export const currentPresets: readonly PresetEntry[] = presets.filter((entry) => !entry.superseded)

export const findPreset = (id: string): PresetEntry | undefined =>
  presets.find((entry) => entry.preset.id === id)
