import { type ParseFailure, parseGuestDocument } from '@study-plan/shared'
import { and, desc, eq, sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/connection.ts'
import { plan } from '../db/schema.ts'
import type { AppEnv } from '../types.ts'

/** Generous for real use, and keeps a single account from filling the database. */
export const MAX_PLANS_PER_USER = 20

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

/** Plans are stored whole as validated guest documents. The revision detects edits from another device. */
export function planRoutes(db: Database) {
  const routes = new Hono<AppEnv>()
  const summaryColumns = { id: plan.id, name: plan.name, revision: plan.revision, updatedAt: plan.updatedAt }

  routes.get('/', async (c) => {
    const rows = await db
      .select(summaryColumns)
      .from(plan)
      .where(eq(plan.userId, c.get('user').id))
      .orderBy(desc(plan.updatedAt))
    return c.json({ plans: rows })
  })

  routes.post('/', async (c) => {
    const body = createSchema.safeParse(await readJson(c))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)
    const parsed = parseGuestDocument(body.data.document)
    if (!parsed.success) return invalidPlan(c, parsed)

    const userId = c.get('user').id
    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(plan)
      .where(eq(plan.userId, userId))
    if (count >= MAX_PLANS_PER_USER) return c.json({ error: 'too_many_plans' }, 409)

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
