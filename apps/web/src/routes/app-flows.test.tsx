import {
  addDays,
  createGuestDocument,
  createPlanFromPreset,
  localIsoDate,
  type Plan,
  setModuleResult,
} from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findPreset } from '../presets.ts'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, EXPORT_KEY, GuestStoreContext, STORAGE_KEY } from '../store/guest-store.ts'

const preset = findPreset('example/informatik-bsc-example')?.preset
if (!preset) throw new Error('expected a bundled preset')

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
  it('sends visitors without a plan to the start page and creates a plan from a preset', async () => {
    const { user, store } = renderApp()
    expect(await screen.findByRole('heading', { name: 'Studienplan anlegen' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /fiktives Beispiel/ })).toBeInTheDocument()

    await user.click(screen.getByLabelText('Wintersemester'))
    await user.click(screen.getByRole('button', { name: 'Plan anlegen' }))

    expect(await screen.findByRole('heading', { name: '1. Semester' })).toBeInTheDocument()
    const plan = store.getState().plan
    expect(plan?.startTerm.season).toBe('winter')
    expect(window.localStorage.getItem(STORAGE_KEY)).toContain('"format":"study-plan.guest"')
    // The LUH preset is listed first and selected by default
    expect(plan?.preset.id).toBe('luh/technische-informatik-bsc-2026')
    expect(within(column(/^1\. Semester/)).getByText('Programmieren I')).toBeInTheDocument()
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
    const luh = findPreset('luh/technische-informatik-bsc-2026')?.preset
    if (!luh) throw new Error('expected the LUH preset')
    const plan = createPlanFromPreset(luh, {
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
