/**
 * Guards against silent preset changes. Every preset's content hash is recorded in presets/presets.lock.json.
 *   bun run presets:check   fails when a preset changed, was added or was removed without updating the lock
 *   bun run presets:lock    rewrites the lock; add an entry to presets/CHANGELOG.md in the same commit
 * Runtime-portable: runs on Bun and on Node 24.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const presetsDir = fileURLToPath(new URL('../../../presets/', import.meta.url))
const lockPath = join(presetsDir, 'presets.lock.json')

/** Key order and whitespace must not change the hash, so objects are serialised with sorted keys. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== '$schema')
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const files = readdirSync(presetsDir, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.json') && !file.endsWith('.schema.json') && !file.endsWith('.lock.json'))
  .sort()

const current: Record<string, string> = {}
for (const file of files) {
  const preset = JSON.parse(readFileSync(join(presetsDir, file), 'utf8')) as { id?: unknown }
  if (typeof preset.id !== 'string') throw new Error(`${file} has no id`)
  current[preset.id] = `sha256:${createHash('sha256').update(canonical(preset)).digest('hex')}`
}

if (process.argv.includes('--write')) {
  writeFileSync(lockPath, `${JSON.stringify(current, null, 2)}\n`)
  console.log(`wrote ${lockPath} with ${Object.keys(current).length} preset(s)`)
  process.exit(0)
}

const locked: Record<string, string> = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : {}
const problems = [
  ...Object.keys(current)
    .filter((id) => locked[id] === undefined)
    .map((id) => `added: ${id}`),
  ...Object.keys(locked)
    .filter((id) => current[id] === undefined)
    .map((id) => `removed: ${id}`),
  ...Object.keys(current)
    .filter((id) => locked[id] !== undefined && locked[id] !== current[id])
    .map((id) => `changed: ${id}`),
]

if (problems.length > 0) {
  console.error(
    `Presets differ from presets/presets.lock.json:\n  ${problems.join('\n  ')}\n\n` +
      'If the change is intended, run "bun run presets:lock" and describe it in presets/CHANGELOG.md.',
  )
  process.exit(1)
}
console.log(`ok   ${Object.keys(current).length} preset(s) match the lock`)
