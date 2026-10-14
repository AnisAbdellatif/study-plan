import {
  type CalendarChange,
  type CalendarDisplay,
  type CalendarEvent,
  type CalendarSelection,
  type CalendarSettings,
  calendarDisplaySchema,
  calendarSelectionSchema,
  calendarSubjects,
  eventTitle,
  groupedEvents,
  isEventIncluded,
  linkSettings,
  withSubjectColors,
} from '@study-plan/shared'
import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm'
import type { Config } from '../config.ts'
import type { Database } from '../db/connection.ts'
import { calendar, calendarSource, user } from '../db/schema.ts'
import { type CalendarChangeItem, calendarChangesMail, type Mailer, mailLocale } from '../mail.ts'
import { UNSUBSCRIBE_PATH, unsubscribeToken } from '../reminders.ts'
import { decryptSourceUrl } from './secrets.ts'
import { type Fetcher, fetchSourceCalendar } from './source.ts'

/** Changes kept for the calendar page. */
const MAX_STORED_CHANGES = 50
/** An empty calendar where there were dates is only believed after this many fetches in a row. */
const EMPTY_CONFIRMATIONS = 3
/** Sources fetched per scheduler run; the rest wait for the next one. */
const BATCH_SIZE = 25
/** A student may fetch again by hand after this long. */
export const MANUAL_REFRESH_MS = 60_000

export interface CalendarDependencies {
  db: Database
  mailer: Mailer
  config: Config
  /** Tests pass a fake; production uses the global fetch. */
  fetcher?: Fetcher
}

export const readDisplay = (value: unknown): CalendarDisplay => {
  const parsed = calendarDisplaySchema.safeParse(value)
  return parsed.success ? parsed.data : calendarDisplaySchema.parse({})
}

export const readSelection = (value: unknown): CalendarSelection => {
  const parsed = calendarSelectionSchema.safeParse(value)
  return parsed.success ? parsed.data : calendarSelectionSchema.parse({})
}

/**
 * What changed between two fetches about dates that are still ahead and that the student keeps. One change per
 * date: a cancellation says more than the time or room it had.
 */
export function diffEvents(
  previous: readonly CalendarEvent[],
  next: readonly CalendarEvent[],
  settings: CalendarSettings,
  now: Date,
): CalendarChange[] {
  const detectedAt = now.toISOString()
  const upcoming = (event: CalendarEvent) => new Date(event.end).getTime() > now.getTime()
  const before = new Map(previous.map((event) => [event.uid, event]))
  const changes: CalendarChange[] = []
  const base = (event: CalendarEvent) => ({
    uid: event.uid,
    subject: event.subject,
    course: event.course,
    start: event.start,
    end: event.end,
    location: event.location,
    detectedAt,
  })
  for (const event of next) {
    const old = before.get(event.uid)
    before.delete(event.uid)
    if (!isEventIncluded(event, settings)) continue
    if (!old) {
      if (upcoming(event) && !event.cancelled) changes.push({ kind: 'added', ...base(event) })
      continue
    }
    if (!upcoming(event) && !upcoming(old)) continue
    if (!old.cancelled && event.cancelled) changes.push({ kind: 'cancelled', ...base(event) })
    else if (old.cancelled && !event.cancelled) changes.push({ kind: 'restored', ...base(event) })
    else if (event.cancelled) continue
    else if (old.start !== event.start || old.end !== event.end) {
      changes.push({ kind: 'moved', ...base(event), previousStart: old.start, previousEnd: old.end })
    } else if (old.location !== event.location) {
      changes.push({ kind: 'room', ...base(event), previousLocation: old.location })
    }
  }
  for (const old of before.values()) {
    if (isEventIncluded(old, settings) && upcoming(old) && !old.cancelled) {
      changes.push({ kind: 'removed', ...base(old) })
    }
  }
  return changes
}

const ALERT_LABELS = { de: { cancelled: 'Entfällt' }, en: { cancelled: 'Cancelled' } }

/** Alert rows: new or removed dates of one course become one row when there are more than two of them. */
export function alertItems(
  changes: readonly CalendarChange[],
  events: readonly CalendarEvent[],
  settings: CalendarSettings,
  locale: 'de' | 'en',
): CalendarChangeItem[] {
  const byUid = new Map(events.map((event) => [event.uid, event]))
  const title = (change: CalendarChange) => {
    const event = byUid.get(change.uid)
    // Removed dates are gone from the events; their course still names them.
    return event ? eventTitle({ ...event, cancelled: false }, settings, ALERT_LABELS[locale]) : change.course
  }
  const items: CalendarChangeItem[] = []
  const groups = new Map<string, CalendarChange[]>()
  for (const change of changes) {
    if (change.kind === 'added' || change.kind === 'removed') {
      const key = `${change.kind}|${change.course}`
      groups.set(key, [...(groups.get(key) ?? []), change])
    } else {
      items.push({
        kind: change.kind,
        title: title(change),
        start: change.start,
        previousStart: change.previousStart,
        location: change.location,
        previousLocation: change.previousLocation,
      })
    }
  }
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.start.localeCompare(b.start))
    const [first] = sorted
    if (!first) continue
    if (sorted.length > 2)
      items.push({ kind: first.kind, title: title(first), start: first.start, count: sorted.length })
    else
      for (const change of sorted)
        items.push({ kind: change.kind, title: title(change), start: change.start })
  }
  return items
}

type SourceRow = typeof calendarSource.$inferSelect

export type RefreshOutcome = 'updated' | 'failed' | 'skipped'

/**
 * Fetches one link, stores its dates and new subjects' colours, records the changes and mails them. The caller must have claimed the source (see
 * claimSource), so two runs never diff the same fetch twice. Failures keep the last good events: a calendar that
 * cannot be read must not empty the student's subscribed calendars.
 */
export async function refreshSource(
  { db, mailer, config, fetcher }: CalendarDependencies,
  row: SourceRow,
  now: Date = new Date(),
): Promise<RefreshOutcome> {
  const url = decryptSourceUrl(config.authSecret, row.encryptedUrl)
  const result = url ? await fetchSourceCalendar(url, fetcher) : ({ ok: false, error: 'not_found' } as const)
  const fail = async (error: NonNullable<SourceRow['lastError']>) => {
    await db
      .update(calendarSource)
      .set({
        status: 'error',
        lastError: error,
        failures: row.failures + 1,
        lastFetchedAt: now,
        updatedAt: now,
      })
      .where(eq(calendarSource.id, row.id))
    return 'failed' as const
  }
  if (!result.ok) return fail(result.error)
  if (result.events.length === 0 && row.events.length > 0 && row.failures + 1 < EMPTY_CONFIRMATIONS) {
    return fail('empty')
  }

  // The link's dates and colours and the account's change list are written together. Both rows are locked, so two
  // links of one student syncing at once keep each other's changes and the student's edits aren't lost.
  const stored = await db.transaction(async (tx) => {
    const [account] = await tx.select().from(calendar).where(eq(calendar.userId, row.userId)).for('update')
    const [current] = await tx
      .select({ selection: calendarSource.selection })
      .from(calendarSource)
      .where(eq(calendarSource.id, row.id))
      .for('update')
    if (!account || !current) return null
    // New subjects get colours; the student's choices for the link stay. Subjects are the student's grouping.
    const chosen = readSelection(current.selection)
    const grouped = groupedEvents(result.events, chosen)
    const selection = withSubjectColors(chosen, calendarSubjects(grouped))
    await tx
      .update(calendarSource)
      .set({
        status: 'ok',
        lastError: null,
        failures: 0,
        lastFetchedAt: now,
        lastSuccessAt: now,
        events: result.events,
        selection,
        updatedAt: now,
      })
      .where(eq(calendarSource.id, row.id))
    const settings = linkSettings(readDisplay(account.settings), selection)
    // The first fetch of a link has nothing to compare with.
    const changes = row.lastSuccessAt
      ? diffEvents(groupedEvents(row.events, selection), grouped, settings, now).map((change) => ({
          ...change,
          sourceId: row.id,
        }))
      : []
    if (changes.length > 0) {
      await tx
        .update(calendar)
        .set({ changes: [...changes, ...account.changes].slice(0, MAX_STORED_CHANGES), updatedAt: now })
        .where(eq(calendar.userId, row.userId))
    }
    return { events: grouped, settings, changes }
  })
  if (!stored) return 'updated'
  const { events, settings, changes } = stored

  if (changes.length > 0 && settings.changeAlerts) {
    const [owner] = await db
      .select({ email: user.email, locale: user.locale, verified: user.emailVerified })
      .from(user)
      .where(eq(user.id, row.userId))
    if (owner?.verified) {
      const locale = mailLocale(owner)
      const token = encodeURIComponent(unsubscribeToken(config.authSecret, row.userId, 'calendar'))
      try {
        await mailer.send(
          calendarChangesMail(
            owner.email,
            alertItems(changes, events, settings, locale),
            {
              calendarUrl: `${config.publicUrl}/calendar`,
              unsubscribeUrl: `${config.publicUrl}/unsubscribe?list=calendar&token=${token}`,
              oneClickUrl: `${config.publicUrl}${UNSUBSCRIBE_PATH}?list=calendar&token=${token}`,
            },
            locale,
          ),
        )
      } catch (error) {
        // The changes stay listed on the calendar page; the next alert covers only newer ones.
        console.error('[calendar] change alert failed', error)
      }
    }
  }
  return 'updated'
}

/**
 * Marks a source as being fetched, unless it was fetched less than `minAgeMs` ago or another run claimed it
 * first. Returns the row as it was before, or null.
 */
export async function claimSource(
  db: Database,
  id: string,
  minAgeMs: number,
  now: Date = new Date(),
): Promise<SourceRow | null> {
  const [row] = await db.select().from(calendarSource).where(eq(calendarSource.id, id))
  if (!row) return null
  if (row.lastFetchedAt && now.getTime() - row.lastFetchedAt.getTime() < minAgeMs) return null
  const [claimed] = await db
    .update(calendarSource)
    .set({ lastFetchedAt: now })
    .where(
      and(
        eq(calendarSource.id, row.id),
        row.lastFetchedAt
          ? eq(calendarSource.lastFetchedAt, row.lastFetchedAt)
          : isNull(calendarSource.lastFetchedAt),
      ),
    )
    .returning({ id: calendarSource.id })
  return claimed ? row : null
}

/** How long to wait after a fetch: the refresh interval, stretched after failures up to six times. */
const waitAfter = (failures: number, refreshMs: number) => refreshMs * Math.min(1 + failures, 6)

export interface CalendarRun {
  updated: number
  failed: number
}

/** Fetches every source that is due, oldest first. */
export async function runCalendarSync(
  dependencies: CalendarDependencies,
  now: Date = new Date(),
): Promise<CalendarRun> {
  const { db, config } = dependencies
  const refreshMs = config.calendar.refreshMinutes * 60_000
  const due = await db
    .select({
      id: calendarSource.id,
      failures: calendarSource.failures,
      lastFetchedAt: calendarSource.lastFetchedAt,
    })
    .from(calendarSource)
    .where(
      or(
        isNull(calendarSource.lastFetchedAt),
        lt(calendarSource.lastFetchedAt, new Date(now.getTime() - refreshMs)),
      ),
    )
    .orderBy(sql`${calendarSource.lastFetchedAt} asc nulls first`, asc(calendarSource.id))
    .limit(BATCH_SIZE)
  const run: CalendarRun = { updated: 0, failed: 0 }
  for (const candidate of due) {
    const row = await claimSource(db, candidate.id, waitAfter(candidate.failures, refreshMs), now)
    if (!row) continue
    const outcome = await refreshSource(dependencies, row, now)
    if (outcome === 'updated') run.updated++
    else if (outcome === 'failed') run.failed++
  }
  return run
}

/** Checks for due calendars every few minutes. Returns a function that stops it. */
export function startCalendarScheduler(dependencies: CalendarDependencies, tickMs = 5 * 60_000): () => void {
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const run = await runCalendarSync(dependencies)
      if (run.updated > 0 || run.failed > 0)
        console.info(`[calendar] ${run.updated} updated, ${run.failed} failed`)
    } catch (error) {
      console.error('[calendar] run failed', error)
    } finally {
      running = false
    }
  }
  const first = setTimeout(tick, 15_000)
  const timer = setInterval(tick, tickMs)
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
