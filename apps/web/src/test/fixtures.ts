import { presetSchema } from '@study-plan/shared'
import example from '../../../../packages/shared/examples/informatik-bsc-example.json'
import example2027 from '../../../../packages/shared/examples/informatik-bsc-example-2027.json'
import luh from '../../../../packages/shared/examples/luh-technische-informatik-bsc-2026.json'

/** Example programmes for tests. They are not bundled with the app. */
export const examplePreset = presetSchema.parse(example)
export const examplePreset2027 = presetSchema.parse(example2027)
export const luhPreset = presetSchema.parse(luh)
