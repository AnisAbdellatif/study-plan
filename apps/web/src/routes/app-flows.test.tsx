import {
  addDays,
  createGuestDocument,
  createPlanFromPreset,
  localIsoDate,
  type Plan,
  setExamDate,
  setModuleResult,
  toSharedPlan,
} from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, EXPORT_KEY, GuestStoreContext, STORAGE_KEY } from '../store/guest-store.ts'
import { examplePreset2027, luhPreset, examplePreset as preset } from '../test/fixtures.ts'

const makePlan = (): Plan =>
  createPlanFromPreset(preset, {
    id: 'plan-test',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })

function renderApp({ path = '/', plan }: { path?: string; plan?: Plan } = {}) {
  const store = createGuestStore(window.localStorage)
  if (plan) store.replacePlan(plan)
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={router} />
    </GuestStoreContext.Provider>,
  )
  return { store, router, user: userEvent.setup() }
}

const column = (name: RegExp) => screen.getByRole('region', { name })

async function openCardMenu(user: ReturnType<typeof userEvent.setup>, moduleName: string) {
  await user.click(await screen.findByRole('button', { name: `Aktionen für ${moduleName}` }))
}

describe('onboarding', () => {
  it('shows visitors without a plan the landing page and creates a plan from the example', async () => {
    const { user, store, router } = renderApp()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Dein Studium, klar geplant.' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')

    await user.click(screen.getByRole('link', { name: 'Loslegen' }))
    expect(await screen.findByRole('heading', { name: 'Studienplan anlegen' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/start')

    await user.click(screen.getByRole('button', { name: 'Mit Beispiel ausprobieren' }))

    expect(await screen.findByRole('heading', { name: '1. Semester' })).toBeInTheDocument()
    const plan = store.getState().plan
    expect(plan?.preset.id).toBe('example/informatik-bsc-example')
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"format":"study-plan.guest"')
    expect(within(column(/^1\. Semester/)).getByText('Grundlagen der Programmierung')).toBeInTheDocument()
  })

  it('asks before the example replaces an existing plan', async () => {
    const { user, store } = renderApp({ path: '/start', plan: makePlan() })
    expect(await screen.findByRole('link', { name: 'Zurück zu deinem Plan' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mit Beispiel ausprobieren' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Bestehenden Plan ersetzen?' })
    expect(store.getState().plan?.id).toBe('plan-test')

    await user.click(within(dialog).getByRole('button', { name: 'Ersetzen' }))
    await waitFor(() => expect(store.getState().plan?.id).not.toBe('plan-test'))
    expect(await screen.findByRole('heading', { name: '1. Semester' })).toBeInTheDocument()
  })
})

describe('board', () => {
  it('moves a module with the card menu and announces it', async () => {
    const { user, store } = renderApp({ plan: makePlan() })
    await openCardMenu(user, 'Grundlagen der Programmierung')

    expect(await screen.findByRole('menuitem', { name: /^1\. Semester/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await user.click(screen.getByRole('menuitem', { name: /^3\. Semester/ }))

    await waitFor(() =>
      expect(within(column(/^3\. Semester/)).getByText('Grundlagen der Programmierung')).toBeInTheDocument(),
    )
    expect(
      within(column(/^1\. Semester/)).queryByText('Grundlagen der Programmierung'),
    ).not.toBeInTheDocument()
    expect(store.getState().plan?.semesters[2]?.moduleCodes).toContain('INF-101')
    expect(
      await screen.findByText('Grundlagen der Programmierung nach 3. Semester verschoben'),
    ).toBeInTheDocument()
  })

  it('moves a module to the backlog', async () => {
    const { user, store } = renderApp({ plan: makePlan() })
    await openCardMenu(user, 'Bachelorarbeit')
    await user.click(await screen.findByRole('menuitem', { name: 'Nicht eingeplant' }))
    await waitFor(() => expect(store.getState().plan?.backlog).toEqual(['BA-601']))
    expect(within(column(/^Nicht eingeplant/)).getByText('Bachelorarbeit')).toBeInTheDocument()
  })

  it('enters a grade and updates the running average', async () => {
    const { user } = renderApp({ plan: makePlan() })
    expect(await screen.findByTestId('overall-grade')).toHaveTextContent('–')

    await openCardMenu(user, 'Grundlagen der Programmierung')
    await user.click(await screen.findByRole('menuitem', { name: 'Note eintragen…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Grundlagen der Programmierung' })
    await user.selectOptions(within(dialog).getByLabelText('Note'), '1,3')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(screen.getByTestId('overall-grade')).toHaveTextContent('1,3'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('records a pass/fail module without changing the average', async () => {
    const { user, store } = renderApp({ plan: makePlan() })
    await openCardMenu(user, 'Schlüsselqualifikation: Wissenschaftliches Arbeiten')
    await user.click(await screen.findByRole('menuitem', { name: 'Ergebnis eintragen…' }))
    const dialog = await screen.findByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('Ergebnis'), 'Bestanden')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() =>
      expect(store.getState().plan?.modules.find((m) => m.code === 'SQ-101')?.attempts).toHaveLength(1),
    )
    expect(screen.getByTestId('overall-grade')).toHaveTextContent('–')
    expect(screen.getByText('bestanden')).toBeInTheDocument()
  })

  it('starts over after confirmation', async () => {
    const { user, store } = renderApp({ plan: makePlan() })
    await user.click(await screen.findByRole('button', { name: 'Weitere Aktionen' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Neu beginnen…' }))
    await user.click(await screen.findByRole('button', { name: 'Plan löschen' }))

    expect(await screen.findByRole('heading', { name: 'Studienplan anlegen' })).toBeInTheDocument()
    expect(store.getState().plan).toBeNull()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('export and import', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:plan')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('exports the plan as a JSON download and remembers when', async () => {
    const { user, store } = renderApp({ plan: makePlan() })
    await user.click(await screen.findByRole('button', { name: 'Exportieren' }))

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled()
    expect(store.getState().lastExportedAt).not.toBeNull()
    expect(window.localStorage.getItem(EXPORT_KEY)).not.toBeNull()
  })

  it('imports an exported plan from the start page', async () => {
    const { user, store } = renderApp({ path: '/start' })
    const plan = makePlan()
    const file = new File([JSON.stringify(createGuestDocument(plan))], 'plan.json', {
      type: 'application/json',
    })

    await user.upload(await screen.findByLabelText('Plan-Datei auswählen'), file)

    expect(await screen.findByRole('heading', { name: '1. Semester' })).toBeInTheDocument()
    expect(store.getState().plan).toEqual(plan)
  })

  it('explains why a file cannot be imported', async () => {
    const { user, store } = renderApp({ path: '/start' })
    const file = new File(['{"hello":"world"}'], 'notes.json', { type: 'application/json' })

    await user.upload(await screen.findByLabelText('Plan-Datei auswählen'), file)

    const dialog = await screen.findByRole('dialog', { name: 'Import fehlgeschlagen' })
    expect(dialog).toHaveTextContent('Diese Datei ist kein Export dieses Studienplaners.')
    expect(store.getState().plan).toBeNull()
  })

  it('asks before an import replaces an existing plan', async () => {
    const { user, store } = renderApp({ plan: makePlan() })
    const other = { ...makePlan(), id: 'other', name: 'Zweiter Plan' }
    const file = new File([JSON.stringify(createGuestDocument(other))], 'other.json', {
      type: 'application/json',
    })

    await user.upload(await screen.findByLabelText('Plan-Datei auswählen'), file)
    expect(await screen.findByRole('alertdialog', { name: 'Aktuellen Plan ersetzen?' })).toBeInTheDocument()
    expect(store.getState().plan?.id).toBe('plan-test')

    await user.click(screen.getByRole('button', { name: 'Ersetzen' }))
    await waitFor(() => expect(store.getState().plan?.id).toBe('other'))
    expect(await screen.findByRole('heading', { name: 'Zweiter Plan' })).toBeInTheDocument()
  })
})

describe('presets with made-up module codes', () => {
  it('hides the codes on cards and in the grade dialog, and groups composite grades', async () => {
    const plan = createPlanFromPreset(luhPreset, {
      id: 'luh',
      startTerm: { season: 'winter', year: 2026 },
      now: new Date('2026-09-13T10:00:00Z'),
    })
    const { user } = renderApp({ plan })

    await openCardMenu(user, 'Grundlagen digitaler Systeme')
    await user.click(await screen.findByRole('menuitem', { name: 'Note eintragen…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Grundlagen digitaler Systeme' })

    expect(dialog).not.toHaveTextContent('GI-GDS')
    expect(screen.queryByText(/GI-GDS/)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('group', { name: 'Notenstufen' })).toBeInTheDocument()
    expect(within(dialog).getByRole('group', { name: 'Zusammengesetzte Modulnoten' })).toBeInTheDocument()
  })
})

describe('plan validation on the board', () => {
  it('warns on the card and in the hints panel when a module is planned in the wrong term or too early', async () => {
    const { user } = renderApp({ plan: makePlan() })
    // The fictional example preset plans IT-Sicherheit (summer only) in semester 5, a winter term
    expect(await screen.findByText('1 Warnung')).toBeInTheDocument()

    await openCardMenu(user, 'Grundlagen der Programmierung')
    await user.click(await screen.findByRole('menuitem', { name: /^2\. Semester/ }))

    const secondSemester = await screen.findByRole('region', { name: /^2\. Semester/ })
    expect(await within(secondSemester).findByText('Nur im Wintersemester angeboten')).toBeInTheDocument()
    expect(
      within(secondSemester).getByText('Voraussetzung fehlt: Grundlagen der Programmierung'),
    ).toBeInTheDocument()

    const hints = screen.getByRole('region', { name: 'Hinweise zum Plan' })
    expect(within(hints).getByText('3 Warnungen')).toBeInTheDocument()
    expect(
      within(hints).getByText(
        'Grundlagen der Programmierung wird nur im Wintersemester angeboten, ist aber im SS 2027 geplant.',
      ),
    ).toBeInTheDocument()
  })
})

describe('what-if analysis', () => {
  it('tells how good the open modules need to be for a target grade and remembers the target', async () => {
    const plan = setModuleResult(makePlan(), 'INF-101', { kind: 'graded', grade: 1.0 })
    const { user, store } = renderApp({ plan })
    const card = await screen.findByRole('region', { name: 'Was wäre, wenn' })

    await user.selectOptions(within(card).getByLabelText('Zielschnitt'), '2,0')

    // Worked out by hand for the example rules: 2.0 everywhere gives 1.8, 2.3 everywhere gives 2.1.
    expect(within(card).getByTestId('what-if-result')).toHaveTextContent(
      'Für 2,0 brauchst du in den offenen Modulen im Schnitt 2,0 oder besser.',
    )
    expect(within(card).getByText(/Mit 1,0 überall: 1,0, mit 4,0 überall: 3,6\./)).toBeInTheDocument()
    await waitFor(() => expect(store.getState().plan?.targetGrade).toBe(2))
  })
})

describe('exam dates and deadlines', () => {
  beforeEach(() => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:calendar')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('lists the exam and its withdrawal deadline, and exports them as a calendar', async () => {
    const examDate = addDays(localIsoDate(new Date()), 20)
    const { user, store } = renderApp({ plan: makePlan() })
    const deadlines = await screen.findByRole('region', { name: 'Nächste Termine' })
    expect(within(deadlines).getByRole('button', { name: /Kalender/ })).toBeDisabled()

    await openCardMenu(user, 'Grundlagen der Programmierung')
    await user.click(await screen.findByRole('menuitem', { name: 'Note eintragen…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Grundlagen der Programmierung' })
    fireEvent.change(within(dialog).getByLabelText(/Prüfungstermin/), { target: { value: examDate } })
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() =>
      expect(store.getState().plan?.modules.find((m) => m.code === 'INF-101')?.examDate).toBe(examDate),
    )
    expect(within(deadlines).getByText('Prüfung')).toBeInTheDocument()
    expect(within(deadlines).getByText('Abmeldeschluss')).toBeInTheDocument()
    expect(within(deadlines).getByText('in 20 Tagen')).toBeInTheDocument()
    expect(within(deadlines).getByText('in 13 Tagen')).toBeInTheDocument()

    await user.click(within(deadlines).getByRole('button', { name: /Kalender/ }))
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0]
    if (!(blob instanceof Blob)) throw new Error('expected a Blob download')
    expect(blob.type).toBe('text/calendar')
    const content = await blob.text()
    expect(content).toContain('SUMMARY:Prüfung: Grundlagen der Programmierung')
    expect(content).toContain(`DTSTART;VALUE=DATE:${examDate.replaceAll('-', '')}`)
  })
})

describe('grade import', () => {
  it('imports grades from pasted text after a preview, with a module picked by hand', async () => {
    const { user, store } = renderApp({ plan: makePlan() })
    await user.click(await screen.findByRole('button', { name: 'Weitere Aktionen' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Noten importieren…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Noten importieren' })

    fireEvent.change(within(dialog).getByLabelText('Text aus dem Notenspiegel'), {
      target: { value: 'Modul\tNote\nGrundlagen der Programmierung\t1,3\nAnalysis I\t2,0\nLinA 1\t1,7' },
    })
    expect(within(dialog).getByRole('button', { name: '2 Ergebnisse übernehmen' })).toBeEnabled()
    expect(within(dialog).getByText('Bitte Modul wählen')).toBeInTheDocument()
    expect(within(dialog).getByText(/1 Zeile ohne Note übersprungen/)).toBeInTheDocument()

    await user.selectOptions(within(dialog).getByLabelText('Modul für Zeile 4'), 'Lineare Algebra I')
    await user.click(within(dialog).getByRole('button', { name: '3 Ergebnisse übernehmen' }))

    const result = (code: string) =>
      store.getState().plan?.modules.find((m) => m.code === code)?.attempts[0]?.grade
    await waitFor(() => expect(result('INF-101')).toBe(1.3))
    expect(result('MAT-102')).toBe(2.0)
    expect(result('MAT-101')).toBe(1.7)
    // Grundlagen group: (1.3 * 8 + 1.7 * 9 + 2.0 * 9) / 26 = 1.68, truncated
    expect(screen.getByTestId('overall-grade')).toHaveTextContent('1,6')
  })
})

describe('shared plans', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the structure without results and copies it into the browser', async () => {
    let privatePlan = setModuleResult(makePlan(), 'INF-101', { kind: 'graded', grade: 1.3 })
    privatePlan = setExamDate(privatePlan, 'INF-102', '2027-07-20')
    const response = {
      name: 'Plan von Kim',
      updatedAt: '2026-09-12T10:00:00.000Z',
      sharedAt: '2026-09-12T10:00:00.000Z',
      plan: toSharedPlan({ ...privatePlan, name: 'Plan von Kim' }),
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const { user, store } = renderApp({ path: '/shared/AAAAAAAAAAAAAAAAAAAAAAAA' })
    expect(await screen.findByRole('heading', { name: 'Plan von Kim' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/share/AAAAAAAAAAAAAAAAAAAAAAAA', expect.anything())
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex')
    expect(screen.getByRole('region', { name: '1. Semester' })).toHaveTextContent(
      'Grundlagen der Programmierung',
    )
    expect(screen.queryByText('1,3')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Als eigenen Plan übernehmen' }))
    expect(await screen.findByRole('region', { name: /^1\. Semester/ })).toBeInTheDocument()
    const adopted = store.getState().plan
    expect(adopted?.name).toBe('Plan von Kim')
    expect(adopted?.id).not.toBe('shared')
    expect(adopted?.modules.every((module) => module.attempts.length === 0)).toBe(true)
  })

  it('explains a deactivated link', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    )
    renderApp({ path: '/shared/AAAAAAAAAAAAAAAAAAAAAAAA' })
    expect(await screen.findByText(/wurde deaktiviert oder existiert nicht/)).toBeInTheDocument()
  })
})

describe('board menu actions', () => {
  afterEach(() => vi.restoreAllMocks())

  it('explains that sharing needs an account when signed out', async () => {
    const { user } = renderApp({ plan: makePlan() })
    await user.click(await screen.findByRole('button', { name: 'Weitere Aktionen' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Plan teilen…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Plan teilen' })
    expect(dialog).toHaveTextContent('Zum Teilen brauchst du ein Konto')
  })

  it('opens the print dialog', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const { user } = renderApp({ plan: makePlan() })
    await user.click(await screen.findByRole('button', { name: 'Weitere Aktionen' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Drucken oder als PDF speichern' }))
    expect(print).toHaveBeenCalledOnce()
  })
})

describe('milestone 6', () => {
  const preset2027 = examplePreset2027
  const luh = luhPreset
  const planFrom = (source: typeof preset2027) =>
    createPlanFromPreset(source, {
      id: 'plan-test',
      startTerm: { season: 'winter', year: 2026 },
      now: new Date('2026-09-13T10:00:00Z'),
    })

  it('records several attempts and warns before the last one', async () => {
    const { user, store } = renderApp({ plan: planFrom(preset2027) })
    await openCardMenu(user, 'Grundlagen der Programmierung')
    await user.click(await screen.findByRole('menuitem', { name: 'Note eintragen…' }))
    let dialog = await screen.findByRole('dialog')
    await user.selectOptions(within(dialog).getByLabelText('Note'), 'grade:5')
    await user.click(within(dialog).getByRole('button', { name: 'Weiteren Versuch eintragen' }))
    await user.selectOptions(within(dialog).getByLabelText('Note im 2. Versuch'), 'grade:5')
    expect(within(dialog).getByTestId('attempt-summary')).toHaveTextContent(
      '2 von 3 Versuchen verbraucht. Der nächste Versuch ist der letzte.',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() =>
      expect(store.getState().plan?.modules.find((m) => m.code === 'INF-101')?.attempts).toHaveLength(2),
    )
    const firstSemester = column(/^1\. Semester/)
    expect(within(firstSemester).getByText('Letzter Versuch')).toBeInTheDocument()
    expect(within(firstSemester).getByText('2. Versuch')).toBeInTheDocument()

    await openCardMenu(user, 'Grundlagen der Programmierung')
    await user.click(await screen.findByRole('menuitem', { name: 'Note eintragen…' }))
    dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Weiteren Versuch eintragen' }))
    await user.selectOptions(within(dialog).getByLabelText('Note im 3. Versuch'), 'grade:2.3')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(screen.getByTestId('overall-grade')).toHaveTextContent('2,3'))
    expect(within(column(/^1\. Semester/)).queryByText('Letzter Versuch')).not.toBeInTheDocument()
  })

  it('shows the credits towards the Bachelorarbeit admission', async () => {
    renderApp({ plan: planFrom(luh) })
    const card = await screen.findByRole('region', { name: /Zulassung: Bachelorarbeit/ })
    expect(within(card).getByText('0 von 120 LP')).toBeInTheDocument()
    expect(within(card).getByTestId('requirement-forecast')).toHaveTextContent(
      /Laut Plan|Mit den eingeplanten Modulen/,
    )
  })

  it('turns reminders off from the e-mail link after asking', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ examReminders: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    try {
      const { user } = renderApp({ path: '/unsubscribe?token=abc.def' })
      await user.click(await screen.findByRole('button', { name: 'Erinnerungen ausschalten' }))
      expect(await screen.findByText(/Erinnerungen sind ausgeschaltet/)).toBeInTheDocument()
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/notifications/unsubscribe?token=abc.def',
        expect.objectContaining({ method: 'POST' }),
      )
    } finally {
      fetchMock.mockRestore()
    }
  })
})

describe('admin dashboard', () => {
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  const stats = {
    users: { total: 12, verified: 10, newLast30Days: 3, activeLast30Days: 7 },
    plans: {
      total: 9,
      byPreset: [
        {
          presetId: 'luh/technische-informatik-bsc-2026',
          programmeName: 'Technische Informatik',
          universityName: 'Leibniz Universität Hannover',
          poVersion: 'PO 2017 in der Fassung ab WS 2026/27',
          plans: 9,
        },
      ],
    },
    shares: { active: 2 },
    reminders: { enabled: 4, sentLast30Days: 11 },
  }
  const users = [
    {
      id: 'u1',
      email: 'studi@example.org',
      emailVerified: false,
      createdAt: '2026-09-01T10:00:00Z',
      lastActiveAt: null,
      plans: 1,
      activeShares: 1,
      reminders: false,
    },
    {
      id: 'u0',
      email: 'admin@example.org',
      emailVerified: true,
      createdAt: '2026-08-01T10:00:00Z',
      lastActiveAt: '2026-09-12T10:00:00Z',
      plans: 1,
      activeShares: 0,
      reminders: true,
    },
  ]

  it('shows numbers and accounts, and runs an action after confirming', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === '/api/admin/me') return respond({ email: 'admin@example.org' })
      if (url === '/api/admin/stats') return respond(stats)
      if (url.startsWith('/api/admin/users?q=')) return respond({ users })
      if (url === '/api/admin/audit') return respond({ entries: [] })
      if (url === '/api/admin/users/u1/revoke-shares' && init?.method === 'POST')
        return respond({ revoked: 1 })
      return respond({ error: 'not_found' }, 404)
    })
    try {
      const { user } = renderApp({ path: '/admin' })
      expect(await screen.findByRole('heading', { name: 'Verwaltung' })).toBeInTheDocument()
      expect(await screen.findByText('10 bestätigt, 3 neu in 30 Tagen')).toBeInTheDocument()
      expect(screen.getByText('PO 2017 in der Fassung ab WS 2026/27')).toBeInTheDocument()
      // Accounts live in their own tab; the dashboard opens on the overview.
      expect(screen.queryByText('studi@example.org')).not.toBeInTheDocument()
      await user.click(screen.getByRole('tab', { name: 'Konten' }))

      const row = (await screen.findByText('studi@example.org')).closest('tr')
      if (!row) throw new Error('expected a table row')
      expect(within(row).getByText('nicht bestätigt')).toBeInTheDocument()
      const ownRow = screen.getByText('admin@example.org', { selector: 'span' }).closest('tr')
      if (!ownRow) throw new Error('expected the own row')
      expect(within(ownRow).queryByRole('button', { name: /Löschen/ })).not.toBeInTheDocument()

      await user.click(within(row).getByRole('button', { name: 'Links deaktivieren' }))
      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByText(/Alle aktiven Links von studi@example.org/)).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Deaktivieren' }))

      expect(await screen.findByText('1 Link von studi@example.org deaktiviert.')).toBeInTheDocument()
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/users/u1/revoke-shares',
        expect.objectContaining({ method: 'POST' }),
      )
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('looks like a missing page to accounts without access', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond({ error: 'not_found' }, 404))
    try {
      renderApp({ path: '/admin' })
      expect(await screen.findByRole('heading', { name: 'Seite nicht gefunden' })).toBeInTheDocument()
      expect(fetchMock).toHaveBeenCalledTimes(1)
    } finally {
      fetchMock.mockRestore()
    }
  })
})
