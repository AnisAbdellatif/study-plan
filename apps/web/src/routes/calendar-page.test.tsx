import {
  type CalendarEvent,
  type CalendarFeedView,
  type CalendarOverview,
  type CalendarSelection,
  type CalendarSourceView,
  calendarDisplaySchema,
  calendarSelectionSchema,
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

const MAIN = [
  event('a1', 'Vorlesung: Rechnernetze', '2026-10-13T13:00:00.000Z'),
  event('a2', 'Vorlesung: Rechnernetze', '2026-10-20T13:00:00.000Z', { cancelled: true }),
  event('b1', 'Übung: Übung Rechnernetze', '2026-10-15T13:00:00.000Z', { slot: '4|15:00|16:30' }),
  event('c1', 'Vorlesung: Datenbanksysteme', '2026-10-14T13:00:00.000Z', { slot: '3|15:00|16:30' }),
]
const MINOR = [
  event('m1', 'Vorlesung: Compilerbau', '2026-11-12T09:00:00.000Z', { slot: '4|10:00|11:30' }),
  event('m2', 'Vorlesung: Logik', '2026-11-13T09:00:00.000Z', { slot: '5|10:00|11:30' }),
]

const selection = (input: Partial<CalendarSelection> = {}) => calendarSelectionSchema.parse(input)

const sourceView = (
  id: string,
  label: string | null,
  events: CalendarEvent[] = MAIN,
  chosen: CalendarSelection = selection(),
): CalendarSourceView => ({
  id,
  host: 'studip.uni-hannover.de',
  label,
  status: 'ok',
  error: null,
  lastFetchedAt: '2026-10-13T05:00:00.000Z',
  lastSuccessAt: '2026-10-13T05:00:00.000Z',
  createdAt: '2026-10-13T05:00:00.000Z',
  events,
  selection: chosen,
})

const feedView = (id: string, name: string, sources: string[]): CalendarFeedView => ({
  id,
  name,
  sources,
  subjects: null,
  url: `https://study-plan.de/calendar/${id}/AAAAAAAAAAAAAAAAAAAAAA.ics`,
  createdAt: '2026-10-13T05:00:00.000Z',
})

const connected = (
  sources: CalendarSourceView[] = [sourceView('s1', null)],
  feeds: CalendarFeedView[] = sources.map((source, index) =>
    feedView(`f${index + 1}`, source.label ?? 'Stundenplan', [source.id]),
  ),
): CalendarOverview => ({
  sources,
  display: calendarDisplaySchema.parse({}),
  changes: [
    {
      kind: 'cancelled',
      sourceId: 's1',
      uid: 'a2',
      subject: 'Rechnernetze',
      course: 'Vorlesung: Rechnernetze',
      start: '2026-10-20T13:00:00.000Z',
      end: '2026-10-20T14:30:00.000Z',
      detectedAt: '2026-10-13T05:00:00.000Z',
    },
  ],
  feeds,
  allowedHosts: ['studip.uni-hannover.de'],
  refreshMinutes: 60,
  maxSources: 4,
})

const EMPTY: CalendarOverview = {
  sources: [],
  display: null,
  changes: [],
  feeds: [],
  allowedHosts: ['studip.uni-hannover.de'],
  refreshMinutes: 60,
  maxSources: 4,
}

const TWO_LINKS = () =>
  connected([
    sourceView('s1', null, MAIN, selection({ subjects: { Rechnernetze: { color: 'royalblue' } } })),
    sourceView('s2', 'Zweitfach', MINOR, selection({ subjects: { Compilerbau: { color: 'tomato' } } })),
  ])

function mockApi(initial: CalendarOverview) {
  const savedSelections: { source: string; selection: CalendarSelection }[] = []
  const createdFeeds: { name: string; sources: string[]; subjects: string[] | null }[] = []
  let current = initial
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = () => JSON.parse(String(init?.body))
    if (url === '/api/calendar' && method === 'GET') return respond(current)
    if (url === '/api/calendar/sources' && method === 'POST') {
      const { url: link, label } = body() as { url: string; label?: string }
      if (!link.startsWith('https://studip.uni-hannover.de/'))
        return respond({ error: 'host_not_allowed' }, 400)
      if (link.endsWith('/kaputt')) return respond({ error: 'fetch_failed', reason: 'not_found' }, 422)
      if (link.endsWith('/doppelt')) return respond({ error: 'duplicate' }, 409)
      const id = `s${current.sources.length + 1}`
      const events = current.sources.length === 0 ? MAIN : MINOR
      current = connected(
        [...current.sources, sourceView(id, label ?? null, events)],
        [...current.feeds, feedView(`f${current.feeds.length + 1}`, label ?? 'Stundenplan', [id])],
      )
      return respond(current, 201)
    }
    const selectionPath = /^\/api\/calendar\/sources\/([^/]+)\/selection$/.exec(url)
    if (selectionPath && method === 'PUT') {
      savedSelections.push({ source: selectionPath[1] ?? '', selection: body() })
      return respond(body())
    }
    if (url === '/api/calendar/display' && method === 'PUT') return respond(body())
    if (url === '/api/calendar/feeds' && method === 'POST') {
      const created = body() as { name: string; sources: string[]; subjects: string[] | null }
      createdFeeds.push(created)
      return respond(
        {
          ...feedView(`f${current.feeds.length + 1}`, created.name, created.sources),
          subjects: created.subjects,
        },
        201,
      )
    }
    return respond({ error: 'not_found' }, 404)
  })
  return { savedSelections, createdFeeds }
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
  it('connects a Stud.IP link and shows its feed and subjects, without tabs for one link', async () => {
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

    expect(await screen.findByRole('heading', { name: 'Deine Stud.IP-Links (1/4)' })).toBeInTheDocument()
    expect(screen.getByLabelText('Abo-Link für Stundenplan')).toHaveValue(
      'https://study-plan.de/calendar/f1/AAAAAAAAAAAAAAAAAAAAAA.ics',
    )
    expect(screen.getByRole('link', { name: 'Abonnieren' })).toHaveAttribute(
      'href',
      'webcal://study-plan.de/calendar/f1/AAAAAAAAAAAAAAAAAAAAAA.ics',
    )
    expect(screen.getByText('Alle Fächer · 4 Termine')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByText('2 von 2 Fächern ausgewählt · 4 Termine')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Rechnernetze in den Kalendern' })).toBeChecked()
    expect(screen.getByText('So heißt ein Termin: Rechnernetze · Vorlesung')).toBeInTheDocument()
  })

  it('saves a link’s choices shortly after they change and updates titles and counts at once', async () => {
    const { savedSelections } = mockApi(connected())
    const user = renderCalendar()
    await user.click(await screen.findByRole('checkbox', { name: 'Datenbanksysteme in den Kalendern' }))
    expect(screen.getByText('Alle Fächer · 3 Termine')).toBeInTheDocument()

    const [shortName] = screen.getAllByLabelText('Kurzer Name')
    if (!shortName) throw new Error('no short name field')
    await user.type(shortName, 'RN')
    expect(screen.getByText('So heißt ein Termin: RN · Vorlesung')).toBeInTheDocument()

    await waitFor(
      () => expect(savedSelections.at(-1)?.selection.subjects.Rechnernetze?.shortName).toBe('RN'),
      { timeout: 2000 },
    )
    expect(savedSelections.at(-1)).toMatchObject({
      source: 's1',
      selection: { excludedSubjects: ['Datenbanksysteme'] },
    })
    expect(await screen.findByText('Gespeichert')).toBeInTheDocument()
  })

  it('adds a second link with a name and its own calendar', async () => {
    mockApi(connected())
    const user = renderCalendar()
    await user.click(await screen.findByRole('button', { name: 'Link hinzufügen' }))
    const input = screen.getByLabelText('Link zu deinem Stud.IP-Kalender')
    await user.type(input, 'https://studip.uni-hannover.de/dispatch.php/ical/index/doppelt')
    await user.click(screen.getByRole('button', { name: 'Verbinden' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Diesen Link hast du schon hinzugefügt.')

    await user.clear(input)
    await user.type(input, 'https://studip.uni-hannover.de/dispatch.php/ical/index/Zw34Xy56')
    await user.type(screen.getByLabelText('Name (optional)'), 'Zweitfach')
    await user.click(screen.getByRole('button', { name: 'Verbinden' }))
    expect(await screen.findByRole('heading', { name: 'Deine Stud.IP-Links (2/4)' })).toBeInTheDocument()
    expect(screen.getByLabelText('Abo-Link für Zweitfach')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Zweitfach/ })).toBeInTheDocument()
  })

  it('manages each link’s subjects in its own tab', async () => {
    const { savedSelections } = mockApi(TWO_LINKS())
    const user = renderCalendar()
    const tabs = await screen.findByRole('tablist', { name: 'Stud.IP-Links' })
    const [first, second] = within(tabs).getAllByRole('tab')
    if (!first || !second) throw new Error('no tabs')
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(first).toHaveTextContent('Link 12/2')
    expect(second).toHaveTextContent('Zweitfach2/2')
    expect(screen.getByRole('checkbox', { name: 'Rechnernetze in den Kalendern' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Compilerbau in den Kalendern' })).not.toBeInTheDocument()

    await user.click(second)
    expect(second).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('checkbox', { name: 'Rechnernetze in den Kalendern' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Logik in den Kalendern' }))
    expect(second).toHaveTextContent('Zweitfach1/2')
    expect(first).toHaveTextContent('Link 12/2')
    await waitFor(() => expect(savedSelections.at(-1)?.source).toBe('s2'), { timeout: 2000 })
    expect(savedSelections.at(-1)?.selection.excludedSubjects).toEqual(['Logik'])
    expect(savedSelections.some((saved) => saved.source === 's1')).toBe(false)

    // Arrow keys move between tabs.
    second.focus()
    await user.keyboard('{ArrowLeft}')
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(first).toHaveFocus()
  })

  it('makes calendars that mix links', async () => {
    const { createdFeeds } = mockApi(TWO_LINKS())
    const user = renderCalendar()
    // Each link has a calendar of its own.
    expect(await screen.findByLabelText('Abo-Link für Zweitfach')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Alle Links in einem Kalender' }))
    await waitFor(() =>
      expect(createdFeeds).toEqual([{ name: 'Alle Links', sources: ['s1', 's2'], subjects: null }]),
    )
    expect(await screen.findByText('Alle Fächer · 6 Termine')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Alle Links in einem Kalender' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Kalender hinzufügen' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Name'), 'Nur Compilerbau')
    await user.click(within(dialog).getByRole('checkbox', { name: /Link 1/ }))
    await user.click(within(dialog).getByRole('radio', { name: 'Nur diese Fächer:' }))
    expect(within(dialog).queryByRole('checkbox', { name: /Rechnernetze/ })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('checkbox', { name: /Compilerbau/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))
    await waitFor(() =>
      expect(createdFeeds.at(-1)).toEqual({
        name: 'Nur Compilerbau',
        sources: ['s2'],
        subjects: ['Compilerbau'],
      }),
    )
  })

  it('offers no further link at the limit', async () => {
    mockApi(connected(['s1', 's2', 's3', 's4'].map((id) => sourceView(id, null))))
    renderCalendar()
    expect(await screen.findByText('Mehr als 4 Links gehen nicht.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Link hinzufügen' })).not.toBeInTheDocument()
  })

  it('lists recent changes', async () => {
    mockApi(connected())
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
