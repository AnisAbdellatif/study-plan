import { describe, expect, it } from 'vitest'
import { type Preset, presetSchema } from '../schema/preset.ts'
import { moveModule } from './operations.ts'
import { choiceOptionCodes, chooseArea } from './placeholders.ts'
import { createPlanFromPreset, resetPlan } from './plan.ts'
import { applyPresetUpdate, diffPresetUpdate } from './preset-update.ts'
import { summarizePlan } from './summary.ts'
import { validatePlan } from './validation.ts'

const graded = (code: string, credits: number, extra: Record<string, unknown> = {}) => ({
  code,
  name: code,
  credits,
  grading: 'graded',
  countsTowardAverage: true,
  category: 'Test',
  offering: 'both',
  ...extra,
})

const modules = [
  graded('PF', 10, { typicalSemester: 1 }),
  // Nebenfach A: one compulsory module, two to choose from.
  graded('A-P1', 5, { typicalSemester: 3 }),
  graded('A-W1', 5, { elective: true }),
  graded('A-W2', 5, { elective: true }),
  // Nebenfach B: one compulsory module, one to choose from.
  graded('B-P1', 5, { typicalSemester: 3 }),
  graded('B-W1', 5, { elective: true }),
]

const presetData = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  id: 'custom/test',
  university: { slug: 'uni', name: 'Uni' },
  programme: { slug: 'inf', name: 'Informatik', degree: 'bsc' },
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
  areas: [
    { id: 'pflicht', name: 'Pflicht', minCredits: 10, moduleCodes: ['PF'] },
    {
      id: 'nf-a',
      name: 'Nebenfach A',
      minCredits: 10,
      maxCredits: 15,
      moduleCodes: ['A-P1', 'A-W1', 'A-W2'],
    },
    { id: 'nf-b', name: 'Nebenfach B', minCredits: 10, maxCredits: 15, moduleCodes: ['B-P1', 'B-W1'] },
  ],
  areaChoices: [{ id: 'nebenfach', name: 'Nebenfach', areaIds: ['nf-a', 'nf-b'] }],
  ...overrides,
})

const preset = (overrides: Record<string, unknown> = {}): Preset => presetSchema.parse(presetData(overrides))

const create = (value: Preset = preset()) =>
  createPlanFromPreset(value, {
    id: 'p',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })

const kinds = (plan: ReturnType<typeof create>) => validatePlan(plan).map((issue) => issue.kind)

describe('area choices such as the Nebenfach', () => {
  it('holds back every Nebenfach until the student picks one', () => {
    const plan = create()
    expect(plan.areaChoices).toEqual([{ id: 'nebenfach', name: 'Nebenfach', areaIds: ['nf-a', 'nf-b'] }])
    expect(plan.semesters[0]?.moduleCodes).toEqual(['PF'])
    expect(plan.semesters[2]?.moduleCodes).toEqual([])
    expect(plan.backlog).toEqual(['A-P1', 'A-W1', 'A-W2', 'B-P1', 'B-W1'])

    // Compulsory modules of an unpicked Nebenfach are options, not open work.
    const options = choiceOptionCodes(plan)
    expect(options.get('nf-a')).toEqual(['A-P1', 'A-W1', 'A-W2'])
    expect(options.get('nf-b')).toEqual(['B-P1', 'B-W1'])

    expect(summarizePlan(plan).areas.map((area) => area.id)).toEqual(['pflicht'])
    expect(kinds(plan)).toEqual(['area_choice_missing'])
  })

  it('makes the picked Nebenfach count with its compulsory modules', () => {
    const plan = chooseArea(create(), 'nebenfach', 'nf-a')
    expect(plan.chosenAreas).toEqual({ nebenfach: 'nf-a' })

    const options = choiceOptionCodes(plan)
    expect(options.get('nf-a')).toEqual(['A-W1', 'A-W2'])
    expect(options.get('nf-b')).toEqual(['B-P1', 'B-W1'])

    expect(summarizePlan(plan).areas.map((area) => area.id)).toEqual(['pflicht', 'nf-a'])
    expect(validatePlan(plan)).toEqual([
      { kind: 'area_below_minimum', severity: 'info', areaId: 'nf-a', planned: 0, minCredits: 10 },
    ])

    // A reset places the picked Nebenfach's compulsory module in its recommended semester.
    expect(resetPlan(plan).semesters[2]?.moduleCodes).toEqual(['A-P1'])
  })

  it('warns about modules planned from a Nebenfach that is not picked', () => {
    const picked = moveModule(chooseArea(create(), 'nebenfach', 'nf-a'), 'B-P1', 's3')
    expect(validatePlan(picked)).toContainEqual({
      kind: 'area_choice_conflict',
      severity: 'warning',
      choiceId: 'nebenfach',
      areaIds: ['nf-b'],
      chosenAreaId: 'nf-a',
    })
    // The unpicked area shows in the summary while it holds a module.
    expect(summarizePlan(picked).areas.map((area) => area.id)).toEqual(['pflicht', 'nf-a', 'nf-b'])

    const unpicked = moveModule(moveModule(create(), 'A-P1', 's3'), 'B-P1', 's3')
    expect(validatePlan(unpicked)).toEqual([
      { kind: 'area_choice_conflict', severity: 'warning', choiceId: 'nebenfach', areaIds: ['nf-a', 'nf-b'] },
    ])
    expect(kinds(moveModule(create(), 'A-P1', 's3'))).toEqual(['area_choice_missing'])
  })

  it('clears a pick and rejects unknown choices and areas', () => {
    const cleared = chooseArea(chooseArea(create(), 'nebenfach', 'nf-a'), 'nebenfach', null)
    expect(cleared).not.toHaveProperty('chosenAreas')
    expect(() => chooseArea(create(), 'schwerpunkt', 'nf-a')).toThrow('Unknown area choice')
    expect(() => chooseArea(create(), 'nebenfach', 'pflicht')).toThrow('not part of area choice')
  })

  it('asks for no pick when the choice is optional', () => {
    const optional = preset({
      areaChoices: [{ id: 'nebenfach', name: 'Nebenfach', areaIds: ['nf-a', 'nf-b'], optional: true }],
    })
    expect(kinds(create(optional))).toEqual([])
  })

  it('rejects choices with unknown or shared areas', () => {
    const unknown = presetSchema.safeParse(
      presetData({ areaChoices: [{ id: 'nebenfach', name: 'Nebenfach', areaIds: ['nf-a', 'nf-x'] }] }),
    )
    expect(unknown.error?.issues.map((issue) => issue.message)).toEqual(['Unknown area "nf-x"'])

    const shared = presetSchema.safeParse(
      presetData({
        areaChoices: [
          { id: 'nebenfach', name: 'Nebenfach', areaIds: ['nf-a', 'nf-b'] },
          { id: 'schwerpunkt', name: 'Schwerpunkt', areaIds: ['nf-b', 'pflicht'] },
        ],
      }),
    )
    expect(shared.error?.issues.map((issue) => issue.message)).toEqual([
      'Area "nf-b" is already part of area choice "nebenfach"',
    ])
  })

  it('brings choices into older plans through a preset update and keeps valid picks', () => {
    const withoutChoices = preset({ areaChoices: undefined })
    const old = create(withoutChoices)
    expect(old).not.toHaveProperty('areaChoices')
    expect(diffPresetUpdate(old, preset()).areasChanged).toBe(true)
    expect(applyPresetUpdate(old, preset()).areaChoices).toEqual(preset().areaChoices)

    const picked = chooseArea(create(), 'nebenfach', 'nf-b')
    expect(diffPresetUpdate(picked, preset()).areasChanged).toBe(false)
    expect(applyPresetUpdate(picked, preset()).chosenAreas).toEqual({ nebenfach: 'nf-b' })

    const narrowed = preset({
      areaChoices: [{ id: 'nebenfach', name: 'Nebenfach', areaIds: ['nf-a', 'pflicht'] }],
    })
    expect(applyPresetUpdate(picked, narrowed)).not.toHaveProperty('chosenAreas')
  })
})
