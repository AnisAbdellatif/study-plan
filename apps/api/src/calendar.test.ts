import { readFileSync } from 'node:fs'
import type { CalendarOverview } from '@study-plan/shared'
import { eq } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { createAuth } from './auth.ts'
import { runCalendarSync } from './calendar/sync.ts'
import { loadConfig } from './config.ts'
import { type DatabaseConnection, openDatabase } from './db/connection.ts'
import { calendarSource } from './db/schema.ts'
import { createMemoryMailer } from './mail.ts'

/**
 * CI also runs these tests against a real PostgreSQL server (TEST_DATABASE_URL). app.test.ts migrates that database
 * at the same time, so this file gets a database of its own on the server.
 */
async function ownDatabase(name: string): Promise<string> {
  const server = process.env.TEST_DATABASE_URL
  if (!server) return 'pglite://memory'
  const admin = postgres(server, { max: 1 })
  await admin.unsafe(`DROP DATABASE IF EXISTS ${name}`)
  await admin.unsafe(`CREATE DATABASE ${name}`)
  await admin.end()
  const url = new URL(server)
  url.pathname = `/${name}`
  return url.toString()
}

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: await ownDatabase('calendar_test'),
  PUBLIC_URL: 'http://localhost:5173',
  BETTER_AUTH_SECRET: 'test-secret-that-is-long-enough-for-better-auth',
})

const SAMPLE = readFileSync(new URL('./calendar/fixtures/studip-sample.ics', import.meta.url), 'utf8')
const LINK = 'https://studip.uni-hannover.de/dispatch.php/ical/index/Ab12Cd34'
const PASSWORD = 'richtig-langes-passwort'

/** What the fake Stud.IP answers next, and which links it was asked for. */
const upstream = { body: SAMPLE, status: 200, requested: [] as string[] }
const fetcher = async (url: string) => {
  upstream.requested.push(url)
  return new Response(upstream.body, { status: upstream.status })
}

const mailer = createMemoryMailer()
let connection: DatabaseConnection
let app: ReturnType<typeof createApp>

beforeAll(async () => {
  connection = await openDatabase(config.databaseUrl)
  await connection.migrate()
  const auth = createAuth({ config, db: connection.db, mailer })
  app = createApp({ config, db: connection.db, auth, mailer, calendarFetcher: fetcher })
})

afterAll(async () => {
  await connection.close()
})

function call(
  path: string,
  { method = 'GET', body, cookie }: { method?: string; body?: unknown; cookie?: string } = {},
) {
  const headers = new Headers({ origin: config.publicOrigin })
  if (body !== undefined) headers.set('content-type', 'application/json')
  if (cookie) headers.set('cookie', cookie)
  return app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

const json = async <T>(response: Response): Promise<T> => (await response.json()) as T

async function registerVerifiedUser(email: string): Promise<string> {
  const signUp = await call('/api/auth/sign-up/email', {
    method: 'POST',
    body: { email, password: PASSWORD, name: email.split('@')[0] },
  })
  expect(signUp.status).toBe(200)
  const mail = mailer.sent.filter((sent) => sent.to === email).at(-1)
  const link = new URL(/https?:\/\/\S+/.exec(mail?.text ?? '')?.[0] ?? '')
  const verified = await call(`${link.pathname}${link.search}`)
  return verified.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0] ?? '')
    .filter((cookie) => cookie.includes('session_token') && !cookie.endsWith('='))
    .join('; ')
}

/** The path of a feed URL, which the app serves under PUBLIC_URL/calendar. */
const feedPath = (url: string) => new URL(url).pathname

describe('calendar feeds', () => {
  const email = 'kalender@example.org'
  let cookie = ''

  beforeAll(async () => {
    cookie = await registerVerifiedUser(email)
  })

  it('needs a signed-in student', async () => {
    expect((await call('/api/calendar')).status).toBe(401)
  })

  it('starts empty and names the hosts it accepts', async () => {
    const overview = await json<CalendarOverview>(await call('/api/calendar', { cookie }))
    expect(overview).toMatchObject({ source: null, feeds: [], allowedHosts: ['studip.uni-hannover.de'] })
  })

  it('refuses links to other hosts or paths without fetching them', async () => {
    for (const [url, error] of [
      ['https://evil.example/dispatch.php/ical/index/Ab12Cd34', 'host_not_allowed'],
      ['https://studip.uni-hannover.de/index.php', 'invalid_url'],
    ]) {
      const response = await call('/api/calendar/source', { method: 'PUT', cookie, body: { url } })
      expect(response.status).toBe(400)
      expect(await json(response)).toEqual({ error })
    }
    expect(upstream.requested).toEqual([])
  })

  it('stores nothing when the link does not work', async () => {
    upstream.status = 400
    const response = await call('/api/calendar/source', { method: 'PUT', cookie, body: { url: LINK } })
    upstream.status = 200
    expect(response.status).toBe(422)
    expect(await json(response)).toEqual({ error: 'fetch_failed', reason: 'not_found' })
    expect((await json<CalendarOverview>(await call('/api/calendar', { cookie }))).source).toBeNull()
  })

  it('reads the calendar, colours its subjects and creates a feed of everything', async () => {
    const response = await call('/api/calendar/source', { method: 'PUT', cookie, body: { url: LINK } })
    expect(response.status).toBe(200)
    const text = await response.clone().text()
    // The link is a secret: it never comes back, and it is stored encrypted.
    expect(text).not.toContain('Ab12Cd34')
    const [row] = await connection.db.select().from(calendarSource)
    expect(row?.encryptedUrl).not.toContain('Ab12Cd34')

    const overview = await json<CalendarOverview>(response)
    expect(overview.source).toMatchObject({ host: 'studip.uni-hannover.de', status: 'ok', error: null })
    expect(overview.source?.events).toHaveLength(21)
    expect(Object.keys(overview.source?.settings.subjects ?? {})).toHaveLength(3)
    expect(overview.feeds).toEqual([
      expect.objectContaining({
        name: 'Stundenplan',
        subjects: null,
        url: expect.stringMatching(/^http:\/\/localhost:5173\/calendar\/[0-9a-f-]{36}\/[\w-]{22}\.ics$/),
      }),
    ])
  })

  it('serves the feed to anyone with its URL, and nothing to a wrong token', async () => {
    const [feed] = (await json<CalendarOverview>(await call('/api/calendar', { cookie }))).feeds
    if (!feed) throw new Error('no feed')
    const response = await app.request(feedPath(feed.url))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/calendar; charset=utf-8')
    const body = await response.text()
    expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(21)
    expect(body).toContain('SUMMARY:Entfällt: Rechnernetze · Übung')
    expect(body).toContain('X-WR-CALNAME:Stundenplan')

    const etag = response.headers.get('etag') ?? ''
    expect((await app.request(feedPath(feed.url), { headers: { 'if-none-match': etag } })).status).toBe(304)

    const wrong = feedPath(feed.url).replace(/\/[\w-]{22}\.ics$/, '/AAAAAAAAAAAAAAAAAAAAAA.ics')
    expect((await app.request(wrong)).status).toBe(404)
    expect((await app.request('/calendar/not-a-uuid/AAAAAAAAAAAAAAAAAAAAAA.ics')).status).toBe(404)
  })

  it('applies the student’s choices to every feed', async () => {
    const overview = await json<CalendarOverview>(await call('/api/calendar', { cookie }))
    const settings = overview.source?.settings
    if (!settings) throw new Error('no settings')
    expect(
      (await call('/api/calendar/settings', { method: 'PUT', cookie, body: { showKind: 'ja' } })).status,
    ).toBe(400)
    const saved = await call('/api/calendar/settings', {
      method: 'PUT',
      cookie,
      body: {
        ...settings,
        excludedSubjects: ['Begrüßung Erstsemester Bachelor Informatik und Technische Informatik'],
        subjects: {
          ...settings.subjects,
          Rechnernetze: { ...settings.subjects.Rechnernetze, shortName: 'RN' },
        },
        cancelled: 'hide',
      },
    })
    expect(saved.status).toBe(200)
    const body = await (await app.request(feedPath(overview.feeds[0]?.url ?? ''))).text()
    expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(21 - 1 - 1)
    expect(body).toContain('SUMMARY:RN · Vorlesung')
    expect(body).not.toContain('Entfällt')
  })

  it('makes feeds per subject, renames them and gives them new links', async () => {
    const created = await call('/api/calendar/feeds', {
      method: 'POST',
      cookie,
      body: { name: 'Rechnernetze', subjects: ['Rechnernetze'] },
    })
    expect(created.status).toBe(201)
    const feed = await json<CalendarOverview['feeds'][number]>(created)
    const body = await (await app.request(feedPath(feed.url))).text()
    expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(7)
    // One subject: the calendar takes its colour.
    expect(body).toMatch(/X-APPLE-CALENDAR-COLOR:#[0-9a-f]{6}/)

    const renamed = await call(`/api/calendar/feeds/${feed.id}`, {
      method: 'PATCH',
      cookie,
      body: { name: 'RN' },
    })
    expect(await json(renamed)).toMatchObject({ name: 'RN', subjects: ['Rechnernetze'], url: feed.url })

    const fresh = await json<typeof feed>(
      await call(`/api/calendar/feeds/${feed.id}/new-link`, { method: 'POST', cookie }),
    )
    expect(fresh.url).not.toBe(feed.url)
    expect((await app.request(feedPath(feed.url))).status).toBe(404)
    expect((await app.request(feedPath(fresh.url))).status).toBe(200)

    expect((await call(`/api/calendar/feeds/${feed.id}`, { method: 'DELETE', cookie })).status).toBe(204)
    expect((await app.request(feedPath(fresh.url))).status).toBe(404)
  })

  it('keeps other students out of a feed’s settings', async () => {
    const other = await registerVerifiedUser('andere@example.org')
    const [feed] = (await json<CalendarOverview>(await call('/api/calendar', { cookie }))).feeds
    expect(
      (
        await call(`/api/calendar/feeds/${feed?.id}`, {
          method: 'PATCH',
          cookie: other,
          body: { name: 'Meins' },
        })
      ).status,
    ).toBe(404)
    expect((await call(`/api/calendar/feeds/${feed?.id}`, { method: 'DELETE', cookie: other })).status).toBe(
      404,
    )
  })

  it('fetches again by hand at most once a minute', async () => {
    expect((await call('/api/calendar/refresh', { method: 'POST', cookie })).status).toBe(429)
  })

  it('keeps the last good dates when Stud.IP fails or suddenly sends none', async () => {
    const [row] = await connection.db.select().from(calendarSource)
    const later = (minutes: number) => new Date((row?.lastFetchedAt?.getTime() ?? 0) + minutes * 60_000)
    upstream.status = 500
    expect(await runCalendarSync({ db: connection.db, mailer, config, fetcher }, later(61))).toEqual({
      updated: 0,
      failed: 1,
    })
    upstream.status = 200
    upstream.body = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'
    // After a failure the next fetch waits twice as long.
    expect(await runCalendarSync({ db: connection.db, mailer, config, fetcher }, later(100))).toEqual({
      updated: 0,
      failed: 0,
    })
    expect(await runCalendarSync({ db: connection.db, mailer, config, fetcher }, later(200))).toEqual({
      updated: 0,
      failed: 1,
    })
    const overview = await json<CalendarOverview>(await call('/api/calendar', { cookie }))
    expect(overview.source).toMatchObject({ status: 'error', error: 'empty' })
    expect(overview.source?.events).toHaveLength(21)
    upstream.body = SAMPLE
    expect(await runCalendarSync({ db: connection.db, mailer, config, fetcher }, later(400))).toEqual({
      updated: 1,
      failed: 0,
    })
  })

  it('mails changes when alerts are on, and stops after the unsubscribe link', async () => {
    const overview = await json<CalendarOverview>(await call('/api/calendar', { cookie }))
    const settings = overview.source?.settings
    await call('/api/calendar/settings', { method: 'PUT', cookie, body: { ...settings, changeAlerts: true } })
    // The last Rechnernetze lecture (3 November) is cancelled.
    upstream.body = SAMPLE.replace(
      /SUMMARY:Vorlesung: Rechnernetze(\r\n(?:(?!END:VEVENT).)*\r\n)*?DTSTART;TZID=Europe\/Berlin:20261103/s,
      (match) =>
        match.replace('SUMMARY:Vorlesung: Rechnernetze', 'SUMMARY:Vorlesung: Rechnernetze (fällt aus)'),
    )
    expect(upstream.body).not.toBe(SAMPLE)
    const [row] = await connection.db.select().from(calendarSource)
    const now = new Date('2026-10-20T08:00:00Z')
    await connection.db
      .update(calendarSource)
      .set({ lastFetchedAt: new Date(now.getTime() - 2 * 3_600_000) })
      .where(eq(calendarSource.id, row?.id ?? ''))
    const sentBefore = mailer.sent.length
    expect(await runCalendarSync({ db: connection.db, mailer, config, fetcher }, now)).toEqual({
      updated: 1,
      failed: 0,
    })

    const alerts = mailer.sent.slice(sentBefore).filter((mail) => mail.to === email)
    expect(alerts).toHaveLength(1)
    const [alert] = alerts
    expect(alert?.subject).toBe('Stundenplan: 1 Änderung')
    expect(alert?.text).toContain('Entfällt: RN · Vorlesung')
    expect(alert?.text).not.toContain('Ab12Cd34')
    expect(alert?.headers?.['List-Unsubscribe']).toContain('list=calendar')

    const changes = (await json<CalendarOverview>(await call('/api/calendar', { cookie }))).source?.changes
    expect(changes?.[0]).toMatchObject({ kind: 'cancelled', course: 'Vorlesung: Rechnernetze' })

    const oneClick = new URL(/<(.+)>/.exec(alert?.headers?.['List-Unsubscribe'] ?? '')?.[1] ?? '')
    const reminderToken = oneClick.searchParams.get('token') ?? ''
    // A token for change alerts does not turn off exam reminders, nor the other way round.
    expect(
      (
        await app.request(`/api/notifications/unsubscribe?token=${encodeURIComponent(reminderToken)}`, {
          method: 'POST',
        })
      ).status,
    ).toBe(400)
    expect((await app.request(`${oneClick.pathname}${oneClick.search}`, { method: 'POST' })).status).toBe(200)
    const after = await json<CalendarOverview>(await call('/api/calendar', { cookie }))
    expect(after.source?.settings.changeAlerts).toBe(false)
  })

  it('includes the calendar in the account data export', async () => {
    const exported = await json<{ calendar: { link: string; events: unknown[]; feeds: unknown[] } }>(
      await call('/api/account/export', { cookie }),
    )
    expect(exported.calendar.link).toBe(LINK)
    expect(exported.calendar.events).toHaveLength(21)
    expect(exported.calendar.feeds).toHaveLength(1)
  })

  it('removes the link, the dates and every feed', async () => {
    const [feed] = (await json<CalendarOverview>(await call('/api/calendar', { cookie }))).feeds
    expect((await call('/api/calendar/source', { method: 'DELETE', cookie })).status).toBe(204)
    expect((await json<CalendarOverview>(await call('/api/calendar', { cookie }))).source).toBeNull()
    expect((await app.request(feedPath(feed?.url ?? ''))).status).toBe(404)
  })
})

describe('feed paths', () => {
  it('leave the calendar page and every other /calendar path to the web app', async () => {
    const auth = createAuth({ config, db: connection.db, mailer })
    const withWeb = createApp({
      config,
      db: connection.db,
      auth,
      mailer,
      calendarFetcher: fetcher,
      staticFiles: { assets: (_c, next) => next(), index: async (c) => c.text('web app') },
    })
    expect(await (await withWeb.request('/calendar')).text()).toBe('web app')
    expect(await (await withWeb.request('/calendar/settings/x')).text()).toBe('web app')
    const feed = await withWeb.request(
      '/calendar/00000000-0000-4000-8000-000000000000/AAAAAAAAAAAAAAAAAAAAAA.ics',
    )
    expect(feed.status).toBe(404)
    expect(await feed.text()).toBe('Not found')
  })
})
