/**
 * Validates every preset under presets/ against the shared Zod schema.
 * Runtime-portable: runs on Bun (`bun run presets:validate`) and on Node 24 via type stripping.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { type Preset, presetSchema } from '../src/schema/preset.ts'

const presetsDir = fileURLToPath(new URL('../../../presets/', import.meta.url))
const files = readdirSync(presetsDir, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.json') && !file.endsWith('.schema.json') && !file.endsWith('.lock.json'))
  .sort()

let failures = 0
const valid: Preset[] = []
for (const file of files) {
  const expectedId = file.slice(0, -'.json'.length).split(sep).join('/')
  const result = presetSchema.safeParse(JSON.parse(readFileSync(join(presetsDir, file), 'utf8')))
  if (!result.success) {
    failures++
    console.error(`FAIL ${file}\n${z.prettifyError(result.error)}\n`)
  } else if (JSON.stringify(result.data).includes('TODO')) {
    failures++
    console.error(`FAIL ${file}\nstill contains TODO placeholders\n`)
  } else if (result.data.id !== expectedId) {
    failures++
    console.error(`FAIL ${file}\nid "${result.data.id}" must match the file path "${expectedId}"\n`)
  } else {
    valid.push(result.data)
    console.log(`ok   ${file}`)
  }
}

// Transitions can only be checked against their source preset when it is in the repository.
for (const preset of valid) {
  for (const transition of preset.transitions ?? []) {
    const source = valid.find((candidate) => candidate.id === transition.fromPresetId)
    if (!source) {
      console.warn(`warn ${preset.id}: transition source "${transition.fromPresetId}" is not in presets/`)
      continue
    }
    const codes = new Set(source.modules.map((module) => module.code))
    for (const { from } of transition.moduleMap) {
      if (!codes.has(from)) {
        failures++
        console.error(`FAIL ${preset.id}: transition maps "${from}", which ${source.id} does not have\n`)
      }
    }
  }
}

if (files.length === 0) console.error('No presets found')
process.exit(failures > 0 || files.length === 0 ? 1 : 0)
