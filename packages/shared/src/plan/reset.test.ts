import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { presetSchema } from '../schema/preset.ts'
import { addSemester, moveModule, setExamDate, setModuleResult, setTargetGrade } from './operations.ts'
import { createPlanFromPreset, type Plan, planSchema, resetPlan } from './plan.ts'

const example = presetSchema.parse(
  JSON.parse(readFileSync(new URL('../../examples/informatik-bsc-example.json', import.meta.url), 'utf8')),
)
const fresh = (): Plan =>
  createPlanFromPreset(example, {
    id: 'plan',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })

const edited = (): Plan => {
  let plan = fresh()
  plan = moveModule(plan, 'INF-101', null)
  plan = moveModule(plan, 'BA-601', 's2', 0)
  plan = addSemester(addSemester(plan))
  plan = setModuleResult(plan, 'MAT-101', { kind: 'graded', grade: 1.7 })
  plan = setExamDate(plan, 'INF-102', '2027-07-20')
  return setTargetGrade(plan, 2.0)
}

describe('resetting a plan to its default placement', () => {
  it('puts modules back where a new plan places them and keeps results by default', () => {
    const reset = resetPlan(edited())
    expect(reset.semesters).toEqual(fresh().semesters)
    expect(reset.backlog).toEqual(fresh().backlog)
    expect(reset.modules.find((module) => module.code === 'MAT-101')?.attempts).toHaveLength(1)
    expect(reset.modules.find((module) => module.code === 'INF-102')?.examDate).toBe('2027-07-20')
    expect(reset.targetGrade).toBe(2.0)
    expect(reset.id).toBe('plan')
    expect(planSchema.safeParse(reset).success).toBe(true)
  })

  it('can also remove results, exam dates and the target grade', () => {
    const reset = resetPlan(edited(), { clearResults: true })
    expect(reset.modules.every((module) => module.attempts.length === 0)).toBe(true)
    expect(reset.modules.some((module) => 'examDate' in module)).toBe(false)
    expect('targetGrade' in reset).toBe(false)
    expect(reset).toEqual({ ...fresh(), name: reset.name })
  })

  it('keeps retired modules with results unplanned, and drops them when results are removed', () => {
    const base = setModuleResult(fresh(), 'WP-402', { kind: 'graded', grade: 2.3 })
    const plan: Plan = {
      ...base,
      modules: base.modules.map((module) =>
        module.code === 'WP-402' ? { ...module, retired: true as const } : module,
      ),
    }
    const kept = resetPlan(plan)
    expect(kept.backlog).toContain('WP-402')
    expect(kept.semesters.some((semester) => semester.moduleCodes.includes('WP-402'))).toBe(false)
    const cleared = resetPlan(plan, { clearResults: true })
    expect(cleared.modules.some((module) => module.code === 'WP-402')).toBe(false)
    expect(planSchema.safeParse(cleared).success).toBe(true)
  })
})
