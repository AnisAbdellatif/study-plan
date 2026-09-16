import { describe, expect, it } from 'vitest'
import { type Preset, presetSchema } from '../schema/preset.ts'
import { creditRequirements } from './eligibility.ts'
import { setModuleResult, setSelfStudy } from './operations.ts'
import { createPlanFromPreset, type Plan } from './plan.ts'
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
  typicalSemester: 1,
  ...extra,
})

const modules = [
  graded('PF', 10),
  graded('KURS', 5),
  graded('BA', 10, { typicalSemester: 2, requiresCredits: 15 }),
]

const preset: Preset = presetSchema.parse({
  schemaVersion: 1,
  id: 'custom/test',
  university: { slug: 'uni', name: 'Uni' },
  programme: { slug: 'inf', name: 'Informatik', degree: 'bsc' },
  poVersion: 'PO',
  handbookVersion: 'MK',
  standardSemesters: 2,
  totalCredits: 25,
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
    { id: 'pflicht', name: 'Pflicht', minCredits: 15, maxCredits: 15, moduleCodes: ['PF', 'KURS'] },
    { id: 'abschluss', name: 'Abschluss', minCredits: 10, moduleCodes: ['BA'] },
  ],
})

/** Both modules of the compulsory area passed: PF with 1.0, the 5 LP course with 4.0. */
const passedPlan = (): Plan => {
  const plan = createPlanFromPreset(preset, {
    id: 'p',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
  return setModuleResult(setModuleResult(plan, 'PF', { kind: 'graded', grade: 1.0 }), 'KURS', {
    kind: 'graded',
    grade: 4.0,
  })
}

describe('modules the student only wants to learn', () => {
  it('keeps them out of credits, the average and the area requirement', () => {
    const counting = summarizePlan(passedPlan())
    expect(counting.credits.earned).toBe(15)
    expect(counting.overall.value).toBe('2.0')
    expect(counting.areas[0]).toMatchObject({ id: 'pflicht', earnedCredits: 15, plannedCredits: 15 })

    const plan = setSelfStudy(passedPlan(), 'KURS', true)
    expect(plan.modules.find((module) => module.code === 'KURS')?.selfStudy).toBe(true)

    const summary = summarizePlan(plan)
    expect(summary.credits.earned).toBe(10)
    expect(summary.credits.planned).toBe(20)
    // Only PF is left in the average, and the course no longer fills the area.
    expect(summary.overall.value).toBe('1.0')
    expect(summary.areas[0]).toMatchObject({ id: 'pflicht', earnedCredits: 10, plannedCredits: 10 })
    expect(summary.semesters[0]?.credits).toBe(10)
    expect(validatePlan(plan)).toContainEqual({
      kind: 'area_below_minimum',
      severity: 'info',
      areaId: 'pflicht',
      planned: 10,
      minCredits: 15,
    })
  })

  it('brings no credits toward a module that requires them', () => {
    const [counting] = creditRequirements(passedPlan())
    expect(counting).toMatchObject({ code: 'BA', earnedCredits: 15, eligibleNow: true })

    const [requirement] = creditRequirements(setSelfStudy(passedPlan(), 'KURS', true))
    expect(requirement).toMatchObject({ code: 'BA', earnedCredits: 10, eligibleNow: false })
  })

  it('counts again when the mark is removed, and rejects unknown modules', () => {
    const plan = setSelfStudy(setSelfStudy(passedPlan(), 'KURS', true), 'KURS', false)
    expect(plan.modules.find((module) => module.code === 'KURS')).not.toHaveProperty('selfStudy')
    expect(summarizePlan(plan).credits.earned).toBe(15)
    expect(() => setSelfStudy(plan, 'NOPE', true)).toThrow()
  })
})
