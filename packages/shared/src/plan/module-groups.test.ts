import { describe, expect, it } from 'vitest'
import { type Preset, presetSchema } from '../schema/preset.ts'
import { countedCreditHalves } from './counted-credits.ts'
import { groupableCodes, groupModuleCodes, keepFromModuleGroup, leaveModuleGroup } from './module-groups.ts'
import { moveModule, setModuleResult } from './operations.ts'
import { createPlanFromPreset, type Plan, planSchema, resetPlan } from './plan.ts'
import { summarizePlan } from './summary.ts'

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
  graded('V1', 5, { elective: true }),
  graded('V2', 5, { elective: true }),
  graded('V3', 6, { elective: true }),
]

const preset: Preset = presetSchema.parse({
  schemaVersion: 1,
  id: 'custom/test',
  university: { slug: 'uni', name: 'Uni' },
  programme: { slug: 'inf', name: 'Informatik', degree: 'bsc' },
  poVersion: 'PO',
  handbookVersion: 'MK',
  standardSemesters: 3,
  totalCredits: 30,
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
    { id: 'vertiefung', name: 'Vertiefung', minCredits: 5, maxCredits: 10, moduleCodes: ['V1', 'V2', 'V3'] },
  ],
})

/** V1, V2 and V3 planned in the second semester, not decided yet. */
const planned = (): Plan => {
  let plan = createPlanFromPreset(preset, {
    id: 'p',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
  for (const code of ['V1', 'V2', 'V3']) plan = moveModule(plan, code, 's2')
  return plan
}

const grouped = (): Plan => groupModuleCodes(planned(), ['V1', 'V2', 'V3'])

describe('groups of options not decided yet', () => {
  it('lets only planned options of the selected area join a selection', () => {
    const plan = planned()
    expect([...groupableCodes(plan, [])].sort()).toEqual(['V1', 'V2', 'V3'])
    expect([...groupableCodes(plan, ['V1'])].sort()).toEqual(['V1', 'V2', 'V3'])
    expect(groupableCodes(plan, ['PF']).size).toBe(0)
    // Semesters don't matter, but an option that isn't planned can't join.
    expect([...groupableCodes(moveModule(plan, 'V3', 's3'), ['V1'])].sort()).toEqual(['V1', 'V2', 'V3'])
    expect([...groupableCodes(moveModule(plan, 'V3', null), ['V1'])].sort()).toEqual(['V1', 'V2'])
    expect(() => groupModuleCodes(plan, ['V1', 'PF'])).toThrow('Only planned options')
    expect(() => groupModuleCodes(plan, ['V1'])).toThrow('at least two')
  })

  it('extends an existing group with newly selected options', () => {
    const plan = groupModuleCodes(groupModuleCodes(planned(), ['V1', 'V2']), ['V2', 'V3'])
    expect(plan.moduleGroups).toEqual([{ id: 'group-1', codes: ['V1', 'V2', 'V3'] }])
  })

  it('counts the group once, with its largest member, everywhere', () => {
    const before = summarizePlan(planned())
    expect(before.semesters[1]?.credits).toBe(16)

    const plan = grouped()
    expect(plan.moduleGroups).toEqual([{ id: 'group-1', codes: ['V1', 'V2', 'V3'] }])
    expect(planSchema.safeParse(plan).success).toBe(true)

    const summary = summarizePlan(plan)
    expect(summary.semesters[1]?.credits).toBe(6)
    expect(summary.credits.planned).toBe(16)
    expect(summary.areas.find((area) => area.id === 'vertiefung')?.plannedCredits).toBe(6)
    expect(countedCreditHalves(plan).get('V3')).toBe(12)
  })

  it('counts every passed member in full and drops the undecided rest', () => {
    const plan = setModuleResult(grouped(), 'V2', { kind: 'graded', grade: 2.0 })
    const counted = countedCreditHalves(plan)
    expect([counted.get('V1'), counted.get('V2'), counted.get('V3')]).toEqual([0, 10, 0])
    expect(summarizePlan(plan).credits.earned).toBe(5)
  })

  it('keeps a group across semesters and counts it once, in the semester of its largest member', () => {
    const spread = moveModule(grouped(), 'V3', 's3')
    expect(spread.moduleGroups).toEqual([{ id: 'group-1', codes: ['V1', 'V2', 'V3'] }])
    const summary = summarizePlan(spread)
    expect(summary.semesters[1]?.credits).toBe(0)
    expect(summary.semesters[2]?.credits).toBe(6)
    expect(summary.credits.planned).toBe(16)
  })

  it('lets a member leave by unplanning it or from the group itself', () => {
    const unplanned = moveModule(grouped(), 'V3', null)
    expect(unplanned.moduleGroups).toEqual([{ id: 'group-1', codes: ['V1', 'V2'] }])

    const left = leaveModuleGroup(leaveModuleGroup(grouped(), 'V3'), 'V2')
    expect(left).not.toHaveProperty('moduleGroups')
    expect(summarizePlan(left).semesters[1]?.credits).toBe(16)
  })

  it('decides a group: the kept module stays, the others go back to the unplanned modules', () => {
    const plan = keepFromModuleGroup(grouped(), 'V2')
    expect(plan).not.toHaveProperty('moduleGroups')
    expect(plan.semesters[1]?.moduleCodes).toEqual(['V2'])
    expect(plan.backlog).toEqual(expect.arrayContaining(['V1', 'V3']))
    expect(summarizePlan(plan).semesters[1]?.credits).toBe(5)
  })

  it('drops groups when the plan is reset', () => {
    expect(resetPlan(grouped())).not.toHaveProperty('moduleGroups')
  })
})
