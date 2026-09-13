import { type Preset, presetSchema } from '@study-plan/shared'
import example from '../../../presets/example/informatik-bsc-example.json'

export interface PresetEntry {
  preset: Preset
  /** Fictional presets exist for demos and tests and are labelled as such in the UI. */
  fictional: boolean
}

/** Presets bundled with the app, validated at startup so a broken file fails loudly. */
export const presets: readonly PresetEntry[] = [{ preset: presetSchema.parse(example), fictional: true }]

export const findPreset = (id: string): PresetEntry | undefined =>
  presets.find((entry) => entry.preset.id === id)
