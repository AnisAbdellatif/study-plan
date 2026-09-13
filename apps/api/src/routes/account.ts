import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { Database } from '../db/connection.ts'
import { plan, session, user } from '../db/schema.ts'
import type { AppEnv } from '../types.ts'

/** Self-service access to one's own data (Art. 15 and Art. 20 DSGVO). Deletion goes through Better Auth. */
export function accountRoutes(db: Database) {
  const routes = new Hono<AppEnv>()

  routes.get('/export', async (c) => {
    const userId = c.get('user').id
    const [profile] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(eq(user.id, userId))
    const plans = await db
      .select({
        id: plan.id,
        name: plan.name,
        revision: plan.revision,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        document: plan.document,
      })
      .from(plan)
      .where(eq(plan.userId, userId))
    const sessions = await db
      .select({
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })
      .from(session)
      .where(eq(session.userId, userId))

    const exportedAt = new Date()
    c.header(
      'Content-Disposition',
      `attachment; filename="studienplaner-daten-${exportedAt.toISOString().slice(0, 10)}.json"`,
    )
    c.header('Cache-Control', 'no-store')
    return c.json({ format: 'study-plan.account-export', exportedAt, user: profile, plans, sessions })
  })

  return routes
}
