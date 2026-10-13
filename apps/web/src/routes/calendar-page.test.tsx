import {
  type CalendarEvent,
  type CalendarOverview,
  type CalendarSettings,
  calendarSettingsSchema,
} from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'

vi.mock('../components/account-sync.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/account-sync.tsx')>()),
  useAccountSync: () => ({
    user: { id: 'u1', email: 'studi@example.org', role: 'user' },
    state: { kind: 'no_account_plan' },
    sessionPending: false,
    sync: { stop: vi.fn(), uploadLocal: vi.fn(), retry: vi.fn(), linkedPlanId: vi.fn(() => null) },
  }),
}))

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const event = (
  uid: string,
  course: string,
  start: string,
  extra: Partial<CalendarEvent> = {},
): CalendarEvent => {
  const [kind = '', name = course] = course.split(': ')
  return {
    uid,
    course,
    kind,
    name,
    subject: name.replace(/^Übung:? /, ''),
    slot: '2|15:00|16:30',
    start,
    end: start.replace('T13:', 'T14:'),
    location: 'Raum 023',
    description: '',
    cancelled: false,
    ...extra,
  }
}

const EVENTS = [
  event('a1', 'Vorlesung: Rechnernetze', '2026-10-13T13:00:00.000Z'),
  event('a2', 'Vorlesung: Rechnernetze', '2026-10-20T13:00:00.000Z', { cancelled: true }),
  event('b1', 'Übung: Übung Rechnernetze', '2026-10-15T13:00:00.000Z', { slot: '4|15:00|16:30' }),
  event('c1', 'Vorlesung: Datenbanksysteme', '2026-10-14T13:00:00.000Z', { slot: '3|15:00|16:30' }),
]

const connected = (settings: CalendarSettings): CalendarOverview => ({
  source: {
    host: 'studip.uni-hannover.de',
    status: 'ok',
    error: null,
    lastFetchedAt: '2026-10-13T05:00:00.000Z',
    lastSuccessAt: '2026-10-13T05:00:00.000Z',
    settings,
    events: EVENTS,
    changes: [
      {
        kind: 'cancelled',
        uid: 'a2',
        subject: 'Rechnernetze',
        course: 'Vorlesung: Rechnernetze',
        start: '2026-10-20T13:00:00.000Z',
        end: '2026-10-20T14:30:00.000Z',
        detectedAt: '2026-10-13T05:00:00.000Z',
      },
    ],
  },
  feeds: [
    {
      id: 'f1',
      name: 'Stundenplan',
      subjects: null,
      url: 'https://study-plan.de/calendar/f1/AAAAAAAAAAAAAAAAAAAAAA.ics',
      createdAt: '2026-10-13T05:00:00.000Z',
    },
  ],
  allowedHosts: ['studip.uni-hannover.de'],
  refreshMinutes: 60,
})

const EMPTY: CalendarOverview = {
  source: null,
  feeds: [],
  allowedHosts: ['studip.uni-hannover.de'],
  refreshMinutes: 60,
}

function mockApi(initial: CalendarOverview) {
  const saved: CalendarSettings[] = []
  const settings = calendarSettingsSchema.parse({
    subjects: { Rechnernetze: { color: 'royalblue' }, Datenbanksysteme: { color: 'tomato' } },
  })
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url === '/api/calendar' && method === 'GET') return respond(initial)
    if (url === '/api/calendar/source' && method === 'PUT') {
      const { url: link } = JSON.parse(String(init?.body)) as { url: string }
      if (!link.startsWith('https://studip.uni-hannover.de/'))
        return respond({ error: 'host_not_allowed' }, 400)
      if (link.endsWith('/kaputt')) return respond({ error: 'fetch_failed', reason: 'not_found' }, 422)
      return respond(connected(settings))
    }
    if (url === '/api/calendar/settings' && method === 'PUT') {
      const body = JSON.parse(String(init?.body)) as CalendarSettings
      saved.push(body)
      return respond(body)
    }
    return respond({ error: 'not_found' }, 404)
  })
  return { saved, settings }
}

function renderCalendar() {
  render(
    <GuestStoreContext.Provider value={createGuestStore(window.localStorage)}>
      <RouterProvider router={createAppRouter(createMemoryHistory({ initialEntries: ['/calendar'] }))} />
    </GuestStoreContext.Provider>,
  )
  return userEvent.setup()
}

beforeEach(async () => {
  window.localStorage.clear()
  await i18n.changeLanguage('de')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('calendar page', () => {
  it('connects a Stud.IP link and shows the feed and the subjects', async () => {
    mockApi(EMPTY)
    const user = renderCalendar()
    expect(await screen.findByRole('heading', { level: 1, name: 'Stundenplan-Kalender' })).toBeInTheDocument()

    const input = await screen.findByLabelText('Link zu deinem Stud.IP-Kalender')
    await user.type(input, 'https://evil.example/dispatch.php/ical/index/Ab12')
    await user.click(screen.getByRole('button', { name: 'Verbinden' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Möglich ist: studip.uni-hannover.de')

    await user.clear(input)
    await user.type(input, 'https://studip.uni-hannover.de/dispatch.php/ical/index/kaputt')
    await user.click(screen.getByRole('button', { name: 'Verbinden' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Der Link gilt nicht mehr.')

    await user.clear(input)
    await user.type(input, 'https://studip.uni-hannover.de/dispatch.php/ical/index/Ab12Cd34')
    await user.click(screen.getByRole('button', { name: 'Verbinden' }))

    expect(await screen.findByText('Verbunden mit studip.uni-hannover.de')).toBeInTheDocument()
    expect(screen.getByLabelText('Abo-Link für Stundenplan')).toHaveValue(
      'https://study-plan.de/calendar/f1/AAAAAAAAAAAAAAAAAAAAAA.ics',
    )
    expect(screen.getByRole('link', { name: 'Abonnieren' })).toHaveAttribute(
      'href',
      'webcal://study-plan.de/calendar/f1/AAAAAAAAAAAAAAAAAAAAAA.ics',
    )
    expect(screen.getByText('Alle Fächer · 4 Termine')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Rechnernetze in den Kalendern' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Datenbanksysteme in den Kalendern' })).toBeChecked()
    expect(screen.getByText('So heißt ein Termin: Rechnernetze · Vorlesung')).toBeInTheDocument()
  })

  it('saves choices shortly after they change and updates titles and counts at once', async () => {
    const { saved } = mockApi(connected(calendarSettingsSchema.parse({})))
    const user = renderCalendar()
    const subject = await screen.findByRole('checkbox', { name: 'Datenbanksysteme in den Kalendern' })
    await user.click(subject)
    expect(screen.getByText('Alle Fächer · 3 Termine')).toBeInTheDocument()

    const [shortName] = screen.getAllByLabelText('Kurzer Name')
    if (!shortName) throw new Error('no short name field')
    await user.type(shortName, 'RN')
    expect(screen.getByText('So heißt ein Termin: RN · Vorlesung')).toBeInTheDocument()

    await waitFor(() => expect(saved.at(-1)?.subjects.Rechnernetze?.shortName).toBe('RN'), { timeout: 2000 })
    expect(saved.at(-1)?.excludedSubjects).toEqual(['Datenbanksysteme'])
    expect(await screen.findByText('Gespeichert')).toBeInTheDocument()
  })

  it('lists recent changes', async () => {
    mockApi(connected(calendarSettingsSchema.parse({})))
    renderCalendar()
    const heading = await screen.findByRole('heading', { name: 'Letzte Änderungen' })
    const list = heading.parentElement?.querySelector('ul')
    if (!list) throw new Error('no change list')
    expect(within(list).getByText('Entfällt')).toBeInTheDocument()
    expect(within(list).getByText('Vorlesung: Rechnernetze')).toBeInTheDocument()
  })

  it('is available in English', async () => {
    await i18n.changeLanguage('en')
    mockApi(EMPTY)
    renderCalendar()
    expect(await screen.findByRole('heading', { level: 1, name: 'Timetable calendar' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Link to your Stud.IP calendar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument()
  })
})
