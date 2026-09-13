import { describe, expect, it } from 'vitest'
import { type Preset, presetSchema } from '../schema/preset.ts'
import { moveModule } from './operations.ts'
import {
  addPlaceholder,
  choiceAreas,
  choiceOptionCodes,
  choosePlaceholder,
  removePlaceholder,
  unchooseModule,
} from './placeholders.ts'
import { createPlanFromPreset, type Plan, planSchema, resetPlan } from './plan.ts'
import { applyPresetUpdate } from './preset-update.ts'
import { summarizePlan } from './summary.ts'
import { validatePlan } from './validation.ts'

const module = (code: string, credits: number, extra: Record<string, unknown> = {}) => ({
  code,
  name: `Modul ${code}`,
  credits,
  grading: 'graded',
  countsTowardAverage: true,
  category: 'Bereich',
  offering: 'both',
  ...extra,
})

const modules = [
  module('EINF', 5, { typicalSemester: 1 }),
  module('PS-A', 5, { typicalSemester: 4 }),
  module('PS-B', 5, { typicalSemester: 4 }),
  module('PS-C', 5, { typicalSemester: 4 }),
  module('V-1', 5),
  module('V-2', 5),
  module('V-3', 5),
  module('V-4', 5),
  module('V-5', 10),
  module('SWP', 10, { typicalSemester: 4 }),
]

const areas = [
  {
    id: 'akademisches-arbeiten',
    name: 'Akademisches Arbeiten',
    minCredits: 10,
    maxCredits: 10,
    moduleCodes: ['EINF', 'PS-A', 'PS-B', 'PS-C'],
  },
  {
    id: 'vertiefung',
    name: 'Vertiefung der Informatik',
    minCredits: 10,
    maxCredits: 20,
    moduleCodes: ['V-1', 'V-2', 'V-3', 'V-4', 'V-5'],
  },
  { id: 'pflicht', name: 'Pflicht', minCredits: 10, moduleCodes: ['SWP'] },
]

const buildPreset = (list: Record<string, unknown>[], areaList: Record<string, unknown>[]): Preset =>
  presetSchema.parse({
    schemaVersion: 1,
    id: 'custom/test',
    university: { slug: 'uni', name: 'Uni' },
    programme: { slug: 'ti', name: 'TI', degree: 'bsc' },
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
        children: list.map((m) => ({ kind: 'module', code: m.code })),
      },
    },
    modules: list,
    areas: areaList,
  })

const preset = buildPreset(modules, areas)
const fresh = (): Plan =>
  createPlanFromPreset(preset, {
    id: 'p',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })

const semester = (plan: Plan, id: string) => plan.semesters.find((item) => item.id === id)?.moduleCodes

describe('choice areas', () => {
  it('finds the modules to choose from and leaves compulsory ones out', () => {
    const options = choiceOptionCodes(fresh())
    expect(options.get('akademisches-arbeiten')).toEqual(['PS-A', 'PS-B', 'PS-C'])
    expect(options.get('vertiefung')).toEqual(['V-1', 'V-2', 'V-3', 'V-4', 'V-5'])
    expect(options.has('pflicht')).toBe(false)
  })

  it('estimates a placeholder with the most common credit value', () => {
    const vertiefung = choiceAreas(fresh()).find((choice) => choice.area.id === 'vertiefung')
    expect(vertiefung).toMatchObject({ placeholderCredits: 5, chosenCredits: 0 })
    expect(vertiefung?.available).toHaveLength(5)
  })

  it('uses explicit elective flags when an area has them', () => {
    const flagged = buildPreset(
      modules.map((m) => (m.code === 'V-1' ? { ...m, elective: true } : m)),
      areas,
    )
    const plan = createPlanFromPreset(flagged, {
      id: 'p',
      startTerm: { season: 'winter', year: 2026 },
      now: new Date(),
    })
    expect(choiceOptionCodes(plan).get('vertiefung')).toEqual(['V-1'])
  })
})

describe('placeholders', () => {
  const withPlaceholders = () =>
    addPlaceholder(
      addPlaceholder(fresh(), 'vertiefung', 's5', undefined, 'a'),
      'vertiefung',
      's5',
      undefined,
      'b',
    )

  it('count toward semester load and area planning with their estimate', () => {
    const plan = withPlaceholders()
    expect(planSchema.safeParse(plan).success).toBe(true)
    expect(semester(plan, 's5')).toEqual(['placeholder-a', 'placeholder-b'])
    const summary = summarizePlan(plan)
    expect(summary.semesters[4]).toMatchObject({ credits: 0, placeholders: 2, placeholderCredits: 10 })
    expect(summary.areas.find((area) => area.id === 'vertiefung')).toMatchObject({
      plannedCredits: 0,
      placeholderCredits: 10,
    })
    const belowMinimum = validatePlan(plan).filter((issue) => issue.kind === 'area_below_minimum')
    expect(belowMinimum.map((issue) => issue.kind === 'area_below_minimum' && issue.areaId)).not.toContain(
      'vertiefung',
    )
  })

  it('become the chosen module in place, and can turn back', () => {
    let plan = choosePlaceholder(withPlaceholders(), 'placeholder-a', 'V-5')
    expect(semester(plan, 's5')).toEqual(['V-5', 'placeholder-b'])
    expect(plan.backlog).not.toContain('V-5')
    expect(plan.placeholders).toEqual([{ id: 'placeholder-b', areaId: 'vertiefung' }])
    expect(planSchema.safeParse(plan).success).toBe(true)

    expect(() => choosePlaceholder(plan, 'placeholder-b', 'SWP')).toThrow()
    expect(() => choosePlaceholder(plan, 'placeholder-b', 'V-5')).toThrow()

    plan = unchooseModule(plan, 'V-5', 'c')
    expect(semester(plan, 's5')).toEqual(['placeholder-c', 'placeholder-b'])
    expect(plan.backlog).toContain('V-5')
    expect(planSchema.safeParse(plan).success).toBe(true)
  })

  it('move between semesters and disappear when moved out or removed', () => {
    let plan = moveModule(withPlaceholders(), 'placeholder-b', 's6')
    expect(semester(plan, 's6')).toEqual(['placeholder-b'])
    plan = moveModule(plan, 'placeholder-b', null)
    expect(plan.placeholders?.map((item) => item.id)).toEqual(['placeholder-a'])
    expect(plan.backlog).not.toContain('placeholder-b')
    plan = removePlaceholder(plan, 'placeholder-a')
    expect(plan.placeholders).toEqual([])
    expect(planSchema.safeParse(plan).success).toBe(true)
  })

  it('are removed by a reset and kept by a programme update while their area exists', () => {
    const plan = withPlaceholders()
    const reset = resetPlan(plan)
    expect('placeholders' in reset).toBe(false)
    expect(planSchema.safeParse(reset).success).toBe(true)

    const updated = applyPresetUpdate(plan, preset)
    expect(updated.placeholders).toHaveLength(2)
    expect(semester(updated, 's5')).toEqual(['placeholder-a', 'placeholder-b'])

    const withoutArea = applyPresetUpdate(
      plan,
      buildPreset(
        modules,
        areas.filter((area) => area.id !== 'vertiefung'),
      ),
    )
    expect(withoutArea.placeholders ?? []).toEqual([])
    expect(semester(withoutArea, 's5')).toEqual([])
    expect(planSchema.safeParse(withoutArea).success).toBe(true)
  })

  it('are rejected by the schema when unplaced, in the backlog or for an unknown area', () => {
    const plan = fresh()
    expect(
      planSchema.safeParse({ ...plan, placeholders: [{ id: 'placeholder-x', areaId: 'vertiefung' }] })
        .success,
    ).toBe(false)
    expect(
      planSchema.safeParse({
        ...plan,
        placeholders: [{ id: 'placeholder-x', areaId: 'vertiefung' }],
        backlog: [...plan.backlog, 'placeholder-x'],
      }).success,
    ).toBe(false)
    const unknownArea = addPlaceholder(plan, 'vertiefung', 's5', undefined, 'x')
    expect(
      planSchema.safeParse({ ...unknownArea, placeholders: [{ id: 'placeholder-x', areaId: 'nope' }] })
        .success,
    ).toBe(false)
    expect(() => addPlaceholder(plan, 'pflicht', 's5')).toThrow()
  })
})
