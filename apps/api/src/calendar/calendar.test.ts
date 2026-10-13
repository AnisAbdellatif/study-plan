import { readFileSync } from 'node:fs'
import {
  type CalendarEvent,
  calendarSettingsSchema,
  calendarSubjects,
  eventTitle,
  feedEvents,
  slotKey,
  withSubjectColors,
} from '@study-plan/shared'
import { describe, expect, it } from 'vitest'
import { parseCalendar, renderCalendar } from './ics.ts'
import { decryptSourceUrl, encryptSourceUrl, feedToken, isFeedToken } from './secrets.ts'
import { fetchSourceCalendar, MAX_CALENDAR_BYTES, parseSourceUrl } from './source.ts'
import { splitTitle, subjectOf, toCalendarEvent } from './studip.ts'
import { alertItems, diffEvents } from './sync.ts'

/** Shaped like Stud.IP's export (Uni Hannover, 2026): folded lines, escaped commas, "(fällt aus)". */
const SAMPLE = readFileSync(new URL('./fixtures/studip-sample.ics', import.meta.url), 'utf8')
const settings = (input: object = {}) => calendarSettingsSchema.parse(input)
const sampleEvents = (): CalendarEvent[] => {
  const calendar = parseCalendar(SAMPLE)
  if (!calendar) throw new Error('sample not readable')
  return calendar.events.map(toCalendarEvent)
}
const LABELS = { cancelled: 'Entfällt' }

describe('reading iCalendar', () => {
  it('reads every event of the Stud.IP export, with folded lines and escapes undone', () => {
    const calendar = parseCalendar(SAMPLE)
    expect(calendar?.events).toHaveLength(21)
    const welcome = calendar?.events[0]
    expect(welcome?.summary).toBe(
      'sonstige: Begrüßung Erstsemester Bachelor Informatik und Technische Informatik',
    )
    expect(welcome?.location).toBe('Raum E415: Audimax, Gebaeude 1101: Hauptgebäude, Welfengarten 1')
  })

  it('turns Berlin wall-clock times into UTC on both sides of the daylight saving change', () => {
    const lectures = sampleEvents().filter((event) => event.course === 'Vorlesung: Rechnernetze')
    // 15:00 in Berlin: CEST (UTC+2) before 25 October 2026, CET (UTC+1) after.
    expect(lectures.map((event) => event.start)).toEqual([
      '2026-10-13T13:00:00.000Z',
      '2026-10-20T13:00:00.000Z',
      '2026-10-27T14:00:00.000Z',
      '2026-11-03T14:00:00.000Z',
    ])
    expect(new Set(lectures.map((event) => event.slot))).toEqual(new Set(['2|15:00|16:30']))
  })

  it('reads UTC and floating times and ignores nested components', () => {
    const calendar = parseCalendar(
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:a',
        'SUMMARY:Utc',
        'DTSTART:20261013T130000Z',
        'BEGIN:VALARM',
        'SUMMARY:Alarm',
        'END:VALARM',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:b',
        'DTSTART:20261013T150000',
        'DTEND:20261013T163000',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'SUMMARY:No uid',
        'DTSTART:20261013T150000',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
    )
    expect(calendar?.events).toEqual([
      expect.objectContaining({
        uid: 'a',
        summary: 'Utc',
        start: '2026-10-13T13:00:00.000Z',
        end: '2026-10-13T13:00:00.000Z',
      }),
      expect.objectContaining({
        uid: 'b',
        start: '2026-10-13T13:00:00.000Z',
        end: '2026-10-13T14:30:00.000Z',
      }),
    ])
  })

  it('refuses text that is no calendar', () => {
    expect(parseCalendar('<html>Login</html>')).toBeNull()
  })
})

describe('understanding Stud.IP titles', () => {
  it('splits the course type from the title and notices cancellations', () => {
    expect(splitTitle('Übung: Übung: Rechnernetze (fällt aus)')).toEqual({
      course: 'Übung: Übung: Rechnernetze',
      kind: 'Übung',
      name: 'Übung: Rechnernetze',
      cancelled: true,
    })
    expect(splitTitle('Ohne Typ')).toEqual({
      course: 'Ohne Typ',
      kind: '',
      name: 'Ohne Typ',
      cancelled: false,
    })
  })

  it('puts lectures, exercises and groups of a subject together', () => {
    expect(subjectOf('Rechnernetze')).toBe('Rechnernetze')
    expect(subjectOf('Übung: Rechnernetze')).toBe('Rechnernetze')
    expect(subjectOf('Übung Datenbanksysteme')).toBe('Datenbanksysteme')
    expect(subjectOf('Tutorium Analysis I (Gruppe 3)')).toBe('Analysis I')
    expect(subjectOf('Übungsblattbesprechung')).toBe('Übungsblattbesprechung')
    expect(subjectOf('Übung')).toBe('Übung')
  })

  it('finds the subjects of the sample', () => {
    expect(calendarSubjects(sampleEvents())).toEqual([
      'Begrüßung Erstsemester Bachelor Informatik und Technische Informatik',
      'Datenbanksysteme',
      'Rechnernetze',
    ])
  })
})

describe('choosing events', () => {
  it('leaves out subjects, courses, weekly slots and single dates the student turned off', () => {
    const events = sampleEvents()
    const exercise = events.find((event) => event.course === 'Übung: Übung Datenbanksysteme')
    if (!exercise) throw new Error('no exercise')
    const hidden = events.find((event) => event.course === 'Vorlesung: Datenbanksysteme')
    const chosen = feedEvents(
      events,
      settings({
        excludedSubjects: ['Begrüßung Erstsemester Bachelor Informatik und Technische Informatik'],
        excludedCourses: ['Vorlesung: Rechnernetze'],
        excludedSlots: [slotKey(exercise.course, '5|08:15|09:45')],
        hiddenEvents: [hidden?.uid],
      }),
      null,
    )
    expect(chosen).toHaveLength(21 - 1 - 4 - 4 - 1)
    expect(chosen.every((event) => event.slot !== '5|08:15|09:45')).toBe(true)
    expect(chosen.map((event) => event.start)).toEqual([...chosen.map((event) => event.start)].sort())
  })

  it('limits a feed to its subjects and hides cancelled dates when asked', () => {
    const events = sampleEvents()
    expect(feedEvents(events, settings(), ['Rechnernetze'])).toHaveLength(8)
    expect(feedEvents(events, settings({ cancelled: 'hide' }), ['Rechnernetze'])).toHaveLength(7)
  })

  it('titles events with the short name, the type, a colour dot and the cancellation', () => {
    const [cancelled] = sampleEvents().filter((event) => event.cancelled)
    if (!cancelled) throw new Error('no cancelled event')
    const chosen = settings({
      subjects: { Rechnernetze: { shortName: 'RN', color: 'royalblue' } },
      colorDots: true,
    })
    expect(eventTitle(cancelled, chosen, LABELS)).toBe('Entfällt: 🔵 RN · Übung')
    expect(eventTitle({ ...cancelled, cancelled: false }, settings({ showKind: false }), LABELS)).toBe(
      'Rechnernetze',
    )
    expect(eventTitle({ ...cancelled, kind: 'sonstige', cancelled: false }, settings(), LABELS)).toBe(
      'Rechnernetze',
    )
  })

  it('gives every subject its own colour and keeps chosen ones', () => {
    const chosen = withSubjectColors(settings({ subjects: { B: { color: 'tomato' } } }), ['A', 'B', 'C'])
    expect(chosen.subjects.B?.color).toBe('tomato')
    const colors = ['A', 'B', 'C'].map((subject) => chosen.subjects[subject]?.color)
    expect(new Set(colors).size).toBe(3)
  })
})

describe('writing feeds', () => {
  it('writes UTC times, escapes text and folds long lines', () => {
    const text = renderCalendar(
      {
        name: 'Stundenplan',
        color: { name: 'royalblue', hex: '#4169e1' },
        refreshMinutes: 60,
        events: [
          {
            uid: 'x@example.org',
            summary: 'Rechnernetze · Übung',
            start: '2026-10-13T13:00:00.000Z',
            end: '2026-10-13T14:30:00.000Z',
            location:
              'Raum 023, Gebäude 3703; Technische Informatik und eine sehr lange Ortsangabe für das Falten',
            color: 'royalblue',
          },
        ],
      },
      new Date('2026-10-13T08:00:00Z'),
      '-//Test//EN',
    )
    expect(text).toContain('DTSTART:20261013T130000Z\r\n')
    expect(text).toContain('X-APPLE-CALENDAR-COLOR:#4169e1\r\n')
    expect(text).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT60M\r\n')
    expect(text).toContain('LOCATION:Raum 023\\, Gebäude 3703\\; Technische')
    for (const line of text.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    // What it writes, it reads back.
    expect(parseCalendar(text)?.events[0]).toMatchObject({
      uid: 'x@example.org',
      summary: 'Rechnernetze · Übung',
      location: 'Raum 023, Gebäude 3703; Technische Informatik und eine sehr lange Ortsangabe für das Falten',
    })
  })
})

describe('calendar links', () => {
  const hosts = ['studip.uni-hannover.de']

  it('accepts Stud.IP export links in one canonical form', () => {
    expect(
      parseSourceUrl(' https://studip.uni-hannover.de/dispatch.php/ical/index/Ab12Cd34 ', hosts),
    ).toEqual({
      ok: true,
      url: 'https://studip.uni-hannover.de/dispatch.php/ical/index/Ab12Cd34',
      host: 'studip.uni-hannover.de',
    })
    expect(
      parseSourceUrl('webcal://STUDIP.uni-hannover.de/dispatch.php/ical/index/Ab12Cd34', hosts),
    ).toMatchObject({
      ok: true,
    })
  })

  it('refuses other hosts, paths, schemes and credentials, so the server fetches nothing else', () => {
    for (const [url, error] of [
      ['https://evil.example/dispatch.php/ical/index/Ab12Cd34', 'host_not_allowed'],
      ['https://studip.uni-hannover.de.evil.example/dispatch.php/ical/index/Ab12Cd34', 'host_not_allowed'],
      ['http://studip.uni-hannover.de/dispatch.php/ical/index/Ab12Cd34', 'invalid_url'],
      ['https://user:pw@studip.uni-hannover.de/dispatch.php/ical/index/Ab12Cd34', 'invalid_url'],
      ['https://studip.uni-hannover.de:8443/dispatch.php/ical/index/Ab12Cd34', 'invalid_url'],
      ['https://studip.uni-hannover.de/dispatch.php/admin', 'invalid_url'],
      ['https://studip.uni-hannover.de/dispatch.php/ical/index/Ab12Cd34?x=1', 'invalid_url'],
      ['https://studip.uni-hannover.de/dispatch.php/ical/index/../../admin', 'invalid_url'],
      ['kein link', 'invalid_url'],
    ] as const) {
      expect(parseSourceUrl(url, hosts), url).toEqual({ ok: false, error })
    }
  })

  it('fetches without following redirects and reports failures without the link', async () => {
    const requests: RequestInit[] = []
    const answer = (response: Response) => async (_url: string, init: RequestInit) => {
      requests.push(init)
      return response
    }
    const url = 'https://studip.uni-hannover.de/dispatch.php/ical/index/Ab12Cd34'
    const ok = await fetchSourceCalendar(url, answer(new Response(SAMPLE)))
    expect(ok.ok && ok.events).toHaveLength(21)
    expect(requests[0]?.redirect).toBe('manual')
    expect(await fetchSourceCalendar(url, answer(new Response('', { status: 400 })))).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(
      await fetchSourceCalendar(
        url,
        answer(new Response(null, { status: 302, headers: { location: 'http://10.0.0.1/' } })),
      ),
    ).toEqual({ ok: false, error: 'rejected' })
    expect(await fetchSourceCalendar(url, answer(new Response('<html></html>')))).toEqual({
      ok: false,
      error: 'not_a_calendar',
    })
    expect(await fetchSourceCalendar(url, answer(new Response('x'.repeat(MAX_CALENDAR_BYTES + 1))))).toEqual({
      ok: false,
      error: 'too_large',
    })
    expect(
      await fetchSourceCalendar(url, async () => {
        throw new TypeError('fetch failed')
      }),
    ).toEqual({ ok: false, error: 'unreachable' })
  })
})

describe('secrets', () => {
  const secret = 'test-secret-that-is-long-enough-for-better-auth'

  it('encrypts calendar links so only the same secret reads them', () => {
    const url = 'https://studip.uni-hannover.de/dispatch.php/ical/index/Ab12Cd34'
    const sealed = encryptSourceUrl(secret, url)
    expect(sealed).not.toContain('Ab12Cd34')
    expect(decryptSourceUrl(secret, sealed)).toBe(url)
    expect(decryptSourceUrl('another-secret-that-is-long-enough-for-it', sealed)).toBeNull()
    expect(decryptSourceUrl(secret, `${sealed.slice(0, -2)}AA`)).toBeNull()
  })

  it('derives feed tokens that change with the version', () => {
    const id = '0b7d3c2e-8f43-4a8c-9d0e-6b1c2a3f4e5d'
    const token = feedToken(secret, id, 1)
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(isFeedToken(secret, id, 1, token)).toBe(true)
    expect(isFeedToken(secret, id, 2, token)).toBe(false)
    expect(isFeedToken(secret, '1b7d3c2e-8f43-4a8c-9d0e-6b1c2a3f4e5d', 1, token)).toBe(false)
  })
})

describe('changes', () => {
  const now = new Date('2026-10-14T00:00:00Z')
  const events = sampleEvents()
  const lecture = (index: number) => {
    const found = events.filter((event) => event.course === 'Vorlesung: Rechnernetze')[index]
    if (!found) throw new Error('no lecture')
    return found
  }

  it('reports cancelled, moved, room, new and removed dates still ahead', () => {
    const next = events
      .filter((event) => event.uid !== lecture(3).uid)
      .map((event) => {
        if (event.uid === lecture(1).uid) return { ...event, cancelled: true }
        if (event.uid === lecture(2).uid)
          return { ...event, start: '2026-10-28T14:00:00.000Z', end: '2026-10-28T15:30:00.000Z' }
        if (event.course === 'Vorlesung: Datenbanksysteme' && event.start > now.toISOString()) {
          return { ...event, location: 'Raum B302' }
        }
        return event
      })
    next.push({
      ...lecture(3),
      uid: 'new@example.org',
      start: '2026-11-10T14:00:00.000Z',
      end: '2026-11-10T15:30:00.000Z',
    })
    // Past dates stay quiet: the first lecture (13 October) is renamed but already over.
    next[next.findIndex((event) => event.uid === lecture(0).uid)] = { ...lecture(0), location: 'Anderswo' }

    const changes = diffEvents(events, next, settings(), now)
    expect(changes.map((change) => [change.kind, change.course, change.start])).toEqual(
      expect.arrayContaining([
        ['cancelled', 'Vorlesung: Rechnernetze', lecture(1).start],
        ['moved', 'Vorlesung: Rechnernetze', '2026-10-28T14:00:00.000Z'],
        ['added', 'Vorlesung: Rechnernetze', '2026-11-10T14:00:00.000Z'],
        ['removed', 'Vorlesung: Rechnernetze', lecture(3).start],
      ]),
    )
    expect(changes.filter((change) => change.kind === 'room')).toHaveLength(4)
    expect(changes).toHaveLength(8)
    expect(changes.find((change) => change.kind === 'moved')?.previousStart).toBe(lecture(2).start)
  })

  it('ignores courses the student left out', () => {
    const next = events.map((event) => (event.uid === lecture(1).uid ? { ...event, cancelled: true } : event))
    expect(diffEvents(events, next, settings({ excludedSubjects: ['Rechnernetze'] }), now)).toEqual([])
  })

  it('groups many new dates of one course into one alert row', () => {
    const added = events
      .filter((event) => event.course === 'Vorlesung: Datenbanksysteme')
      .map((event) => ({ ...event, uid: `${event.uid}-new` }))
    const changes = diffEvents([], added, settings(), new Date('2026-10-01T00:00:00Z'))
    expect(changes).toHaveLength(4)
    expect(alertItems(changes, added, settings(), 'de')).toEqual([
      { kind: 'added', title: 'Datenbanksysteme · Vorlesung', start: added[0]?.start, count: 4 },
    ])
  })
})
