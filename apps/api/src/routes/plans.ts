import { type ParseFailure, parseGuestDocument, planHasGrades } from '@study-plan/shared'
import { and, desc, eq, sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/connection.ts'
import { plan } from '../db/schema.ts'
import { planUsage } from '../plan-limits.ts'
import type { AppEnv } from '../types.ts'

const idSchema = z.uuid()
const createSchema = z.object({ document: z.unknown() })
const updateSchema = z.object({ document: z.unknown(), revision: z.number().int().min(1) })

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return undefined
  }
}

const notFound = (c: Context<AppEnv>) => c.json({ error: 'not_found' }, 404)
const invalidPlan = (c: Context<AppEnv>, failure: ParseFailure) =>
  c.json({ error: 'invalid_plan', reason: failure.reason, details: failure.details }, 422)
/** Grades arrive encrypted in `encryptedGrades`; a readable grade is never stored. */
const gradesNotEncrypted = (c: Context<AppEnv>) => c.json({ error: 'grades_not_encrypted' }, 422)

/**
 * Plans are stored whole as validated guest documents, with the grades encrypted by the browser. The revision
 * detects edits from another device.
 */
export function planRoutes(db: Database) {
  const routes = new Hono<AppEnv>()
  const summaryColumns = { id: plan.id, name: plan.name, revision: plan.revision, updatedAt: plan.updatedAt }

  routes.get('/', async (c) => {
    const userId = c.get('user').id
    const rows = await db
      .select(summaryColumns)
      .from(plan)
      .where(eq(plan.userId, userId))
      .orderBy(desc(plan.updatedAt))
    const { limit } = await planUsage(db, userId)
    return c.json({ plans: rows, limit })
  })

  routes.post('/', async (c) => {
    const body = createSchema.safeParse(await readJson(c))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)
    const parsed = parseGuestDocument(body.data.document)
    if (!parsed.success) return invalidPlan(c, parsed)
    if (planHasGrades(parsed.document.plan)) return gradesNotEncrypted(c)

    const userId = c.get('user').id
    // Lowering a limit keeps existing plans; it only stops new ones.
    const usage = await planUsage(db, userId)
    if (usage.count >= usage.limit) return c.json({ error: 'too_many_plans', limit: usage.limit }, 409)

    const [created] = await db
      .insert(plan)
      .values({ userId, name: parsed.document.plan.name, document: parsed.document })
      .returning(summaryColumns)
    return c.json(created, 201)
  })

  routes.get('/:id', async (c) => {
    const id = c.req.param('id')
    if (!idSchema.safeParse(id).success) return notFound(c)
    const [row] = await db
      .select({ ...summaryColumns, document: plan.document })
      .from(plan)
      .where(and(eq(plan.id, id), eq(plan.userId, c.get('user').id)))
    return row ? c.json(row) : notFound(c)
  })

  routes.put('/:id', async (c) => {
    const id = c.req.param('id')
    if (!idSchema.safeParse(id).success) return notFound(c)
    const body = updateSchema.safeParse(await readJson(c))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)
    const parsed = parseGuestDocument(body.data.document)
    if (!parsed.success) return invalidPlan(c, parsed)
    if (planHasGrades(parsed.document.plan)) return gradesNotEncrypted(c)

    const userId = c.get('user').id
    const [updated] = await db
      .update(plan)
      .set({
        name: parsed.document.plan.name,
        document: parsed.document,
        revision: sql`${plan.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(plan.id, id), eq(plan.userId, userId), eq(plan.revision, body.data.revision)))
      .returning(summaryColumns)
    if (updated) return c.json(updated)

    const [current] = await db
      .select({ ...summaryColumns, document: plan.document })
      .from(plan)
      .where(and(eq(plan.id, id), eq(plan.userId, userId)))
    if (!current) return notFound(c)
    return c.json({ error: 'revision_conflict', current }, 409)
  })

  routes.delete('/:id', async (c) => {
    const id = c.req.param('id')
    if (!idSchema.safeParse(id).success) return notFound(c)
    const [deleted] = await db
      .delete(plan)
      .where(and(eq(plan.id, id), eq(plan.userId, c.get('user').id)))
      .returning({ id: plan.id })
    return deleted ? c.body(null, 204) : notFound(c)
  })

  return routes
}
