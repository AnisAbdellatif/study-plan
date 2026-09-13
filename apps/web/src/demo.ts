import { presetSchema } from '@study-plan/shared'
import example from '../../../packages/shared/examples/informatik-bsc-example.json'

/** A fictional programme for trying the planner without extracting a real one first. */
export const demoPreset = presetSchema.parse(example)
