import { z } from 'zod'

/**
 * Calendar feeds: a student's university calendar (Stud.IP) filtered and renamed into feeds they subscribe to.
 * The server fetches and stores the events; this module holds what both sides need to agree on.
 */

/** One date of the upstream calendar, as the server stores it after reading the feed. */
export interface CalendarEvent {
  /** The upstream UID; stable across fetches. */
  uid: string
  /** The upstream course: its title without the cancellation note, e.g. "Übung: Übung: Analysis I". */
  course: string
  /** The course type as the upstream calendar names it, e.g. "Vorlesung"; empty when the title has none. */
  kind: string
  /** The course title without its type, e.g. "Übung: Analysis I". */
  name: string
  /** Lectures, exercises and groups of one subject share it, e.g. "Analysis I". */
  subject: string
  /** ISO weekday and wall-clock times in Berlin, e.g. "2|15:00|16:30". Weekly dates of a course share it. */
  slot: string
  /** UTC instants as ISO strings. */
  start: string
  end: string
  location: string
  description: string
  cancelled: boolean
}

/**
 * Colours for subjects: CSS colour names (what RFC 7986 COLOR allows), their hex value for previews and Apple
 * Calendar, and the round emoji that can stand in for them in event titles, which every client shows.
 */
export const CALENDAR_COLORS = [
  { name: 'tomato', hex: '#ff6347', dot: '🔴' },
  { name: 'darkorange', hex: '#ff8c00', dot: '🟠' },
  { name: 'gold', hex: '#ffd700', dot: '🟡' },
  { name: 'mediumseagreen', hex: '#3cb371', dot: '🟢' },
  { name: 'royalblue', hex: '#4169e1', dot: '🔵' },
  { name: 'mediumorchid', hex: '#ba55d3', dot: '🟣' },
  { name: 'sienna', hex: '#a0522d', dot: '🟤' },
  { name: 'slategray', hex: '#708090', dot: '⚫' },
] as const

export type CalendarColorName = (typeof CALENDAR_COLORS)[number]['name']
export type CalendarColor = (typeof CALENDAR_COLORS)[number]

const colorNames = CALENDAR_COLORS.map((color) => color.name) as [CalendarColorName, ...CalendarColorName[]]

export const calendarColor = (name: string | undefined): CalendarColor | undefined =>
  CALENDAR_COLORS.find((color) => color.name === name)

const key = z.string().min(1).max(500)

export const subjectSettingsSchema = z.object({
  /** Replaces the subject's name in event titles. */
  shortName: z.string().trim().max(80).optional(),
  color: z.enum(colorNames).optional(),
})

export const calendarSettingsSchema = z.object({
  subjects: z.record(key, subjectSettingsSchema).default({}),
  /** Subjects left out of every feed, including courses of them that appear later. */
  excludedSubjects: z.array(key).max(500).default([]),
  /** Upstream courses left out, e.g. the lecture of a subject whose exercise stays. */
  excludedCourses: z.array(key).max(1000).default([]),
  /** Weekly dates of a course left out, as `slotKey(course, slot)`: other exercise groups, for example. */
  excludedSlots: z.array(key).max(2000).default([]),
  /** Single dates left out, by UID. */
  hiddenEvents: z.array(key).max(5000).default([]),
  /** Adds the course type to titles, e.g. "Analysis I · Übung". */
  showKind: z.boolean().default(true),
  /** Puts the subject's colour as a round emoji in front of titles. */
  colorDots: z.boolean().default(false),
  /** Cancelled dates stay in the feed with a note in the title, or leave it. */
  cancelled: z.enum(['mark', 'hide']).default('mark'),
  /** E-mails about changed, cancelled and new dates. */
  changeAlerts: z.boolean().default(false),
})

export type CalendarSettings = z.infer<typeof calendarSettingsSchema>
export type SubjectSettings = z.infer<typeof subjectSettingsSchema>

export const defaultCalendarSettings = (): CalendarSettings => calendarSettingsSchema.parse({})

export const slotKey = (course: string, slot: string): string => `${course}#${slot}`

/** Course types that say nothing ("other") and stay out of titles. */
const SILENT_KINDS = new Set(['sonstige', 'sonstiges', 'other', 'others'])

/** Whether the student's choices keep the event, before a feed picks its subjects. */
export function isEventIncluded(event: CalendarEvent, settings: CalendarSettings): boolean {
  return (
    !settings.excludedSubjects.includes(event.subject) &&
    !settings.excludedCourses.includes(event.course) &&
    !settings.excludedSlots.includes(slotKey(event.course, event.slot)) &&
    !settings.hiddenEvents.includes(event.uid)
  )
}

export interface TitleLabels {
  /** Put in front of cancelled dates, e.g. "Entfällt". */
  cancelled: string
}

/** The title an event gets in the feeds, e.g. "🔵 Ana I · Übung". */
export function eventTitle(event: CalendarEvent, settings: CalendarSettings, labels: TitleLabels): string {
  const subject = settings.subjects[event.subject]
  const base = subject?.shortName || event.subject
  const kind =
    settings.showKind && event.kind && !SILENT_KINDS.has(event.kind.toLowerCase()) ? ` · ${event.kind}` : ''
  const dot = settings.colorDots ? calendarColor(subject?.color)?.dot : undefined
  const title = `${dot ? `${dot} ` : ''}${base}${kind}`
  return event.cancelled ? `${labels.cancelled}: ${title}` : title
}

/**
 * The events of one feed: those the student keeps, of the feed's subjects (null: all), cancelled ones only when
 * they are marked rather than hidden. Sorted by start.
 */
export function feedEvents(
  events: readonly CalendarEvent[],
  settings: CalendarSettings,
  subjects: readonly string[] | null,
): CalendarEvent[] {
  return events
    .filter(
      (event) =>
        isEventIncluded(event, settings) &&
        (subjects === null || subjects.includes(event.subject)) &&
        !(event.cancelled && settings.cancelled === 'hide'),
    )
    .sort((a, b) => a.start.localeCompare(b.start) || a.uid.localeCompare(b.uid))
}

/** Subjects in the order students know them: by name. */
export const calendarSubjects = (events: readonly CalendarEvent[]): string[] =>
  [...new Set(events.map((event) => event.subject))].sort((a, b) => a.localeCompare(b, 'de'))

/**
 * Settings with a colour for every subject that has none yet, picking the least used colours first so subjects
 * stay apart. Existing choices are kept.
 */
export function withSubjectColors(settings: CalendarSettings, subjects: readonly string[]): CalendarSettings {
  const missing = subjects.filter((subject) => !settings.subjects[subject]?.color)
  if (missing.length === 0) return settings
  const usage = new Map<CalendarColorName, number>(CALENDAR_COLORS.map((color) => [color.name, 0]))
  for (const subject of subjects) {
    const color = settings.subjects[subject]?.color
    if (color) usage.set(color, (usage.get(color) ?? 0) + 1)
  }
  const next = { ...settings.subjects }
  for (const subject of missing) {
    // Stable order: the palette order breaks ties.
    const [color] = [...usage.entries()].sort((a, b) => a[1] - b[1])[0] ?? ['slategray']
    usage.set(color, (usage.get(color) ?? 0) + 1)
    next[subject] = { ...next[subject], color }
  }
  return { ...settings, subjects: next }
}

/** What changed about a date the student keeps, for alerts and the recent changes list. */
export interface CalendarChange {
  kind: 'cancelled' | 'restored' | 'moved' | 'room' | 'added' | 'removed'
  uid: string
  subject: string
  course: string
  /** The date's start and end now, or before it was removed. */
  start: string
  end: string
  /** For moved dates. */
  previousStart?: string
  previousEnd?: string
  location?: string
  /** For room changes. */
  previousLocation?: string
  /** When the server noticed, as an ISO string. */
  detectedAt: string
}

/** A feed as the owner sees it. */
export interface CalendarFeedView {
  id: string
  name: string
  /** Null: every subject the student keeps. */
  subjects: string[] | null
  /** The subscription URL; it is a secret. */
  url: string
  createdAt: string
}

export type CalendarSourceStatus = 'pending' | 'ok' | 'error'

/** The upstream calendar as the owner sees it. Never the upstream URL itself. */
export interface CalendarSourceView {
  host: string
  status: CalendarSourceStatus
  /** Why the last fetch failed, when it did. */
  error: CalendarFetchError | null
  lastFetchedAt: string | null
  lastSuccessAt: string | null
  settings: CalendarSettings
  events: CalendarEvent[]
  changes: CalendarChange[]
}

export type CalendarFetchError =
  | 'unreachable'
  | 'timeout'
  | 'rejected'
  | 'not_found'
  | 'too_large'
  | 'not_a_calendar'
  | 'empty'

export interface CalendarOverview {
  source: CalendarSourceView | null
  feeds: CalendarFeedView[]
  /** Hosts whose calendars can be added, e.g. "studip.uni-hannover.de". */
  allowedHosts: string[]
  /** How often the server fetches the upstream calendar, in minutes. */
  refreshMinutes: number
}
