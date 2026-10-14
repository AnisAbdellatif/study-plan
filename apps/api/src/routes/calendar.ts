import { createHash } from 'node:crypto'
import {
  type CalendarDisplay,
  type CalendarEvent,
  type CalendarFeedView,
  type CalendarOverview,
  calendarColor,
  calendarDisplaySchema,
  calendarSelectionSchema,
  calendarSubjects,
  eventTitle,
  groupedEvents,
  linkSettings,
  MAX_CALENDAR_SOURCES,
  mixedFeedEvents,
  withSubjectColors,
} from '@study-plan/shared'
import { and, asc, eq } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import { renderCalendar } from '../calendar/ics.ts'
import { decryptSourceUrl, encryptSourceUrl, feedToken, isFeedToken } from '../calendar/secrets.ts'
import { fetchSourceCalendar, parseSourceUrl } from '../calendar/source.ts'
import {
  type CalendarDependencies,
  claimSource,
  MANUAL_REFRESH_MS,
  readDisplay,
  readSelection,
  refreshSource,
} from '../calendar/sync.ts'
import type { Config } from '../config.ts'
import type { Database } from '../db/connection.ts'
import { calendar, calendarFeed, calendarSource, user } from '../db/schema.ts'
import { verifyUnsubscribeToken } from '../reminders.ts'
import type { AppEnv } from '../types.ts'

const MAX_FEEDS = 30

const readJson = (request: Request): Promise<unknown> => request.json().catch(() => null)

const feedName = z.string().trim().min(1).max(80)
const feedSubjects = z.array(z.string().min(1).max(500)).max(500).nullable()
const feedSources = z.array(z.uuid()).min(1).max(MAX_CALENDAR_SOURCES)
const sourceBody = z.object({
  url: z.string().min(1).max(2000),
  label: z.string().trim().max(40).optional(),
})
const createFeedBody = z.object({ name: feedName, sources: feedSources, subjects: feedSubjects })
const updateFeedBody = z.object({
  name: feedName.optional(),
  sources: feedSources.optional(),
  subjects: feedSubjects.optional(),
})

const DEFAULT_FEED_NAMES = { de: 'Stundenplan', en: 'Timetable' }
const FEED_LABELS = {
  de: { cancelled: 'Entfällt', description: 'Aus Stud.IP, ausgewählt auf study-plan.de' },
  en: { cancelled: 'Cancelled', description: 'From Stud.IP, selected on study-plan.de' },
}

type FeedRow = typeof calendarFeed.$inferSelect
type SourceRow = typeof calendarSource.$inferSelect

/** Feeds live under the calendar page's path: /calendar/<feed id>/<token>.ics. */
export const CALENDAR_FEED_PATH = '/calendar'

export const feedUrl = (config: Config, feed: Pick<FeedRow, 'id' | 'tokenVersion'>): string =>
  `${config.publicUrl}${CALENDAR_FEED_PATH}/${feed.id}/${feedToken(config.authSecret, feed.id, feed.tokenVersion)}.ics`

const feedView = (config: Config, feed: FeedRow): CalendarFeedView => ({
  id: feed.id,
  name: feed.name,
  sources: feed.sourceIds,
  subjects: feed.subjects,
  url: feedUrl(config, feed),
  createdAt: feed.createdAt.toISOString(),
})

/** A student's links, oldest first. */
const sourcesOf = (db: Database, userId: string) =>
  db
    .select()
    .from(calendarSource)
    .where(eq(calendarSource.userId, userId))
    .orderBy(asc(calendarSource.createdAt), asc(calendarSource.id))

const feedsOf = (db: Database, userId: string) =>
  db
    .select()
    .from(calendarFeed)
    .where(eq(calendarFeed.userId, userId))
    .orderBy(asc(calendarFeed.createdAt), asc(calendarFeed.id))

/** The dates a feed shows, each with the settings of the link it comes from. */
function feedDates(
  feed: Pick<FeedRow, 'sourceIds' | 'subjects'>,
  sources: readonly SourceRow[],
  display: CalendarDisplay,
) {
  const links = feed.sourceIds.flatMap((id) => {
    const source = sources.find((candidate) => candidate.id === id)
    return source
      ? [{ events: source.events, settings: linkSettings(display, readSelection(source.selection)) }]
      : []
  })
  return mixedFeedEvents(links, feed.subjects)
}

async function overview(db: Database, config: Config, userId: string): Promise<CalendarOverview> {
  const [account] = await db.select().from(calendar).where(eq(calendar.userId, userId))
  const sources = account ? await sourcesOf(db, userId) : []
  const feeds = account ? await feedsOf(db, userId) : []
  return {
    sources: sources.map((source) => ({
      id: source.id,
      host: source.host,
      label: source.label,
      status: source.status,
      error: source.lastError,
      lastFetchedAt: source.lastFetchedAt?.toISOString() ?? null,
      lastSuccessAt: source.lastSuccessAt?.toISOString() ?? null,
      createdAt: source.createdAt.toISOString(),
      events: source.events,
      selection: readSelection(source.selection),
    })),
    display: account ? readDisplay(account.settings) : null,
    changes: account?.changes ?? [],
    feeds: feeds.map((feed) => feedView(config, feed)),
    allowedHosts: config.calendar.sourceHosts,
    refreshMinutes: config.calendar.refreshMinutes,
    maxSources: MAX_CALENDAR_SOURCES,
  }
}

/** The signed-in student's calendar links, settings and feeds. Mounted under /api/calendar. */
export function calendarRoutes(dependencies: CalendarDependencies) {
  const { db, config } = dependencies
  const routes = new Hono<AppEnv>()

  const ownSource = async (userId: string, sourceId: string) => {
    if (!z.uuid().safeParse(sourceId).success) return null
    const [row] = await db
      .select()
      .from(calendarSource)
      .where(and(eq(calendarSource.id, sourceId), eq(calendarSource.userId, userId)))
    return row ?? null
  }

  const ownFeed = async (userId: string, feedId: string) => {
    if (!z.uuid().safeParse(feedId).success) return null
    const [row] = await db
      .select()
      .from(calendarFeed)
      .where(and(eq(calendarFeed.id, feedId), eq(calendarFeed.userId, userId)))
    return row ?? null
  }

  /** Whether every id names one of the student's links. */
  const ownSources = async (userId: string, ids: readonly string[]) => {
    const own = new Set((await sourcesOf(db, userId)).map((source) => source.id))
    return ids.every((id) => own.has(id))
  }

  type LinkCheck =
    | { ok: true; url: string; host: string; events: CalendarEvent[] }
    | { ok: false; response: Response }

  /**
   * Checks a pasted link and fetches it, so a wrong one is reported at once and never stored. `except` is the link
   * being replaced, which may stay the same.
   */
  const checkLink = async (
    c: Context<AppEnv>,
    userId: string,
    input: string,
    except?: string,
  ): Promise<LinkCheck> => {
    const parsed = parseSourceUrl(input, config.calendar.sourceHosts)
    if (!parsed.ok) return { ok: false, response: c.json({ error: parsed.error }, 400) }
    const duplicate = (await sourcesOf(db, userId)).some(
      (source) =>
        source.id !== except && decryptSourceUrl(config.authSecret, source.encryptedUrl) === parsed.url,
    )
    if (duplicate) return { ok: false, response: c.json({ error: 'duplicate' }, 409) }
    const fetched = await fetchSourceCalendar(parsed.url, dependencies.fetcher)
    if (!fetched.ok) {
      return { ok: false, response: c.json({ error: 'fetch_failed', reason: fetched.error }, 422) }
    }
    return { ok: true, url: parsed.url, host: parsed.host, events: fetched.events }
  }

  routes.get('/', async (c) => c.json(await overview(db, config, c.get('user').id)))

  /** Adds a link with a feed of its own. The first one also creates the account's display settings. */
  routes.post('/sources', async (c) => {
    const body = sourceBody.safeParse(await readJson(c.req.raw))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)
    const userId = c.get('user').id
    if ((await sourcesOf(db, userId)).length >= MAX_CALENDAR_SOURCES) {
      return c.json({ error: 'source_limit', limit: MAX_CALENDAR_SOURCES }, 409)
    }
    const link = await checkLink(c, userId, body.data.url)
    if (!link.ok) return link.response

    const now = new Date()
    await db
      .insert(calendar)
      .values({ userId, settings: calendarDisplaySchema.parse({}) })
      .onConflictDoNothing()
    const label = body.data.label || null
    const [created] = await db
      .insert(calendarSource)
      .values({
        userId,
        encryptedUrl: encryptSourceUrl(config.authSecret, link.url),
        host: link.host,
        label,
        status: 'ok',
        lastFetchedAt: now,
        lastSuccessAt: now,
        events: link.events,
        selection: withSubjectColors(calendarSelectionSchema.parse({}), calendarSubjects(link.events)),
      })
      .returning({ id: calendarSource.id })
    if (!created) throw new Error('source insert returned nothing')
    // Two requests at once could both pass the limit check; the later one goes again.
    const sources = await sourcesOf(db, userId)
    if (sources.length > MAX_CALENDAR_SOURCES && sources.at(-1)?.id === created.id) {
      await db.delete(calendarSource).where(eq(calendarSource.id, created.id))
      return c.json({ error: 'source_limit', limit: MAX_CALENDAR_SOURCES }, 409)
    }
    // Each link gets a calendar of its own; calendars that mix links are the student's to make.
    if ((await db.$count(calendarFeed, eq(calendarFeed.userId, userId))) < MAX_FEEDS) {
      const [owner] = await db.select({ locale: user.locale }).from(user).where(eq(user.id, userId))
      const base = DEFAULT_FEED_NAMES[owner?.locale === 'en' ? 'en' : 'de']
      await db.insert(calendarFeed).values({
        userId,
        name: label ?? (sources.length === 1 ? base : `${base} ${sources.length}`),
        sourceIds: [created.id],
        subjects: null,
      })
    }
    return c.json(await overview(db, config, userId), 201)
  })

  /** Replaces a link and its name. Its choices and feeds stay. */
  routes.put('/sources/:id', async (c) => {
    const body = sourceBody.safeParse(await readJson(c.req.raw))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)
    const userId = c.get('user').id
    const source = await ownSource(userId, c.req.param('id'))
    if (!source) return c.json({ error: 'not_found' }, 404)
    const link = await checkLink(c, userId, body.data.url, source.id)
    if (!link.ok) return link.response
    const now = new Date()
    const chosen = readSelection(source.selection)
    await db
      .update(calendarSource)
      .set({
        encryptedUrl: encryptSourceUrl(config.authSecret, link.url),
        host: link.host,
        label: body.data.label || null,
        status: 'ok',
        lastError: null,
        failures: 0,
        lastFetchedAt: now,
        // Another link may be another calendar: nothing to compare with on its next fetch.
        lastSuccessAt: now,
        events: link.events,
        selection: withSubjectColors(chosen, calendarSubjects(groupedEvents(link.events, chosen))),
        updatedAt: now,
      })
      .where(eq(calendarSource.id, source.id))
    return c.json(await overview(db, config, userId))
  })

  /** The student's choices, short names and colours for one link's subjects and dates. */
  routes.put('/sources/:id/selection', async (c) => {
    const body = calendarSelectionSchema.safeParse(await readJson(c.req.raw))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)
    const source = await ownSource(c.get('user').id, c.req.param('id'))
    if (!source) return c.json({ error: 'not_found' }, 404)
    // A subject made by moving a course gets a colour like any other.
    const selection = withSubjectColors(body.data, calendarSubjects(groupedEvents(source.events, body.data)))
    await db
      .update(calendarSource)
      .set({ selection, updatedAt: new Date() })
      .where(eq(calendarSource.id, source.id))
    return c.json(selection)
  })

  /**
   * Removes a link and its dates. Feeds of only this link go too; mixed ones keep their other links. Removing the
   * last link removes the settings and every feed: subscribed calendars stop receiving dates.
   */
  routes.delete('/sources/:id', async (c) => {
    const userId = c.get('user').id
    const source = await ownSource(userId, c.req.param('id'))
    if (!source) return c.json({ error: 'not_found' }, 404)
    await db.delete(calendarSource).where(eq(calendarSource.id, source.id))
    if ((await sourcesOf(db, userId)).length === 0) {
      await db.delete(calendar).where(eq(calendar.userId, userId))
      return c.json(await overview(db, config, userId))
    }
    for (const feed of await feedsOf(db, userId)) {
      if (!feed.sourceIds.includes(source.id)) continue
      const rest = feed.sourceIds.filter((id) => id !== source.id)
      if (rest.length === 0) await db.delete(calendarFeed).where(eq(calendarFeed.id, feed.id))
      else await db.update(calendarFeed).set({ sourceIds: rest }).where(eq(calendarFeed.id, feed.id))
    }
    await db.update(calendar).set({ updatedAt: new Date() }).where(eq(calendar.userId, userId))
    return c.json(await overview(db, config, userId))
  })

  /** Fetches every link again that wasn't fetched in the last minute. */
  routes.post('/refresh', async (c) => {
    const userId = c.get('user').id
    const sources = await sourcesOf(db, userId)
    if (sources.length === 0) return c.json({ error: 'not_found' }, 404)
    let refreshed = 0
    for (const source of sources) {
      const row = await claimSource(db, source.id, MANUAL_REFRESH_MS)
      if (!row) continue
      await refreshSource(dependencies, row)
      refreshed++
    }
    if (refreshed === 0) return c.json({ error: 'too_soon' }, 429)
    return c.json(await overview(db, config, userId))
  })

  /** How dates look in every feed, and change alerts. */
  routes.put('/display', async (c) => {
    const body = calendarDisplaySchema.safeParse(await readJson(c.req.raw))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)
    const [updated] = await db
      .update(calendar)
      .set({ settings: body.data, updatedAt: new Date() })
      .where(eq(calendar.userId, c.get('user').id))
      .returning({ settings: calendar.settings })
    if (!updated) return c.json({ error: 'not_found' }, 404)
    return c.json(updated.settings)
  })

  routes.post('/feeds', async (c) => {
    const body = createFeedBody.safeParse(await readJson(c.req.raw))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)
    const userId = c.get('user').id
    if (!(await ownSources(userId, body.data.sources))) return c.json({ error: 'invalid_request' }, 400)
    const count = await db.$count(calendarFeed, eq(calendarFeed.userId, userId))
    if (count >= MAX_FEEDS) return c.json({ error: 'feed_limit', limit: MAX_FEEDS }, 409)
    const [feed] = await db
      .insert(calendarFeed)
      .values({
        userId,
        name: body.data.name,
        sourceIds: [...new Set(body.data.sources)],
        subjects: body.data.subjects,
      })
      .returning()
    if (!feed) throw new Error('feed insert returned nothing')
    return c.json(feedView(config, feed), 201)
  })

  routes.patch('/feeds/:id', async (c) => {
    const body = updateFeedBody.safeParse(await readJson(c.req.raw))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)
    const userId = c.get('user').id
    const feed = await ownFeed(userId, c.req.param('id'))
    if (!feed) return c.json({ error: 'not_found' }, 404)
    if (body.data.sources && !(await ownSources(userId, body.data.sources))) {
      return c.json({ error: 'invalid_request' }, 400)
    }
    const [updated] = await db
      .update(calendarFeed)
      .set({
        ...(body.data.name !== undefined ? { name: body.data.name } : {}),
        ...(body.data.sources !== undefined ? { sourceIds: [...new Set(body.data.sources)] } : {}),
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
  const [account] = await db
    .select({ settings: calendar.settings })
    .from(calendar)
    .where(eq(calendar.userId, userId))
  if (account) {
    const settings: CalendarDisplay = { ...readDisplay(account.settings), changeAlerts: false }
    await db.update(calendar).set({ settings, updatedAt: new Date() }).where(eq(calendar.userId, userId))
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
      .select({ feed: calendarFeed, account: calendar, locale: user.locale })
      .from(calendarFeed)
      .innerJoin(calendar, eq(calendarFeed.userId, calendar.userId))
      .innerJoin(user, eq(calendar.userId, user.id))
      .where(eq(calendarFeed.id, id))
    if (!row || !isFeedToken(config.authSecret, row.feed.id, row.feed.tokenVersion, token)) return notFound()

    const sources = (await sourcesOf(db, row.account.userId)).filter((source) =>
      row.feed.sourceIds.includes(source.id),
    )
    const dates = feedDates(row.feed, sources, readDisplay(row.account.settings))
    // The stamp follows the stored data, so the same data gives the same file and the ETag below holds.
    const stamp = new Date(
      Math.max(row.account.updatedAt.getTime(), ...sources.map((source) => source.updatedAt.getTime())),
    )
    const labels = FEED_LABELS[row.locale === 'en' ? 'en' : 'de']
    // A feed of one subject of one link takes its colour; Apple Calendar uses it when subscribing.
    const [only] = sources
    const subject = row.feed.subjects?.length === 1 ? row.feed.subjects[0] : undefined
    const color =
      sources.length === 1 && only && subject !== undefined
        ? calendarColor(readSelection(only.selection).subjects[subject]?.color)
        : undefined
    const body = renderCalendar(
      {
        name: row.feed.name,
        description: labels.description,
        color: color ? { name: color.name, hex: color.hex } : undefined,
        refreshMinutes: config.calendar.refreshMinutes || 60,
        events: dates.map(({ event, settings }) => ({
          uid: event.uid,
          summary: eventTitle(event, settings, labels),
          start: event.start,
          end: event.end,
          location: event.location,
          description: [event.course, event.description].filter(Boolean).join('\n\n'),
          color: calendarColor(settings.subjects[event.subject]?.color)?.name,
        })),
      },
      stamp,
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
