import { type CustomPresetResult, type Preset, parseCustomPreset } from '@study-plan/shared'
import { and, asc, eq, ne } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/connection.ts'
import { preset } from '../db/schema.ts'
import type { AppEnv } from '../types.ts'

const idSchema = z.uuid()

/** A row id from the URL, or null for anything that is not a UUID (PostgreSQL would reject it). */
export const presetRowId = (c: Context<AppEnv>): string | null => {
  const parsed = idSchema.safeParse(c.req.param('id'))
  return parsed.success ? parsed.data.toLowerCase() : null
}

/**
 * The preset id plans store. It comes from the row, not from the file, so it survives an admin replacing the
 * data. "preset/<uuid>" passes presetIdSchema (lowercase letters, digits and dashes around one slash) and cannot
 * clash with "custom/..." ids from the start page or "example/..." ids.
 */
export const presetDocumentId = (rowId: string) => `preset/${rowId}`

/** Validates an uploaded programme file with the same parser as the start page, then pins the id to the row. */
export function parsePresetUpload(text: string, rowId: string): CustomPresetResult {
  const result = parseCustomPreset(text, null, 'preset')
  if (!result.success) return result
  return { ...result, preset: { ...result.preset, id: presetDocumentId(rowId) } }
}

export const presetColumns = (document: Preset) => ({
  universityName: document.university.name,
  programmeName: document.programme.name,
  degree: document.programme.degree,
  poVersion: document.poVersion,
  document,
})

export const summaryColumns = {
  id: preset.id,
  universityName: preset.universityName,
  programmeName: preset.programmeName,
  degree: preset.degree,
  poVersion: preset.poVersion,
  updatedAt: preset.updatedAt,
}

/** Whether another preset already has this university, programme, degree and PO version. */
export async function presetExists(db: Database, document: Preset, exceptRowId?: string): Promise<boolean> {
  const columns = presetColumns(document)
  const [row] = await db
    .select({ id: preset.id })
    .from(preset)
    .where(
      and(
        eq(preset.universityName, columns.universityName),
        eq(preset.programmeName, columns.programmeName),
        eq(preset.degree, columns.degree),
        eq(preset.poVersion, columns.poVersion),
        exceptRowId ? ne(preset.id, exceptRowId) : undefined,
      ),
    )
  return row !== undefined
}

/** A unique index violation, also when a concurrent request slipped past presetExists. Drizzle wraps the driver error. */
export function isUniqueViolation(error: unknown): boolean {
  for (let current = error; typeof current === 'object' && current !== null; ) {
    if ('code' in current && current.code === '23505') return true
    current = 'cause' in current ? current.cause : undefined
  }
  return false
}

/** Public: the presets students pick on the start page. No account needed. */
export function presetRoutes(db: Database) {
  const routes = new Hono<AppEnv>()

  routes.get('/', async (c) => {
    const presets = await db
      .select(summaryColumns)
      .from(preset)
      .orderBy(
        asc(preset.universityName),
        asc(preset.programmeName),
        asc(preset.degree),
        asc(preset.poVersion),
      )
    return c.json({ presets })
  })

  routes.get('/:id', async (c) => {
    const id = presetRowId(c)
    if (!id) return c.json({ error: 'not_found' }, 404)
    const [row] = await db.select({ document: preset.document }).from(preset).where(eq(preset.id, id))
    if (!row) return c.json({ error: 'not_found' }, 404)
    return c.json({ preset: row.document })
  })

  return routes
}
