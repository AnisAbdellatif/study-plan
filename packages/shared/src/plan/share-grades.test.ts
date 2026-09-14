import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { presetSchema } from '../schema/preset.ts'
import { setExamDate, setModuleResult, setTargetGrade } from './operations.ts'
import { createPlanFromPreset } from './plan.ts'
import { forkPlan, toSharedPlan } from './share.ts'

const preset = presetSchema.parse(
  JSON.parse(readFileSync(new URL('../../examples/informatik-bsc-example.json', import.meta.url), 'utf8')),
)

function privatePlan() {
  let plan = createPlanFromPreset(preset, {
    id: 'mine',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
  plan = setModuleResult(plan, 'INF-101', { kind: 'graded', grade: 1.3 })
  plan = setExamDate(plan, 'INF-102', '2027-02-15')
  return setTargetGrade(plan, 1.7)
}

describe('sharing a plan', () => {
  it('never reveals results, grades, exam dates or the target grade', () => {
    const shared = toSharedPlan(privatePlan())
    expect(shared.modules.every((module) => module.attempts.length === 0)).toBe(true)
    expect(shared.modules.every((module) => module.examDate === undefined)).toBe(true)
    expect(shared.targetGrade).toBeUndefined()
  })

  it('adopts a shared plan as an independent copy', () => {
    const fork = forkPlan(toSharedPlan(privatePlan()), { id: 'copy', now: new Date('2026-10-01T08:00:00Z') })
    expect(fork.modules.every((module) => module.attempts.length === 0)).toBe(true)
    expect(fork).toMatchObject({ id: 'copy', createdAt: '2026-10-01T08:00:00.000Z' })
  })
})
