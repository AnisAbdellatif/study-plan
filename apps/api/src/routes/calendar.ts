import { createHash } from 'node:crypto'
import {
  type CalendarFeedView,
  type CalendarOverview,
  type CalendarSettings,
  calendarColor,
  calendarSettingsSchema,
  calendarSubjects,
  eventTitle,
  feedEvents,
  withSubjectColors,
} from '@study-plan/shared'
import { and, asc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { renderCalendar } from '../calendar/ics.ts'
import { encryptSourceUrl, feedToken, isFeedToken } from '../calendar/secrets.ts'
import { fetchSourceCalendar, parseSourceUrl } from '../calendar/source.ts'
import {
  type CalendarDependencies,
  claimSource,
  MANUAL_REFRESH_MS,
  readSettings,
  refreshSource,
} from '../calendar/sync.ts'
import type { Config } from '../config.ts'
import type { Database } from '../db/connection.ts'
import { calendarFeed, calendarSource, user } from '../db/schema.ts'
import { verifyUnsubscribeToken } from '../reminders.ts'
import type { AppEnv } from '../types.ts'

const MAX_FEEDS = 30

const readJson = (request: Request): Promise<unknown> => request.json().catch(() => null)

const feedName = z.string().trim().min(1).max(80)
const feedSubjects = z.array(z.string().min(1).max(500)).max(500).nullable()
const sourceBody = z.object({ url: z.string().min(1).max(2000) })
const createFeedBody = z.object({ name: feedName, subjects: feedSubjects })
const updateFeedBody = z.object({ name: feedName.optional(), subjects: feedSubjects.optional() })

const DEFAULT_FEED_NAMES = { de: 'Stundenplan', en: 'Timetable' }
const FEED_LABELS = {
  de: { cancelled: 'Entfällt', description: 'Aus Stud.IP, ausgewählt auf study-plan.de' },
  en: { cancelled: 'Cancelled', description: 'From Stud.IP, selected on study-plan.de' },
}

type FeedRow = typeof calendarFeed.$inferSelect

/** Feeds live under the calendar page's path: /calendar/<feed id>/<token>.ics. */
export const CALENDAR_FEED_PATH = '/calendar'

export const feedUrl = (config: Config, feed: Pick<FeedRow, 'id' | 'tokenVersion'>): string =>
  `${config.publicUrl}${CALENDAR_FEED_PATH}/${feed.id}/${feedToken(config.authSecret, feed.id, feed.tokenVersion)}.ics`

const feedView = (config: Config, feed: FeedRow): CalendarFeedView => ({
  id: feed.id,
  name: feed.name,
  subjects: feed.subjects,
  url: feedUrl(config, feed),
  createdAt: feed.createdAt.toISOString(),
})

async function overview(db: Database, config: Config, userId: string): Promise<CalendarOverview> {
  const [source] = await db.select().from(calendarSource).where(eq(calendarSource.userId, userId))
  const feeds = source
    ? await db
        .select()
        .from(calendarFeed)
        .where(eq(calendarFeed.sourceId, source.id))
        .orderBy(asc(calendarFeed.createdAt), asc(calendarFeed.id))
    : []
  return {
    source: source
      ? {
          host: source.host,
          status: source.status,
          error: source.lastError,
          lastFetchedAt: source.lastFetchedAt?.toISOString() ?? null,
          lastSuccessAt: source.lastSuccessAt?.toISOString() ?? null,
          settings: readSettings(source.settings),
          events: source.events,
          changes: source.changes,
        }
      : null,
    feeds: feeds.map((feed) => feedView(config, feed)),
    allowedHosts: config.calendar.sourceHosts,
    refreshMinutes: config.calendar.refreshMinutes,
  }
}

/** The signed-in student's calendar source, settings and feeds. Mounted under /api/calendar. */
export function calendarRoutes(dependencies: CalendarDependencies) {
  const { db, config } = dependencies
  const routes = new Hono<AppEnv>()

  const ownSource = async (userId: string) => {
    const [row] = await db
      .select({ id: calendarSource.id })
      .from(calendarSource)
      .where(eq(calendarSource.userId, userId))
    return row ?? null
  }

  const ownFeed = async (userId: string, feedId: string) => {
    if (!z.uuid().safeParse(feedId).success) return null
    const [row] = await db
      .select({ feed: calendarFeed })
      .from(calendarFeed)
      .innerJoin(calendarSource, eq(calendarFeed.sourceId, calendarSource.id))
      .where(and(eq(calendarFeed.id, feedId), eq(calendarSource.userId, userId)))
    return row?.feed ?? null
  }

  routes.get('/', async (c) => c.json(await overview(db, config, c.get('user').id)))

  /**
   * Adds the calendar link, or replaces it. The link is fetched first, so a wrong one is reported at once and never
   * stored. Settings and feeds stay when the link is replaced.
   */
  routes.put('/source', async (c) => {
    const body = sourceBody.safeParse(await readJson(c.req.raw))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)
    const parsed = parseSourceUrl(body.data.url, config.calendar.sourceHosts)
    if (!parsed.ok) return c.json({ error: parsed.error }, 400)
    const fetched = await fetchSourceCalendar(parsed.url, dependencies.fetcher)
    if (!fetched.ok) return c.json({ error: 'fetch_failed', reason: fetched.error }, 422)

    const userId = c.get('user').id
    const now = new Date()
    const [existing] = await db.select().from(calendarSource).where(eq(calendarSource.userId, userId))
    const settings = withSubjectColors(
      existing ? readSettings(existing.settings) : calendarSettingsSchema.parse({}),
      calendarSubjects(fetched.events),
    )
    const values = {
      encryptedUrl: encryptSourceUrl(config.authSecret, parsed.url),
      host: parsed.host,
      status: 'ok' as const,
      lastError: null,
      failures: 0,
      lastFetchedAt: now,
      lastSuccessAt: now,
      events: fetched.events,
      settings,
      // Another link may be another calendar: nothing to compare with.
      changes: [],
      updatedAt: now,
    }
    if (existing) {
      await db.update(calendarSource).set(values).where(eq(calendarSource.id, existing.id))
    } else {
      const [owner] = await db.select({ locale: user.locale }).from(user).where(eq(user.id, userId))
      const [created] = await db
        .insert(calendarSource)
        .values({ userId, ...values })
        .onConflictDoNothing()
        .returning({ id: calendarSource.id })
      // A second request at the same time created it first.
      if (!created) return c.json({ error: 'conflict' }, 409)
      await db.insert(calendarFeed).values({
        sourceId: created.id,
        name: DEFAULT_FEED_NAMES[owner?.locale === 'en' ? 'en' : 'de'],
        subjects: null,
      })
    }
    return c.json(await overview(db, config, userId))
  })

  /** Removes the link, the stored dates and every feed; subscribed calendars stop receiving dates. */
  routes.delete('/source', async (c) => {
    await db.delete(calendarSource).where(eq(calendarSource.userId, c.get('user').id))
    return c.body(null, 204)
  })

  routes.post('/refresh', async (c) => {
    const userId = c.get('user').id
    if (!(await ownSource(userId))) return c.json({ error: 'not_found' }, 404)
    const row = await claimSource(db, { userId }, MANUAL_REFRESH_MS)
    if (!row) return c.json({ error: 'too_soon' }, 429)
    await refreshSource(dependencies, row)
    return c.json(await overview(db, config, userId))
  })

  routes.put('/settings', async (c) => {
    const body = calendarSettingsSchema.safeParse(await readJson(c.req.raw))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)
    const [updated] = await db
      .update(calendarSource)
      .set({ settings: body.data, updatedAt: new Date() })
      .where(eq(calendarSource.userId, c.get('user').id))
      .returning({ settings: calendarSource.settings })
    if (!updated) return c.json({ error: 'not_found' }, 404)
    return c.json(updated.settings)
  })

  routes.post('/feeds', async (c) => {
    const body = createFeedBody.safeParse(await readJson(c.req.raw))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)
    const source = await ownSource(c.get('user').id)
    if (!source) return c.json({ error: 'not_found' }, 404)
    const count = await db.$count(calendarFeed, eq(calendarFeed.sourceId, source.id))
    if (count >= MAX_FEEDS) return c.json({ error: 'feed_limit', limit: MAX_FEEDS }, 409)
    const [feed] = await db
      .insert(calendarFeed)
      .values({ sourceId: source.id, name: body.data.name, subjects: body.data.subjects })
      .returning()
    if (!feed) throw new Error('feed insert returned nothing')
    return c.json(feedView(config, feed), 201)
  })

  routes.patch('/feeds/:id', async (c) => {
    const body = updateFeedBody.safeParse(await readJson(c.req.raw))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)
    const feed = await ownFeed(c.get('user').id, c.req.param('id'))
    if (!feed) return c.json({ error: 'not_found' }, 404)
    const [updated] = await db
      .update(calendarFeed)
      .set({
        ...(body.data.name !== undefined ? { name: body.data.name } : {}),
        ...(body.data.subjects !== undefined ? { subjects: body.data.subjects } : {}),
      })
      .where(eq(calendarFeed.id, feed.id))
      .returning()
    return c.json(feedView(config, updated ?? feed))
  })

  /** A new URL for the feed; calendars subscribed to the old one stop receiving dates. */
  routes.post('/feeds/:id/new-link', async (c) => {
    const feed = await ownFeed(c.get('user').id, c.req.param('id'))
    if (!feed) return c.json({ error: 'not_found' }, 404)
    const [updated] = await db
      .update(calendarFeed)
      .set({ tokenVersion: feed.tokenVersion + 1 })
      .where(eq(calendarFeed.id, feed.id))
      .returning()
    return c.json(feedView(config, updated ?? feed))
  })

  routes.delete('/feeds/:id', async (c) => {
    const feed = await ownFeed(c.get('user').id, c.req.param('id'))
    if (!feed) return c.json({ error: 'not_found' }, 404)
    await db.delete(calendarFeed).where(eq(calendarFeed.id, feed.id))
    return c.body(null, 204)
  })

  return routes
}

/** Turns change alerts off with the token from an alert e-mail. Part of /api/notifications/unsubscribe. */
export async function unsubscribeCalendarAlerts(
  db: Database,
  config: Config,
  token: string,
): Promise<boolean> {
  const userId = verifyUnsubscribeToken(config.authSecret, token, 'calendar')
  if (!userId) return false
  const [row] = await db
    .select({ id: calendarSource.id, settings: calendarSource.settings })
    .from(calendarSource)
    .where(eq(calendarSource.userId, userId))
  if (row) {
    const settings: CalendarSettings = { ...readSettings(row.settings), changeAlerts: false }
    await db
      .update(calendarSource)
      .set({ settings, updatedAt: new Date() })
      .where(eq(calendarSource.id, row.id))
  }
  return true
}

/**
 * Public: the feeds calendar apps subscribe to, at /<feed id>/<token>.ics. The token is the only protection, so
 * unknown feeds and wrong tokens look the same. Only .ics paths are answered; the rest belongs to the web app.
 */
export function calendarFeedRoutes(db: Database, config: Config) {
  const routes = new Hono<AppEnv>()

  routes.get('/:id/:file{[^/]+\\.ics}', async (c) => {
    const id = c.req.param('id')
    const token = /^([A-Za-z0-9_-]{10,64})\.ics$/.exec(c.req.param('file'))?.[1]
    const notFound = () => c.text('Not found', 404)
    if (!token || !z.uuid().safeParse(id).success) return notFound()
    const [row] = await db
      .select({ feed: calendarFeed, source: calendarSource, locale: user.locale })
      .from(calendarFeed)
      .innerJoin(calendarSource, eq(calendarFeed.sourceId, calendarSource.id))
      .innerJoin(user, eq(calendarSource.userId, user.id))
      .where(eq(calendarFeed.id, id))
    if (!row || !isFeedToken(config.authSecret, row.feed.id, row.feed.tokenVersion, token)) return notFound()

    const labels = FEED_LABELS[row.locale === 'en' ? 'en' : 'de']
    const settings = readSettings(row.source.settings)
    const subjects = row.feed.subjects
    // A feed of one subject takes its colour; Apple Calendar uses it when subscribing.
    const color =
      subjects?.length === 1 && subjects[0] !== undefined
        ? calendarColor(settings.subjects[subjects[0]]?.color)
        : undefined
    const body = renderCalendar(
      {
        name: row.feed.name,
        description: labels.description,
        color: color ? { name: color.name, hex: color.hex } : undefined,
        refreshMinutes: config.calendar.refreshMinutes || 60,
        events: feedEvents(row.source.events, settings, subjects).map((event) => ({
          uid: event.uid,
          summary: eventTitle(event, settings, labels),
          start: event.start,
          end: event.end,
          location: event.location,
          description: [event.course, event.description].filter(Boolean).join('\n\n'),
          color: calendarColor(settings.subjects[event.subject]?.color)?.name,
        })),
      },
      // The stamp follows the stored data, so the same data gives the same file and the ETag below holds.
      row.source.updatedAt,
      '-//Study Plan//Calendar feeds//DE',
    )
    const etag = `"${createHash('sha256').update(body).digest('base64url').slice(0, 27)}"`
    c.header('ETag', etag)
    c.header('Cache-Control', 'private, max-age=300')
    if (c.req.header('if-none-match') === etag) return c.body(null, 304)
    c.header('Content-Type', 'text/calendar; charset=utf-8')
    c.header('Content-Disposition', `inline; filename="${row.feed.id}.ics"`)
    return c.body(body)
  })

  return routes
}
