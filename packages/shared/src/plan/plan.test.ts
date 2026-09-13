import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { presetSchema } from '../schema/preset.ts'
import { createGuestDocument, parseGuestDocument } from './document.ts'
import {
  addSemester,
  currentResult,
  locateModule,
  moveModule,
  PlanError,
  removeLastSemester,
  setModuleResult,
} from './operations.ts'
import { createPlanFromPreset, planSchema } from './plan.ts'
import { summarizePlan } from './summary.ts'
import { addTerms, formatTerm, semesterIndexAt, termAt } from './terms.ts'

const preset = presetSchema.parse(
  JSON.parse(
    readFileSync(new URL('../../../../presets/example/informatik-bsc-example.json', import.meta.url), 'utf8'),
  ),
)

const newPlan = () =>
  createPlanFromPreset(preset, {
    id: 'plan-1',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })

const codesOf = (plan: ReturnType<typeof newPlan>) =>
  Object.fromEntries(plan.semesters.map((s) => [s.id, s.moduleCodes]))

describe('terms', () => {
  it('formats winter and summer terms', () => {
    expect(formatTerm({ season: 'winter', year: 2026 })).toBe('WS 2026/27')
    expect(formatTerm({ season: 'winter', year: 2099 })).toBe('WS 2099/00')
    expect(formatTerm({ season: 'summer', year: 2027 })).toBe('SS 2027')
  })

  it('steps through terms in both directions', () => {
    const start = { season: 'winter', year: 2026 } as const
    expect(addTerms(start, 1)).toEqual({ season: 'summer', year: 2027 })
    expect(addTerms(start, 2)).toEqual({ season: 'winter', year: 2027 })
    expect(addTerms({ season: 'summer', year: 2027 }, -1)).toEqual(start)
  })

  it('maps dates to terms at the October and April boundaries', () => {
    expect(termAt(new Date(2026, 9, 1))).toEqual({ season: 'winter', year: 2026 })
    expect(termAt(new Date(2027, 2, 31))).toEqual({ season: 'winter', year: 2026 })
    expect(termAt(new Date(2027, 3, 1))).toEqual({ season: 'summer', year: 2027 })
    expect(termAt(new Date(2027, 8, 30))).toEqual({ season: 'summer', year: 2027 })
  })

  it('finds the semester index for a date', () => {
    const start = { season: 'winter', year: 2026 } as const
    expect(semesterIndexAt(start, new Date(2026, 10, 15))).toBe(0)
    expect(semesterIndexAt(start, new Date(2027, 4, 1))).toBe(1)
    expect(semesterIndexAt(start, new Date(2026, 5, 1))).toBe(-1)
  })
})

describe('createPlanFromPreset', () => {
  it('places modules in their typical semester', () => {
    const plan = newPlan()
    expect(plan.name).toBe('Informatik B.Sc.')
    expect(plan.semesters).toHaveLength(6)
    expect(codesOf(plan)).toMatchObject({
      s1: ['INF-101', 'MAT-101'],
      s3: ['INF-201', 'SQ-101'],
      s6: ['BA-601'],
    })
    expect(plan.backlog).toEqual([])
    expect(plan.modules.every((m) => m.attempts.length === 0)).toBe(true)
    expect(planSchema.safeParse(plan).success).toBe(true)
  })

  it('puts modules without a typical semester in the backlog', () => {
    const custom = structuredClone(preset)
    const module = custom.modules.find((m) => m.code === 'WP-401')
    if (module) delete module.typicalSemester
    const plan = createPlanFromPreset(custom, {
      id: 'p',
      startTerm: { season: 'summer', year: 2027 },
      now: new Date(),
    })
    expect(plan.backlog).toEqual(['WP-401'])
  })

  it('snapshots the preset instead of sharing references', () => {
    const plan = newPlan()
    plan.rules.allowedValues.push(0.7)
    expect(preset.gradeRules.allowedValues).not.toContain(0.7)
  })
})

describe('moveModule', () => {
  it('moves between semesters at a position', () => {
    const plan = moveModule(newPlan(), 'INF-101', 's2', 0)
    expect(codesOf(plan)).toMatchObject({ s1: ['MAT-101'], s2: ['INF-101', 'INF-102', 'MAT-102'] })
  })

  it('reorders within a semester', () => {
    expect(moveModule(newPlan(), 'MAT-101', 's1', 0).semesters[0]?.moduleCodes).toEqual([
      'MAT-101',
      'INF-101',
    ])
  })

  it('moves to the backlog and appends when no index is given', () => {
    const plan = moveModule(newPlan(), 'BA-601', null)
    expect(plan.backlog).toEqual(['BA-601'])
    expect(locateModule(plan, 'BA-601')).toEqual({ semesterId: null, index: 0 })
    expect(moveModule(plan, 'BA-601', 's1').semesters[0]?.moduleCodes).toEqual([
      'INF-101',
      'MAT-101',
      'BA-601',
    ])
  })

  it('does not mutate the original plan', () => {
    const plan = newPlan()
    moveModule(plan, 'INF-101', 's2')
    expect(plan.semesters[0]?.moduleCodes).toEqual(['INF-101', 'MAT-101'])
  })

  it('rejects unknown modules and semesters', () => {
    expect(() => moveModule(newPlan(), 'NOPE', 's1')).toThrow(PlanError)
    expect(() => moveModule(newPlan(), 'INF-101', 's99')).toThrow(PlanError)
  })
})

describe('setModuleResult', () => {
  it('records a graded attempt and derives pass or fail from the grade', () => {
    const passed = setModuleResult(newPlan(), 'INF-101', { kind: 'graded', grade: 1.3 })
    const module = passed.modules.find((m) => m.code === 'INF-101')
    expect(module?.attempts).toEqual([{ attemptNo: 1, result: 'passed', grade: 1.3 }])
    expect(module && currentResult(module)).toEqual({ kind: 'graded', grade: 1.3 })

    const failed = setModuleResult(newPlan(), 'INF-101', { kind: 'graded', grade: 5 })
    expect(failed.modules.find((m) => m.code === 'INF-101')?.attempts[0]?.result).toBe('failed')
  })

  it('handles pass/fail modules and clearing', () => {
    let plan = setModuleResult(newPlan(), 'SQ-101', { kind: 'passed' })
    const module = plan.modules.find((m) => m.code === 'SQ-101')
    expect(module && currentResult(module)).toEqual({ kind: 'passed' })
    plan = setModuleResult(plan, 'SQ-101', { kind: 'open' })
    expect(plan.modules.find((m) => m.code === 'SQ-101')?.attempts).toEqual([])
  })

  it('rejects entries that do not fit the module or rules', () => {
    expect(() => setModuleResult(newPlan(), 'INF-101', { kind: 'graded', grade: 1.5 })).toThrow(PlanError)
    expect(() => setModuleResult(newPlan(), 'SQ-101', { kind: 'graded', grade: 1.0 })).toThrow(PlanError)
    expect(() => setModuleResult(newPlan(), 'INF-101', { kind: 'passed' })).toThrow(PlanError)
  })
})

describe('semesters', () => {
  it('adds a semester with the next id', () => {
    expect(addSemester(newPlan()).semesters.at(-1)).toEqual({ id: 's7', kind: 'regular', moduleCodes: [] })
  })

  it('removes the last semester and keeps its modules in the backlog', () => {
    const plan = removeLastSemester(newPlan())
    expect(plan.semesters).toHaveLength(5)
    expect(plan.backlog).toEqual(['BA-601'])
    expect(planSchema.safeParse(plan).success).toBe(true)
  })

  it('keeps at least one semester', () => {
    let plan = newPlan()
    while (plan.semesters.length > 1) plan = removeLastSemester(plan)
    expect(() => removeLastSemester(plan)).toThrow(PlanError)
  })
})

describe('summarizePlan', () => {
  it('summarises a fresh plan', () => {
    const summary = summarizePlan(newPlan())
    expect(summary.overall.value).toBeNull()
    expect(summary.credits).toEqual({ earned: 0, planned: 77, required: 180 })
    expect(summary.semesters[0]).toEqual({
      id: 's1',
      number: 1,
      term: { season: 'winter', year: 2026 },
      label: 'WS 2026/27',
      credits: 17,
      load: 'low',
    })
    expect(summary.semesters[1]?.label).toBe('SS 2027')
  })

  it('updates the average, earned credits and areas as results come in', () => {
    let plan = newPlan()
    plan = setModuleResult(plan, 'INF-101', { kind: 'graded', grade: 1.3 })
    plan = setModuleResult(plan, 'INF-102', { kind: 'graded', grade: 2.0 })
    plan = setModuleResult(plan, 'SQ-101', { kind: 'passed' })
    const summary = summarizePlan(plan)
    // Grundlagen group: (1.3*8 + 2.0*8) / 16 = 1.65, truncated to 1.6
    expect(summary.overall.value).toBe('1.6')
    expect(summary.credits.earned).toBe(21)
    expect(summary.areas.find((a) => a.id === 'pflicht')).toMatchObject({
      earnedCredits: 16,
      plannedCredits: 48,
    })
    expect(summary.areas.find((a) => a.id === 'schluesselqualifikationen')?.earnedCredits).toBe(5)
  })

  it('flags semester load and excludes backlog modules from planned credits', () => {
    let plan = newPlan()
    for (const code of ['INF-102', 'MAT-102', 'INF-202', 'WP-401']) plan = moveModule(plan, code, 's1')
    plan = moveModule(plan, 'BA-601', null)
    const summary = summarizePlan(plan)
    expect(summary.semesters[0]).toMatchObject({ credits: 48, load: 'high' })
    expect(summary.semesters[5]).toMatchObject({ credits: 0, load: 'empty' })
    expect(summary.credits.planned).toBe(65)
  })
})

describe('parseGuestDocument', () => {
  const document = () => JSON.parse(JSON.stringify(createGuestDocument(newPlan())))

  it('round-trips through JSON', () => {
    const result = parseGuestDocument(document())
    expect(result).toEqual({ success: true, document: createGuestDocument(newPlan()) })
  })

  it('rejects files that are not plans', () => {
    expect(parseGuestDocument(null)).toMatchObject({ success: false, reason: 'not_a_plan' })
    expect(parseGuestDocument({ hello: 'world' })).toMatchObject({ success: false, reason: 'not_a_plan' })
  })

  it('rejects files from a newer app version', () => {
    expect(parseGuestDocument({ ...document(), schemaVersion: 2 })).toMatchObject({
      success: false,
      reason: 'newer_version',
    })
  })

  it('rejects broken invariants', () => {
    const broken = document()
    broken.plan.backlog.push('INF-101')
    const result = parseGuestDocument(broken)
    expect(result.success).toBe(false)
    expect(!result.success && result.details).toContain('must be placed exactly once')
  })
})
