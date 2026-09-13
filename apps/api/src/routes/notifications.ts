import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Config } from '../config.ts'
import type { Database } from '../db/connection.ts'
import { notificationSetting } from '../db/schema.ts'
import { verifyUnsubscribeToken } from '../reminders.ts'
import type { AppEnv } from '../types.ts'

const settingsSchema = z.object({ examReminders: z.boolean() })

const readJson = (request: Request): Promise<unknown> => request.json().catch(() => null)

/** The signed-in student's reminder settings. Mounted under /api/account. */
export function notificationSettingsRoutes(db: Database) {
  const routes = new Hono<AppEnv>()

  routes.get('/', async (c) => {
    const [row] = await db
      .select({ examReminders: notificationSetting.examReminders })
      .from(notificationSetting)
      .where(eq(notificationSetting.userId, c.get('user').id))
    return c.json({ examReminders: row?.examReminders ?? false })
  })

  routes.put('/', async (c) => {
    const body = settingsSchema.safeParse(await readJson(c.req.raw))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)
    const { examReminders } = body.data
    await db
      .insert(notificationSetting)
      .values({ userId: c.get('user').id, examReminders })
      .onConflictDoUpdate({
        target: notificationSetting.userId,
        set: { examReminders, updatedAt: new Date() },
      })
    return c.json({ examReminders })
  })

  return routes
}

/**
 * Public: turns reminders off with the token from a reminder e-mail. Mail clients call it as an RFC 8058
 * one-click unsubscribe, and the unsubscribe page in the web app posts to it after asking.
 */
export function unsubscribeRoutes(db: Database, config: Config) {
  const routes = new Hono<AppEnv>()

  routes.post('/unsubscribe', async (c) => {
    const userId = verifyUnsubscribeToken(config.authSecret, c.req.query('token') ?? '')
    if (!userId) return c.json({ error: 'invalid_token' }, 400)
    await db
      .update(notificationSetting)
      .set({ examReminders: false, updatedAt: new Date() })
      .where(eq(notificationSetting.userId, userId))
    return c.json({ examReminders: false })
  })

  return routes
}
