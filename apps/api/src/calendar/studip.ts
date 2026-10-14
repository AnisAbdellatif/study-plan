import type { CalendarEvent } from '@study-plan/shared'
import type { IcsEvent } from './ics.ts'

/**
 * How Stud.IP's calendar export reads. Its titles are "<course type>: <course title>", e.g.
 * "Vorlesung: Analysis I" or "Übung: Übung: Analysis I"; every date is its own event with a UID that stays the same
 * while the date exists, and cancelled dates stay in the export with "(fällt aus)" after the title.
 */

const CANCELLED_NOTE = /\s*\((?:fällt aus|entfällt|cancell?ed)\)\s*$/i
/** Longer first segments are part of the title, not a course type. */
const MAX_KIND_LENGTH = 30
/** Words that mark a course as the exercise or group part of a subject. */
const PART_PREFIX =
  /^(?:übung(?:en)?|uebung(?:en)?|hörsaalübung|saalübung|gruppenübung|großübung|globalübung|tutorium|tutorien|tutorial|exercises?|praktikum|labor)(?=[\s:.–-]|$)[\s:.–-]*/i
/** "Gruppe 3", "(Gruppe A)", "- Gr. 2" and the like at the end of a title. */
const GROUP_SUFFIX = /\s*[-–,(]?\s*(?:gruppe|group|gr\.)\s*[\w.]{1,4}\)?\s*$/i

export function splitTitle(summary: string): {
  course: string
  kind: string
  name: string
  cancelled: boolean
} {
  const course = summary.replace(CANCELLED_NOTE, '').trim()
  const cancelled = course !== summary.trim()
  const colon = course.indexOf(': ')
  if (colon > 0 && colon <= MAX_KIND_LENGTH) {
    return { course, kind: course.slice(0, colon).trim(), name: course.slice(colon + 2).trim(), cancelled }
  }
  return { course, kind: '', name: course, cancelled }
}

/** The subject a course belongs to, so its lecture, exercise and groups end up together. */
export function subjectOf(name: string): string {
  let subject = name
  // "Übung: Übung: …" exists, so prefixes are taken off until none is left.
  for (let next = subject.replace(PART_PREFIX, ''); next !== subject && next.length > 0; ) {
    subject = next
    next = subject.replace(PART_PREFIX, '')
  }
  const withoutGroup = subject.replace(GROUP_SUFFIX, '').trim()
  return withoutGroup.length > 0 ? withoutGroup : subject.trim()
}

const berlinParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

const wallClock = (iso: string): { weekday: number; time: string } => {
  const parts = berlinParts.formatToParts(new Date(iso))
  const field = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return { weekday: WEEKDAYS[field('weekday')] ?? 0, time: `${field('hour')}:${field('minute')}` }
}

/** "2|15:00|16:30": weekday and times in Berlin, shared by the weekly dates of a course. */
export function slotOf(start: string, end: string): string {
  const from = wallClock(start)
  return `${from.weekday}|${from.time}|${wallClock(end).time}`
}

export function toCalendarEvent(event: IcsEvent): CalendarEvent {
  const title = splitTitle(event.summary)
  return {
    uid: event.uid,
    course: title.course,
    kind: title.kind,
    name: title.name,
    subject: subjectOf(title.name),
    slot: slotOf(event.start, event.end),
    start: event.start,
    end: event.end,
    location: event.location,
    description: event.description,
    cancelled: title.cancelled || event.status === 'CANCELLED',
  }
}
