/**
 * Validates every preset under presets/ against the shared Zod schema.
 * Runtime-portable: runs on Bun (`bun run presets:validate`) and on Node 24 via type stripping.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { presetSchema } from '../src/schema/preset.ts'

const presetsDir = fileURLToPath(new URL('../../../presets/', import.meta.url))
const files = readdirSync(presetsDir, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.json') && !file.endsWith('.schema.json'))
  .sort()

let failures = 0
for (const file of files) {
  const expectedId = file.slice(0, -'.json'.length).split(sep).join('/')
  const result = presetSchema.safeParse(JSON.parse(readFileSync(join(presetsDir, file), 'utf8')))
  if (!result.success) {
    failures++
    console.error(`FAIL ${file}\n${z.prettifyError(result.error)}\n`)
  } else if (result.data.id !== expectedId) {
    failures++
    console.error(`FAIL ${file}\nid "${result.data.id}" must match the file path "${expectedId}"\n`)
  } else {
    console.log(`ok   ${file}`)
  }
}

if (files.length === 0) console.error('No presets found')
process.exit(failures > 0 || files.length === 0 ? 1 : 0)
