import { createHmac, timingSafeEqual } from 'node:crypto'
import { addDays, dueReminders, type PlanModule, parseGuestDocument } from '@study-plan/shared'
import { and, eq, inArray, lt } from 'drizzle-orm'
import type { Config } from './config.ts'
import type { Database } from './db/connection.ts'
import { notificationSetting, plan, reminderDelivery, user } from './db/schema.ts'
import { type Mailer, mailLocale, type ReminderItem, reminderMail } from './mail.ts'

/** Delivery records are kept this many days after the deadline, then purged. */
const DELIVERY_RETENTION_DAYS = 30

export const UNSUBSCRIBE_PATH = '/api/notifications/unsubscribe'

/** Today's calendar date in Germany, YYYY-MM-DD. Deadlines are German calendar dates. */
export function berlinDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

const unsubscribeMac = (secret: string, userId: string) =>
  createHmac('sha256', secret).update(`reminder-unsubscribe:${userId}`).digest('base64url')

/** A link token that turns reminders off without signing in. It stays valid until the auth secret changes. */
export const unsubscribeToken = (secret: string, userId: string): string =>
  `${userId}.${unsubscribeMac(secret, userId)}`

export function verifyUnsubscribeToken(secret: string, token: string): string | null {
  const separator = token.lastIndexOf('.')
  if (separator <= 0) return null
  const userId = token.slice(0, separator)
  const expected = Buffer.from(unsubscribeMac(secret, userId))
  const given = Buffer.from(token.slice(separator + 1))
  return expected.length === given.length && timingSafeEqual(expected, given) ? userId : null
}

export interface ReminderDependencies {
  db: Database
  mailer: Mailer
  config: Config
}

export interface ReminderRun {
  mailsSent: number
  failures: number
}

/**
 * Sends one e-mail per student with every deadline that became due since the last run. Each deadline is
 * claimed in `reminder_delivery` before sending, so concurrent or repeated runs never mail it twice.
 * When sending fails, the claims are released and the next run tries again.
 */
export async function runReminders(
  { db, mailer, config }: ReminderDependencies,
  now: Date = new Date(),
): Promise<ReminderRun> {
  const today = berlinDate(now)
  await db
    .delete(reminderDelivery)
    .where(lt(reminderDelivery.eventDate, addDays(today, -DELIVERY_RETENTION_DAYS)))

  const rows = await db
    .select({
      userId: user.id,
      email: user.email,
      locale: user.locale,
      planId: plan.id,
      document: plan.document,
    })
    .from(notificationSetting)
    .innerJoin(user, eq(notificationSetting.userId, user.id))
    .innerJoin(plan, eq(plan.userId, user.id))
    .where(and(eq(notificationSetting.examReminders, true), eq(user.emailVerified, true)))

  const byUser = new Map<string, { email: string; locale: string; plans: typeof rows }>()
  for (const row of rows) {
    const entry = byUser.get(row.userId) ?? { email: row.email, locale: row.locale, plans: [] }
    entry.plans.push(row)
    byUser.set(row.userId, entry)
  }

  const run: ReminderRun = { mailsSent: 0, failures: 0 }
  for (const [userId, { email, locale, plans }] of byUser) {
    const claimed: string[] = []
    const items = new Map<string, ReminderItem>()
    for (const row of plans) {
      const parsed = parseGuestDocument(row.document)
      if (!parsed.success) continue
      // Grades are encrypted, so a graded module counts as passed by its recorded result.
      const passed = (module: PlanModule) => module.attempts.some((attempt) => attempt.result === 'passed')
      for (const event of dueReminders(parsed.document.plan, today, undefined, passed)) {
        const [claim] = await db
          .insert(reminderDelivery)
          .values({ planId: row.planId, moduleCode: event.code, kind: event.kind, eventDate: event.date })
          .onConflictDoNothing()
          .returning({ id: reminderDelivery.id })
        if (!claim) continue
        claimed.push(claim.id)
        // The same module in two plans is mentioned once.
        items.set(`${event.kind}|${event.moduleName}|${event.date}`, {
          kind: event.kind,
          moduleName: event.moduleName,
          date: event.date,
        })
      }
    }
    if (items.size === 0) continue

    const token = encodeURIComponent(unsubscribeToken(config.authSecret, userId))
    try {
      await mailer.send(
        reminderMail(
          email,
          [...items.values()],
          {
            settingsUrl: `${config.publicUrl}/account`,
            unsubscribeUrl: `${config.publicUrl}/unsubscribe?token=${token}`,
            oneClickUrl: `${config.publicUrl}${UNSUBSCRIBE_PATH}?token=${token}`,
          },
          mailLocale({ locale }),
        ),
      )
      run.mailsSent++
    } catch (error) {
      run.failures++
      await db.delete(reminderDelivery).where(inArray(reminderDelivery.id, claimed))
      console.error('[reminders] sending failed, will retry on the next run', error)
    }
  }
  return run
}

/** Runs reminders shortly after startup and then every `intervalMs`. Returns a function that stops it. */
export function startReminderScheduler(dependencies: ReminderDependencies, intervalMs: number): () => void {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const run = await runReminders(dependencies)
      if (run.mailsSent > 0 || run.failures > 0) {
        console.info(`[reminders] ${run.mailsSent} e-mails sent, ${run.failures} failed`)
      }
    } catch (error) {
      console.error('[reminders] run failed', error)
    } finally {
      running = false
    }
  }
  const first = setTimeout(tick, 10_000)
  const timer = setInterval(tick, intervalMs)
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
