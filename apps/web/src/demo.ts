import { createPlanFromPreset, type Plan, presetSchema, termAt } from '@study-plan/shared'
import example from '../../../packages/shared/examples/informatik-bsc-example.json'

/** A fictional programme for trying the planner without extracting a real one first. */
export const demoPreset = presetSchema.parse(example)

/** A plan of the example programme. Its curriculum begins in winter, so it starts in the current or next winter term. */
export function createExamplePlan(id: string, now = new Date()): Plan {
  const current = termAt(now)
  return createPlanFromPreset(demoPreset, { id, startTerm: { season: 'winter', year: current.year }, now })
}
