import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { decryptSourceUrl } from '../calendar/secrets.ts'
import type { Config } from '../config.ts'
import type { Database } from '../db/connection.ts'
import {
  calendarFeed,
  calendarSource,
  notificationSetting,
  plan,
  planShare,
  reminderDelivery,
  session,
  user,
} from '../db/schema.ts'
import type { AppEnv } from '../types.ts'
import { feedUrl } from './calendar.ts'

/** Self-service access to one's own data (Art. 15 and Art. 20 DSGVO). Deletion goes through Better Auth. */
export function accountRoutes(db: Database, config: Config) {
  const routes = new Hono<AppEnv>()

  routes.get('/export', async (c) => {
    const userId = c.get('user').id
    const [profile] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        locale: user.locale,
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

    const shares = await db

      .select({ planId: planShare.planId, createdAt: planShare.createdAt, revokedAt: planShare.revokedAt })

      .from(planShare)

      .innerJoin(plan, eq(planShare.planId, plan.id))

      .where(eq(plan.userId, userId))

    const [notifications] = await db
      .select({ examReminders: notificationSetting.examReminders, updatedAt: notificationSetting.updatedAt })
      .from(notificationSetting)
      .where(eq(notificationSetting.userId, userId))
    const reminders = await db
      .select({
        planId: reminderDelivery.planId,
        moduleCode: reminderDelivery.moduleCode,
        kind: reminderDelivery.kind,
        eventDate: reminderDelivery.eventDate,
        sentAt: reminderDelivery.sentAt,
      })
      .from(reminderDelivery)
      .innerJoin(plan, eq(reminderDelivery.planId, plan.id))
      .where(eq(plan.userId, userId))

    const [source] = await db.select().from(calendarSource).where(eq(calendarSource.userId, userId))
    const feeds = source
      ? await db.select().from(calendarFeed).where(eq(calendarFeed.sourceId, source.id))
      : []
    const calendar = source
      ? {
          link: decryptSourceUrl(config.authSecret, source.encryptedUrl),
          status: source.status,
          lastError: source.lastError,
          lastFetchedAt: source.lastFetchedAt,
          lastSuccessAt: source.lastSuccessAt,
          createdAt: source.createdAt,
          settings: source.settings,
          events: source.events,
          changes: source.changes,
          feeds: feeds.map((feed) => ({
            name: feed.name,
            subjects: feed.subjects,
            url: feedUrl(config, feed),
            createdAt: feed.createdAt,
          })),
        }
      : null

    const exportedAt = new Date()
    c.header(
      'Content-Disposition',
      `attachment; filename="studienplaner-daten-${exportedAt.toISOString().slice(0, 10)}.json"`,
    )
    c.header('Cache-Control', 'no-store')
    return c.json({
      format: 'study-plan.account-export',
      exportedAt,
      user: profile,
      plans,
      sessions,
      shares,
      notifications: notifications ?? { examReminders: false, updatedAt: null },
      reminders,
      calendar,
    })
  })

  return routes
}
