import { addDays, type DeadlineEvent } from './deadlines.ts'

export interface IcsOptions {
  calendarName: string
  /** Stamped into every event as DTSTAMP. */
  now: Date
  /** Event title, e.g. "Prüfung: Analysis I". Lives in the UI so the shared package stays language-neutral. */
  summarize: (event: DeadlineEvent) => string
}

const escapeText = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

const compactDate = (isoDate: string): string => isoDate.replaceAll('-', '')

const utcStamp = (date: Date): string =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

const encoder = new TextEncoder()

/** RFC 5545 line folding: at most 75 octets per line, continuation lines start with a space. */
function fold(line: string): string[] {
  const parts: string[] = []
  let current = ''
  let size = 0
  for (const char of line) {
    const bytes = encoder.encode(char).length
    const limit = parts.length === 0 ? 75 : 74
    if (size + bytes > limit) {
      parts.push(current)
      current = ''
      size = 0
    }
    current += char
    size += bytes
  }
  parts.push(current)
  return parts.map((part, index) => (index === 0 ? part : ` ${part}`))
}

/** An iCalendar file with one all-day event per deadline. */
export function createIcs(events: readonly DeadlineEvent[], options: IcsOptions): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//study-plan//Studienplaner//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.calendarName)}`,
  ]
  const stamp = utcStamp(options.now)
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.kind}-${event.code}-${compactDate(event.date)}@study-plan`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(event.date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(event.date, 1))}`,
      `SUMMARY:${escapeText(options.summarize(event))}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return `${lines.flatMap(fold).join('\r\n')}\r\n`
}
