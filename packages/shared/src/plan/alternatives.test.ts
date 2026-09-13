import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { presetSchema } from '../schema/preset.ts'
import { moveModule } from './operations.ts'
import { createPlanFromPreset, type Plan } from './plan.ts'
import { validatePlan } from './validation.ts'

const preset = presetSchema.parse(
  JSON.parse(readFileSync(new URL('../../examples/informatik-bsc-example.json', import.meta.url), 'utf8')),
)

/** The first two modules of semester 1 turned into alternatives, e.g. two credit variants of one Praktikum. */
function planWithAlternatives(): { plan: Plan; codes: [string, string] } {
  const plan = createPlanFromPreset(preset, {
    id: 'plan',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
  const [first, second] = plan.semesters[0]?.moduleCodes ?? []
  if (!first || !second) throw new Error('example needs two modules in semester 1')
  const modules = plan.modules.map((module) =>
    module.code === first || module.code === second
      ? { ...module, internship: true, alternativeGroup: 'betriebspraktikum' }
      : module,
  )
  return { plan: { ...plan, modules }, codes: [first, second] }
}

const conflicts = (plan: Plan) => validatePlan(plan).filter((issue) => issue.kind === 'alternatives_conflict')

describe('alternative groups', () => {
  it('warns when more than one alternative of a group is planned', () => {
    const { plan, codes } = planWithAlternatives()
    expect(conflicts(plan)).toEqual([
      { kind: 'alternatives_conflict', severity: 'warning', group: 'betriebspraktikum', codes },
    ])
  })

  it('accepts a single chosen alternative', () => {
    const { plan, codes } = planWithAlternatives()
    expect(conflicts(moveModule(plan, codes[1], null))).toEqual([])
  })
})
