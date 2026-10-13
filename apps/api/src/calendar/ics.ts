/**
 * The small part of iCalendar (RFC 5545) the calendar feeds need: reading the VEVENTs of an upstream feed and
 * writing a feed of single events. Recurrence rules are not expanded: Stud.IP exports every date on its own.
 */
import { escapeIcsText, foldIcsLine } from '@study-plan/shared'

export interface IcsProperty {
  name: string
  params: Record<string, string>
  value: string
}

export interface IcsEvent {
  uid: string
  summary: string
  description: string
  location: string
  status: string
  /** UTC instants as ISO strings. */
  start: string
  end: string
}

/** Joins folded lines (RFC 5545 3.1): a line break followed by a space or tab continues the previous line. */
const unfold = (text: string): string[] =>
  text
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')

export function parseContentLine(line: string): IcsProperty | null {
  // The value starts after the first colon outside a quoted parameter value.
  let quoted = false
  let colon = -1
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (char === '"') quoted = !quoted
    else if (char === ':' && !quoted) {
      colon = index
      break
    }
  }
  if (colon <= 0) return null
  const [rawName = '', ...rawParams] = line.slice(0, colon).split(';')
  const params: Record<string, string> = {}
  for (const param of rawParams) {
    const equals = param.indexOf('=')
    if (equals > 0)
      params[param.slice(0, equals).toUpperCase()] = param.slice(equals + 1).replace(/^"|"$/g, '')
  }
  return { name: rawName.toUpperCase(), params, value: line.slice(colon + 1) }
}

export const unescapeText = (value: string): string =>
  value.replace(/\\([\\;,nN])/g, (_match, char: string) => (char === 'n' || char === 'N' ? '\n' : char))

/** The offset of `timeZone` from UTC at `instant`, in minutes. */
function zoneOffsetMinutes(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant))
  const field = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const asUtc = Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    field('hour'),
    field('minute'),
    field('second'),
  )
  return Math.round((asUtc - instant) / 60_000)
}

/** The UTC instant of a wall-clock time in `timeZone`. */
export function zonedTimeToUtc(
  [year, month, day, hour, minute, second]: readonly number[],
  timeZone: string,
): number {
  const wall = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, second ?? 0)
  // Two passes settle the offset around daylight saving changes.
  let instant = wall - zoneOffsetMinutes(wall, timeZone) * 60_000
  instant = wall - zoneOffsetMinutes(instant, timeZone) * 60_000
  return instant
}

const isTimeZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** DATE or DATE-TIME values: UTC (…Z), with a TZID, or floating (read in `defaultZone`). */
export function parseDateValue(property: IcsProperty, defaultZone: string): number | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(property.value.trim())
  if (!match) return null
  const fields = match.slice(1, 7).map((part) => Number(part ?? 0))
  if (match[7] === 'Z') {
    const [year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0] = fields
    return Date.UTC(year, month - 1, day, hour, minute, second)
  }
  const zone = property.params.TZID && isTimeZone(property.params.TZID) ? property.params.TZID : defaultZone
  return zonedTimeToUtc(fields, zone)
}

export interface ParsedCalendar {
  events: IcsEvent[]
}

/**
 * The VEVENTs of a calendar. Events without a UID or a readable start are skipped; a missing end means the
 * start (RFC 5545 3.6.1). Returns null when the text is not a calendar at all.
 */
export function parseCalendar(text: string, defaultZone = 'Europe/Berlin'): ParsedCalendar | null {
  const lines = unfold(text.replace(/^\uFEFF/, ''))
  if (!lines.some((line) => line.trim().toUpperCase() === 'BEGIN:VCALENDAR')) return null
  const events: IcsEvent[] = []
  let current: IcsProperty[] | null = null
  let depth = 0
  for (const line of lines) {
    const upper = line.trim().toUpperCase()
    if (upper === 'BEGIN:VEVENT') {
      current = []
      depth = 0
      continue
    }
    if (current === null) continue
    // Nested components such as VALARM belong to the event but their properties do not.
    if (upper.startsWith('BEGIN:')) depth++
    else if (upper.startsWith('END:') && depth > 0) depth--
    else if (upper === 'END:VEVENT') {
      const event = toEvent(current, defaultZone)
      if (event) events.push(event)
      current = null
    } else if (depth === 0) {
      const property = parseContentLine(line)
      if (property) current.push(property)
    }
  }
  return { events }
}

function toEvent(properties: IcsProperty[], defaultZone: string): IcsEvent | null {
  const find = (name: string) => properties.find((property) => property.name === name)
  const text = (name: string) => {
    const property = find(name)
    return property ? unescapeText(property.value).trim() : ''
  }
  const uid = text('UID')
  const startProperty = find('DTSTART')
  const start = startProperty ? parseDateValue(startProperty, defaultZone) : null
  if (!uid || start === null) return null
  const endProperty = find('DTEND')
  const end = endProperty ? parseDateValue(endProperty, defaultZone) : null
  return {
    uid,
    summary: text('SUMMARY').replace(/\s+/g, ' '),
    description: text('DESCRIPTION'),
    location: text('LOCATION').replace(/[ \t]+/g, ' '),
    status: text('STATUS').toUpperCase(),
    start: new Date(start).toISOString(),
    end: new Date(end !== null && end >= start ? end : start).toISOString(),
  }
}

const utcStamp = (iso: string): string => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export interface FeedEvent {
  uid: string
  summary: string
  start: string
  end: string
  location?: string
  description?: string
  /** An RFC 7986 CSS colour name. Most clients ignore it in subscriptions; some show it. */
  color?: string
  /** When the event last changed, as an ISO string. */
  modified?: string
}

export interface FeedCalendar {
  name: string
  /** Shown by clients that read X-WR-CALDESC. */
  description?: string
  /** CSS colour name for the whole calendar (RFC 7986), and its hex value for Apple Calendar. */
  color?: { name: string; hex: string }
  /** How often clients should check again, in minutes. */
  refreshMinutes: number
  events: readonly FeedEvent[]
}

/** A complete VCALENDAR. Times are written in UTC, so no VTIMEZONE is needed. */
export function renderCalendar(calendar: FeedCalendar, now: Date, productId: string): string {
  const stamp = utcStamp(now.toISOString())
  const refresh = `PT${Math.max(15, Math.round(calendar.refreshMinutes))}M`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${productId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `NAME:${escapeIcsText(calendar.name)}`,
    `X-WR-CALNAME:${escapeIcsText(calendar.name)}`,
    ...(calendar.description
      ? [
          `DESCRIPTION:${escapeIcsText(calendar.description)}`,
          `X-WR-CALDESC:${escapeIcsText(calendar.description)}`,
        ]
      : []),
    ...(calendar.color
      ? [`COLOR:${calendar.color.name}`, `X-APPLE-CALENDAR-COLOR:${calendar.color.hex}`]
      : []),
    `REFRESH-INTERVAL;VALUE=DURATION:${refresh}`,
    `X-PUBLISHED-TTL:${refresh}`,
  ]
  for (const event of calendar.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(event.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utcStamp(event.start)}`,
      `DTEND:${utcStamp(event.end)}`,
      `SUMMARY:${escapeIcsText(event.summary)}`,
    )
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`)
    if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`)
    if (event.color) lines.push(`COLOR:${event.color}`)
    if (event.modified) lines.push(`LAST-MODIFIED:${utcStamp(event.modified)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.flatMap(foldIcsLine).join('\r\n')}\r\n`
}
