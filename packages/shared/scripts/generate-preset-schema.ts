/**
 * Writes presets/preset.schema.json from the Zod schema so editors can validate preset files.
 * Cross-field rules (unknown module codes, duplicate ids) live only in Zod; run presets:validate for those.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { presetSchema } from '../src/schema/preset.ts'

const target = fileURLToPath(new URL('../../../presets/preset.schema.json', import.meta.url))
const schema = z.toJSONSchema(presetSchema, { io: 'input', unrepresentable: 'any' })
writeFileSync(target, `${JSON.stringify(schema, null, 2)}\n`)
console.log(`wrote ${target}`)
