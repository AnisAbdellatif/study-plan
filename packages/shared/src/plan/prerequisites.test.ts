import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type Preset, presetSchema } from '../schema/preset.ts'
import { setModuleAttempts } from './attempts.ts'
import { moveModule, setModuleResult } from './operations.ts'
import { createPlanFromPreset, type Plan } from './plan.ts'
import { validatePlan } from './validation.ts'

const load = (file: string) =>
  presetSchema.parse(JSON.parse(readFileSync(new URL(`../../examples/${file}`, import.meta.url), 'utf8')))

const example = load('informatik-bsc-example.json')
const example2027 = load('informatik-bsc-example-2027.json')

// INF-102 (semester 2) requires INF-101 (semester 1).
const planFor = (preset: Preset): Plan =>
  createPlanFromPreset(preset, {
    id: 'plan',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })

// Theoretische Informatik (INF-202) also requires Lineare Algebra I from semester 1, so only look at INF-102.
const blocked = (plan: Plan, currentSemesterIndex?: number) =>
  validatePlan(plan, currentSemesterIndex === undefined ? {} : { currentSemesterIndex }).filter(
    (issue) => issue.kind === 'prerequisite_not_passed' && issue.code === 'INF-102',
  )

describe('prerequisites that are not passed in time', () => {
  it('flags a prerequisite whose semester is over without a pass', () => {
    const plan = setModuleResult(planFor(example), 'INF-101', { kind: 'graded', grade: 5.0 })
    expect(blocked(plan, 1)).toEqual([
      {
        kind: 'prerequisite_not_passed',
        severity: 'error',
        code: 'INF-102',
        semesterId: 's2',
        blocked: [{ code: 'INF-101', reason: 'semester_over' }],
      },
    ])
    const kinds = validatePlan(plan, { currentSemesterIndex: 1 })
      .filter((issue) => 'code' in issue && issue.code === 'INF-102')
      .map((issue) => issue.kind)
    expect(kinds).not.toContain('missing_prerequisite')
  })

  it('stays quiet while the prerequisite semester is running, once it is passed, and without a current semester', () => {
    expect(blocked(planFor(example), 0)).toEqual([])
    expect(blocked(setModuleResult(planFor(example), 'INF-101', { kind: 'graded', grade: 2.0 }), 1)).toEqual(
      [],
    )
    expect(blocked(planFor(example))).toEqual([])
  })

  it('does not flag a retake that was moved to a later semester', () => {
    let plan = setModuleResult(planFor(example), 'INF-101', { kind: 'graded', grade: 5.0 })
    plan = moveModule(moveModule(plan, 'INF-101', 's2'), 'INF-102', 's3')
    expect(blocked(plan, 1)).toEqual([])
    expect(blocked(plan, 2)).toMatchObject([
      { code: 'INF-102', blocked: [{ code: 'INF-101', reason: 'semester_over' }] },
    ])
  })

  it('flags a prerequisite without attempts left, even without a current semester', () => {
    const plan = setModuleAttempts(planFor(example2027), 'INF-101', [
      { kind: 'graded', grade: 5.0 },
      { kind: 'graded', grade: 5.0 },
      { kind: 'graded', grade: 5.0 },
    ])
    expect(blocked(plan)).toMatchObject([
      { code: 'INF-102', blocked: [{ code: 'INF-101', reason: 'exhausted' }] },
    ])
  })

  it('needs every choice of an "any of" group to be out', () => {
    const base = planFor(example)
    const plan: Plan = {
      ...base,
      modules: base.modules.map((module) =>
        module.code === 'INF-102'
          ? { ...module, prerequisites: [{ anyOf: ['INF-101', 'MAT-101'] }] }
          : module,
      ),
    }
    expect(blocked(plan, 1)).toMatchObject([
      {
        code: 'INF-102',
        blocked: [
          { code: 'INF-101', reason: 'semester_over' },
          { code: 'MAT-101', reason: 'semester_over' },
        ],
      },
    ])
    expect(blocked(setModuleResult(plan, 'MAT-101', { kind: 'graded', grade: 1.7 }), 1)).toEqual([])
  })

  it('keeps reporting prerequisites that are not planned before the module', () => {
    const plan = moveModule(planFor(example), 'INF-101', 's3')
    const issues = validatePlan(plan, { currentSemesterIndex: 1 })
    expect(
      issues.filter((issue) => issue.kind === 'missing_prerequisite').map((issue) => issue.code),
    ).toContain('INF-102')
    expect(
      issues.filter((issue) => issue.kind === 'prerequisite_not_passed' && issue.code === 'INF-102'),
    ).toEqual([])
  })
})
