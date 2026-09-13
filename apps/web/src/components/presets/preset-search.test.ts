import { describe, expect, it } from 'vitest'
import type { PresetSummary } from '../../lib/api.ts'
import { filterPresets, presetLabel } from './preset-search.ts'

const summary = (
  id: string,
  universityName: string,
  programmeName: string,
  degree: 'bsc' | 'msc',
  poVersion: string,
): PresetSummary => ({
  id,
  universityName,
  programmeName,
  degree,
  poVersion,
  updatedAt: '2026-09-01T10:00:00Z',
})

const presets = [
  summary('1', 'Leibniz Universität Hannover', 'Informatik', 'bsc', 'PO 2017'),
  summary('2', 'Leibniz Universität Hannover', 'Informatik', 'msc', 'PO 2023'),
  summary('3', 'TU München', 'Maschinenbau', 'bsc', 'FPSO 2022'),
]

const ids = (query: string) => filterPresets(presets, query).map((preset) => preset.id)

describe('filterPresets', () => {
  it('matches everything for an empty query', () => {
    expect(ids('  ')).toEqual(['1', '2', '3'])
  })

  it('requires every word to match somewhere, ignoring case', () => {
    expect(ids('informatik HANNOVER')).toEqual(['1', '2'])
    expect(ids('informatik münchen')).toEqual([])
    expect(ids('hannover 2023')).toEqual(['2'])
  })

  it('finds degrees by label, code or name', () => {
    expect(ids('M.Sc.')).toEqual(['2'])
    expect(ids('bsc')).toEqual(['1', '3'])
    expect(ids('master')).toEqual(['2'])
  })

  it('labels a preset unambiguously', () => {
    expect(presetLabel(presets[2] as PresetSummary)).toBe('Maschinenbau B.Sc., TU München, FPSO 2022')
  })
})
