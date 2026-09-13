import { createGuestDocument, createPlanFromPreset, type Plan } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { presets } from '../presets.ts'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, EXPORT_KEY, GuestStoreContext, STORAGE_KEY } from '../store/guest-store.ts'

const preset = presets[0]?.preset
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
    expect(within(column(/^1\. Semester/)).getByText('Grundlagen der Programmierung')).toBeInTheDocument()
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
