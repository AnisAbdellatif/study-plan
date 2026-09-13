import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { presetSchema } from '../schema/preset.ts'
import { insertSemester, moveSemester, PlanError, removeLastSemester, removeSemester } from './operations.ts'
import { addPlaceholder } from './placeholders.ts'
import { createPlanFromPreset, isPlaceholderId, type Plan, planSchema } from './plan.ts'

const load = (file: string) =>
  presetSchema.parse(JSON.parse(readFileSync(new URL(`../../examples/${file}`, import.meta.url), 'utf8')))

const makePlan = (preset = load('informatik-bsc-example.json')) =>
  createPlanFromPreset(preset, {
    id: 'plan-test',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })

// The LUH programme has a real choice area, which placeholders need.
const CHOICE_AREA = 'vertiefung-informatik'
const makeLuhPlan = () => makePlan(load('luh-technische-informatik-bsc-2026.json'))

const ids = (plan: Plan) => plan.semesters.map((semester) => semester.id)

describe('semester management', () => {
  it('inserts an empty semester at any position with a fresh id', () => {
    const plan = makePlan()
    const count = plan.semesters.length
    const inserted = insertSemester(plan, 1)
    expect(inserted.semesters).toHaveLength(count + 1)
    expect(inserted.semesters[1]).toEqual({ id: `s${count + 1}`, kind: 'regular', moduleCodes: [] })
    expect(ids(inserted).slice(0, 3)).toEqual(['s1', `s${count + 1}`, 's2'])
    expect(insertSemester(plan, 0).semesters[0]?.moduleCodes).toEqual([])
    expect(insertSemester(plan, count).semesters.at(-1)?.moduleCodes).toEqual([])
    expect(() => insertSemester(plan, count + 1)).toThrow(PlanError)
    expect(() => insertSemester(plan, -1)).toThrow(PlanError)
    expect(planSchema.safeParse(inserted).success).toBe(true)
  })

  it('moves a semester with its modules and keeps the other order', () => {
    const plan = makePlan()
    const first = plan.semesters[0]
    const moved = moveSemester(plan, 's1', 2)
    expect(ids(moved).slice(0, 3)).toEqual(['s2', 's3', 's1'])
    expect(moved.semesters[2]?.moduleCodes).toEqual(first?.moduleCodes)
    expect(moveSemester(plan, 's1', 0)).toBe(plan)
    expect(() => moveSemester(plan, 'nope', 0)).toThrow(PlanError)
    expect(() => moveSemester(plan, 's1', plan.semesters.length)).toThrow(PlanError)
    expect(planSchema.safeParse(moved).success).toBe(true)
  })

  it('removes a semester, moves its modules to the backlog and drops its placeholders', () => {
    const plan = addPlaceholder(makeLuhPlan(), CHOICE_AREA, 's2', 0, 'test')
    const modules = plan.semesters[1]?.moduleCodes.filter((code) => !isPlaceholderId(code)) ?? []
    expect(modules.length).toBeGreaterThan(0)
    expect(plan.placeholders).toHaveLength(1)

    const removed = removeSemester(plan, 's2')
    expect(ids(removed)).not.toContain('s2')
    expect(removed.backlog.slice(-modules.length)).toEqual(modules)
    expect(removed.backlog.some(isPlaceholderId)).toBe(false)
    expect(removed.placeholders ?? []).toEqual([])
    expect(planSchema.safeParse(removed).success).toBe(true)
  })

  it('never removes the only semester', () => {
    let plan = makePlan()
    while (plan.semesters.length > 1) plan = removeLastSemester(plan)
    expect(() => removeSemester(plan, plan.semesters[0]?.id ?? '')).toThrow(PlanError)
    expect(() => removeLastSemester(plan)).toThrow(PlanError)
  })

  it('drops placeholders when removing the last semester too, so the plan stays valid', () => {
    const plan = makeLuhPlan()
    const lastId = plan.semesters.at(-1)?.id ?? ''
    const removed = removeLastSemester(addPlaceholder(plan, CHOICE_AREA, lastId, 0, 'last'))
    expect(removed.backlog.some(isPlaceholderId)).toBe(false)
    expect(planSchema.safeParse(removed).success).toBe(true)
  })
})
