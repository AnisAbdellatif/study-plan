import type { CalendarEvent } from '@study-plan/shared'
import { currentIntlLocale } from '../../i18n/index.ts'

const formats = new Map<string, Intl.DateTimeFormat>()

function format(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = currentIntlLocale()
  const cacheKey = `${locale}|${key}`
  let found = formats.get(cacheKey)
  if (!found) {
    // Timetables are German wall-clock times wherever the student opens the page.
    found = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'Europe/Berlin' })
    formats.set(cacheKey, found)
  }
  return found
}

/** "Di., 13. Okt., 15:00" */
export const formatEventStart = (iso: string): string =>
  format('start', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))

/** "Di., 13. Okt." */
export const formatEventDay = (iso: string): string =>
  format('day', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso))

export const formatTime = (iso: string): string =>
  format('time', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

/** Weekday number (1 = Monday) and times of a slot key such as "2|15:00|16:30". */
export function parseSlot(slot: string): { weekday: number; from: string; to: string } {
  const [weekday = '0', from = '', to = ''] = slot.split('|')
  return { weekday: Number(weekday), from, to }
}

/** Initials of the capitalised words, e.g. "Hardware-beschleunigte Kommunikationsnetze" → "HK". */
export function abbreviate(name: string): string {
  const initials = name
    .split(/[\s-]+/)
    .filter((word) => /^\p{Lu}/u.test(word))
    .map((word) => word[0])
    .join('')
  return initials.length >= 2 ? initials.slice(0, 5) : name.slice(0, 8)
}

export interface SlotGroup {
  slot: string
  events: CalendarEvent[]
}

export interface CourseGroup {
  course: string
  kind: string
  name: string
  slots: SlotGroup[]
}

export interface SubjectGroup {
  subject: string
  courses: CourseGroup[]
  events: CalendarEvent[]
}

const KIND_ORDER = ['vorlesung', 'übung', 'tutorium']
const kindRank = (kind: string) => {
  const index = KIND_ORDER.indexOf(kind.toLowerCase())
  return index === -1 ? KIND_ORDER.length : index
}

/** Subjects by name; their lectures before exercises; weekly slots by weekday and time; dates by start. */
export function groupEvents(events: readonly CalendarEvent[]): SubjectGroup[] {
  const subjects = new Map<string, SubjectGroup>()
  for (const event of [...events].sort((a, b) => a.start.localeCompare(b.start))) {
    let subject = subjects.get(event.subject)
    if (!subject) {
      subject = { subject: event.subject, courses: [], events: [] }
      subjects.set(event.subject, subject)
    }
    subject.events.push(event)
    let course = subject.courses.find((candidate) => candidate.course === event.course)
    if (!course) {
      course = { course: event.course, kind: event.kind, name: event.name, slots: [] }
      subject.courses.push(course)
    }
    let slot = course.slots.find((candidate) => candidate.slot === event.slot)
    if (!slot) {
      slot = { slot: event.slot, events: [] }
      course.slots.push(slot)
    }
    slot.events.push(event)
  }
  const groups = [...subjects.values()].sort((a, b) => a.subject.localeCompare(b.subject, 'de'))
  for (const group of groups) {
    group.courses.sort(
      (a, b) => kindRank(a.kind) - kindRank(b.kind) || a.course.localeCompare(b.course, 'de'),
    )
    for (const course of group.courses) course.slots.sort((a, b) => a.slot.localeCompare(b.slot))
  }
  return groups
}
