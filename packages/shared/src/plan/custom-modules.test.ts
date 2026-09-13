import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { presetSchema } from '../schema/preset.ts'
import { addCustomModule, removeCustomModule, updateCustomModule } from './custom-modules.ts'
import { moveModule, setModuleResult } from './operations.ts'
import {
  CUSTOM_CATEGORY,
  createPlanFromPreset,
  type Plan,
  planGradeRules,
  planSchema,
  resetPlan,
} from './plan.ts'
import { applyPresetUpdate, diffPresetUpdate, hasPresetChanges } from './preset-update.ts'
import { summarizePlan } from './summary.ts'

const example = presetSchema.parse(
  JSON.parse(readFileSync(new URL('../../examples/informatik-bsc-example.json', import.meta.url), 'utf8')),
)
const fresh = (): Plan =>
  createPlanFromPreset(example, {
    id: 'p',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })

const input = {
  name: 'Robotik-Seminar im Ausland',
  credits: 8,
  grading: 'graded',
  countsTowardAverage: true,
  offering: 'both',
  areaId: null,
} as const

describe('custom modules', () => {
  it('start unplanned and count toward the average with their credits', () => {
    const { plan: added, code } = addCustomModule(fresh(), input)
    expect(code).toBe('custom-1')
    expect(added.backlog).toContain('custom-1')
    expect(added.modules.find((m) => m.code === code)).toMatchObject({
      custom: true,
      category: CUSTOM_CATEGORY,
      credits: 8,
    })
    expect(planSchema.safeParse(added).success).toBe(true)

    let graded = setModuleResult(added, 'INF-101', { kind: 'graded', grade: 1.0 })
    graded = setModuleResult(graded, code, { kind: 'graded', grade: 3.0 })
    // Grundlagen (only INF-101 graded, 8 LP) and the custom module (8 LP) weigh the same.
    expect(summarizePlan(graded).overall.value).toBe('2.0')
  })

  it('never counts ungraded modules and leaves the rules alone without custom modules', () => {
    const { plan } = addCustomModule(fresh(), { ...input, grading: 'pass_fail' })
    expect(plan.modules.at(-1)?.countsTowardAverage).toBe(false)
    const base = fresh()
    expect(planGradeRules(base)).toBe(base.rules)
  })

  it('can be edited, and results go when the grading type changes', () => {
    const { plan: added, code } = addCustomModule(fresh(), input)
    let plan = setModuleResult(added, code, { kind: 'graded', grade: 2.0 })
    plan = updateCustomModule(plan, code, { ...input, name: 'Robotik', credits: 6, areaId: 'wahlpflicht' })
    expect(plan.modules.find((m) => m.code === code)).toMatchObject({ name: 'Robotik', credits: 6 })
    expect(plan.modules.find((m) => m.code === code)?.attempts).toHaveLength(1)
    expect(plan.areas.find((area) => area.id === 'wahlpflicht')?.moduleCodes).toContain(code)
    plan = updateCustomModule(plan, code, { ...input, grading: 'pass_fail', areaId: null })
    expect(plan.modules.find((m) => m.code === code)?.attempts).toEqual([])
    expect(plan.areas.some((area) => area.moduleCodes.includes(code))).toBe(false)
  })

  it('can be deleted from wherever they are', () => {
    const { plan: added, code } = addCustomModule(fresh(), { ...input, areaId: 'wahlpflicht' })
    const plan = removeCustomModule(moveModule(added, code, 's3'), code)
    expect(plan.modules.some((m) => m.code === code)).toBe(false)
    expect(plan.semesters.some((s) => s.moduleCodes.includes(code))).toBe(false)
    expect(plan.areas.some((area) => area.moduleCodes.includes(code))).toBe(false)
    expect(planSchema.safeParse(plan).success).toBe(true)
    expect(() => removeCustomModule(plan, 'INF-101')).toThrow()
  })

  it('survive resets and programme updates', () => {
    const { plan: added, code } = addCustomModule(fresh(), { ...input, areaId: 'wahlpflicht' })
    const plan = setModuleResult(moveModule(added, code, 's2'), code, { kind: 'graded', grade: 1.7 })

    const reset = resetPlan(plan)
    expect(reset.backlog).toContain(code)
    expect(reset.modules.find((m) => m.code === code)?.attempts).toHaveLength(1)
    const cleared = resetPlan(plan, { clearResults: true })
    expect(cleared.modules.find((m) => m.code === code)?.attempts).toEqual([])

    const diff = diffPresetUpdate(plan, example)
    expect(diff.removed).toEqual([])
    expect(hasPresetChanges(diff)).toBe(false)
    const updated = applyPresetUpdate(plan, example)
    expect(updated.modules.find((m) => m.code === code)).toMatchObject({ custom: true })
    expect(updated.semesters[1]?.moduleCodes).toContain(code)
    expect(updated.areas.find((area) => area.id === 'wahlpflicht')?.moduleCodes).toContain(code)
    expect(planSchema.safeParse(updated).success).toBe(true)
  })

  it('rejects invalid data', () => {
    const plan = fresh()
    expect(() => addCustomModule(plan, { ...input, name: '  ' })).toThrow()
    expect(() => addCustomModule(plan, { ...input, credits: 0 })).toThrow()
    expect(() => addCustomModule(plan, { ...input, credits: 2.3 })).toThrow()
    expect(() => addCustomModule(plan, { ...input, areaId: 'nope' })).toThrow()
  })
})
