import { createHash, randomBytes } from 'node:crypto'
import { toSharedPlan } from '@study-plan/shared'
import { and, eq, isNull } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import type { Config } from '../config.ts'
import type { Database } from '../db/connection.ts'
import { plan, planShare } from '../db/schema.ts'
import { clientKey, createRateLimiter } from '../rate-limit.ts'
import type { AppEnv } from '../types.ts'

const idSchema = z.uuid()
const createOptionsSchema = z.object({ includeGrades: z.boolean().optional() })
/** 18 random bytes, base64url: 144 bits, 24 characters. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{24}$/

export const hashShareToken = (token: string): string => createHash('sha256').update(token).digest('hex')
const createToken = (): string => randomBytes(18).toString('base64url')

/** Owner-only: check, create and revoke the share link of a plan. A plan has at most one active link. */
export function planShareRoutes(db: Database, config: Config) {
  const routes = new Hono<AppEnv>()

  const ownedPlanId = async (c: Context<AppEnv>): Promise<string | null> => {
    const id = c.req.param('id')
    if (!id || !idSchema.safeParse(id).success) return null
    const [row] = await db
      .select({ id: plan.id })
      .from(plan)
      .where(and(eq(plan.id, id), eq(plan.userId, c.get('user').id)))
    return row?.id ?? null
  }

  const revokeActive = (planId: string) =>
    db
      .update(planShare)
      .set({ revokedAt: new Date() })
      .where(and(eq(planShare.planId, planId), isNull(planShare.revokedAt)))

  routes.get('/:id/share', async (c) => {
    const planId = await ownedPlanId(c)
    if (!planId) return c.json({ error: 'not_found' }, 404)
    const [share] = await db
      .select({ createdAt: planShare.createdAt, includeGrades: planShare.includeGrades })
      .from(planShare)
      .where(and(eq(planShare.planId, planId), isNull(planShare.revokedAt)))
    return c.json({
      active: share !== undefined,
      createdAt: share?.createdAt ?? null,
      includeGrades: share?.includeGrades ?? false,
    })
  })

  routes.post('/:id/share', async (c) => {
    const planId = await ownedPlanId(c)
    if (!planId) return c.json({ error: 'not_found' }, 404)
    // The body is optional; without it the link shares no grades.
    const raw: unknown = await c.req.json().catch(() => ({}))
    const options = createOptionsSchema.safeParse(raw ?? {})
    if (!options.success) return c.json({ error: 'invalid_request' }, 400)
    const includeGrades = options.data.includeGrades ?? false
    await revokeActive(planId)
    const token = createToken()
    const [share] = await db
      .insert(planShare)
      .values({ planId, tokenHash: hashShareToken(token), includeGrades })
      .returning({ createdAt: planShare.createdAt })
    c.header('Cache-Control', 'no-store')
    return c.json(
      {
        token,
        url: `${config.publicUrl}/shared/${token}`,
        createdAt: share?.createdAt ?? null,
        includeGrades,
      },
      201,
    )
  })

  routes.delete('/:id/share', async (c) => {
    const planId = await ownedPlanId(c)
    if (!planId) return c.json({ error: 'not_found' }, 404)
    await revokeActive(planId)
    return c.body(null, 204)
  })

  return routes
}

/**
 * Public: the structure of a shared plan, plus results when the owner chose "with grades" for this link. Exam
 * dates and the target grade never leave the server.
 */
export function publicShareRoutes(db: Database, config: Config) {
  const routes = new Hono<AppEnv>()
  const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 })

  routes.get('/:token', async (c) => {
    c.header('Cache-Control', 'no-store')
    c.header('X-Robots-Tag', 'noindex, nofollow')
    if (config.env !== 'test' && !limiter.allow(clientKey(c.req.raw.headers, config.ipAddressHeaders))) {
      return c.json({ error: 'rate_limited' }, 429)
    }
    const token = c.req.param('token')
    if (!TOKEN_FORMAT.test(token)) return c.json({ error: 'not_found' }, 404)

    const [row] = await db
      .select({
        name: plan.name,
        updatedAt: plan.updatedAt,
        sharedAt: planShare.createdAt,
        includeGrades: planShare.includeGrades,
        document: plan.document,
      })
      .from(planShare)
      .innerJoin(plan, eq(planShare.planId, plan.id))
      .where(and(eq(planShare.tokenHash, hashShareToken(token)), isNull(planShare.revokedAt)))
    if (!row) return c.json({ error: 'not_found' }, 404)

    return c.json({
      name: row.name,
      updatedAt: row.updatedAt,
      sharedAt: row.sharedAt,
      includeGrades: row.includeGrades,
      plan: toSharedPlan(row.document.plan, { includeGrades: row.includeGrades }),
    })
  })

  return routes
}
