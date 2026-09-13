import type { PresetSummary } from '../../lib/api.ts'
import { DEGREE_LABEL } from '../../lib/format.ts'

const DEGREE_WORDS = { bsc: 'bachelor', msc: 'master' } as const

/** "Informatik B.Sc." */
export const presetTitle = (preset: PresetSummary): string =>
  `${preset.programmeName} ${DEGREE_LABEL[preset.degree]}`

/** "Informatik B.Sc., Universität Musterstadt, PO 2024": unambiguous, for the input and messages. */
export const presetLabel = (preset: PresetSummary): string =>
  `${presetTitle(preset)}, ${preset.universityName}, ${preset.poVersion}`

/**
 * Presets matching every word of the query in university, programme, degree or PO version, ignoring case.
 * "B.Sc.", "bsc" and "Bachelor" all find a bachelor programme. An empty query matches everything.
 */
export function filterPresets(presets: readonly PresetSummary[], query: string): PresetSummary[] {
  const words = query.toLocaleLowerCase('de').split(/\s+/).filter(Boolean)
  if (words.length === 0) return [...presets]
  return presets.filter((preset) => {
    const text = [
      preset.universityName,
      preset.programmeName,
      DEGREE_LABEL[preset.degree],
      preset.degree,
      DEGREE_WORDS[preset.degree],
      preset.poVersion,
    ]
      .join(' ')
      .toLocaleLowerCase('de')
    return words.every((word) => text.includes(word))
  })
}
