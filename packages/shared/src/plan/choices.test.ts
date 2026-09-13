import { describe, expect, it } from 'vitest'
import { type Preset, presetSchema } from '../schema/preset.ts'
import { createPlanFromPreset } from './plan.ts'

const graded = (code: string, name: string, credits: number, extra: Record<string, unknown> = {}) => ({
  code,
  name,
  credits,
  grading: 'graded',
  countsTowardAverage: true,
  category: 'Akademisches Arbeiten',
  offering: 'both',
  ...extra,
})

// Shaped like the LUH extraction: one compulsory module and a list of Proseminare in a 10 LP area.
const preset = (modules: Record<string, unknown>[], areas: Record<string, unknown>[]): Preset =>
  presetSchema.parse({
    schemaVersion: 1,
    id: 'custom/test',
    university: { slug: 'uni', name: 'Uni' },
    programme: { slug: 'ti', name: 'Technische Informatik', degree: 'bsc' },
    poVersion: 'PO',
    handbookVersion: 'MK',
    standardSemesters: 6,
    totalCredits: 180,
    creditLabel: 'LP',
    codesAreOfficial: false,
    gradeRules: {
      allowedValues: [1.0, 2.0, 3.0, 4.0, 5.0],
      passThreshold: 4.0,
      attemptSelection: 'best',
      finalRounding: { mode: 'truncate', precision: 1 },
      aggregation: {
        id: 'root',
        weightMode: 'credits',
        children: modules.map((module) => ({ kind: 'module', code: module.code })),
      },
    },
    modules,
    areas,
  })

const plan = (value: Preset) =>
  createPlanFromPreset(value, {
    id: 'p',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })

const modules = [
  graded('EINF', 'Einführung in die Informatik', 5, { typicalSemester: 1 }),
  graded('PS-A', 'Proseminar A', 5, { typicalSemester: 4 }),
  graded('PS-B', 'Proseminar B', 5, { typicalSemester: 4 }),
  graded('PS-C', 'Proseminar C', 5, { typicalSemester: 4 }),
  graded('SWP', 'Software-Projekt', 10, { typicalSemester: 4, category: 'Pflicht' }),
]
const areas: Record<string, unknown>[] = [
  {
    id: 'akademisches-arbeiten',
    name: 'Akademisches Arbeiten',
    minCredits: 10,
    maxCredits: 10,
    moduleCodes: ['EINF', 'PS-A', 'PS-B', 'PS-C'],
  },
  { id: 'pflicht', name: 'Pflicht', minCredits: 10, moduleCodes: ['SWP'] },
]

describe('modules the student chooses from', () => {
  it('leaves a list of alternatives unplanned and keeps compulsory modules in their semester', () => {
    const created = plan(preset(modules, areas))
    expect(created.semesters[0]?.moduleCodes).toEqual(['EINF'])
    expect(created.semesters[3]?.moduleCodes).toEqual(['SWP'])
    expect(created.backlog).toEqual(['PS-A', 'PS-B', 'PS-C'])
  })

  it('places modules that fit the area maximum as before', () => {
    const fitting = areas.map((area, index) => (index === 0 ? { ...area, maxCredits: 20 } : area))
    expect(plan(preset(modules, fitting)).backlog).toEqual([])
  })

  it('follows an explicit elective flag in both directions', () => {
    const flagged = modules.map((module) =>
      module.code === 'PS-A'
        ? { ...module, elective: false }
        : module.code === 'SWP'
          ? { ...module, elective: true }
          : module,
    )
    const created = plan(preset(flagged, areas))
    expect(created.semesters[3]?.moduleCodes).toEqual(['PS-A'])
    expect(created.backlog).toEqual(['PS-B', 'PS-C', 'SWP'])
    expect(created.modules.find((module) => module.code === 'SWP')?.typicalSemester).toBe(4)
  })
})
