import { createPlanFromPreset, type ModuleDetails, type Plan } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import i18n from '../../i18n/index.ts'
import { createAppRouter } from '../../router.tsx'
import { createGuestStore, GuestStoreContext } from '../../store/guest-store.ts'
import { examplePreset as preset } from '../../test/fixtures.ts'

const DETAILS: ModuleDetails = {
  englishName: 'Introduction to Programming',
  lecturers: ['Prof. Dr. Ada Lovelace'],
  languages: ['Deutsch'],
  courses: [
    { type: 'Vorlesung', sws: 2 },
    { type: 'Übung', title: 'Programmierpraktikum', sws: 2 },
  ],
  workload: { totalHours: 150, contactHours: 60, selfStudyHours: 90 },
  examForms: ['Klausur (90 Min.)'],
  literature: ['Knuth: The Art of Computer Programming', 'Sedgewick: Algorithms'],
  content: '- Variablen\n- Schleifen',
  website: 'https://example.org/modules/inf-101',
  additionalFields: [{ label: 'Anrechenbarkeit', value: 'Nebenfach Informatik' }],
}

function makePlan(details: ModuleDetails | undefined): Plan {
  if (!preset) throw new Error('expected a bundled preset')
  const plan = createPlanFromPreset(preset, {
    id: 'plan-test',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
  return {
    ...plan,
    modules: plan.modules.map((module) => (module.code === 'INF-101' ? { ...module, details } : module)),
  }
}

function renderBoard(plan: Plan) {
  const store = createGuestStore(window.localStorage)
  store.replacePlan(plan)
  const router = createAppRouter(createMemoryHistory({ initialEntries: ['/'] }))
  render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={router} />
    </GuestStoreContext.Provider>,
  )
  return { user: userEvent.setup() }
}

async function openDetails(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  menuItem = 'Moduldetails',
) {
  await user.click(
    await screen.findByRole('button', { name: new RegExp(`^(Aktionen für|Actions for) ${name}$`) }),
  )
  await user.click(await screen.findByRole('menuitem', { name: menuItem }))
  return screen.findByRole('dialog', { name })
}

const row = (dialog: HTMLElement, label: string) => {
  const term = within(dialog).getByText(label, { selector: 'dt' })
  const value = term.nextElementSibling
  if (!(value instanceof HTMLElement)) throw new Error(`expected a value for ${label}`)
  return value
}

describe('module details dialog', () => {
  it('shows facts and Modulkatalog details in German', async () => {
    const { user } = renderBoard(makePlan(DETAILS))
    const dialog = await openDetails(user, 'Grundlagen der Programmierung')

    expect(within(dialog).getByText('Introduction to Programming')).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: 'Eckdaten' })).toBeInTheDocument()
    expect(row(dialog, 'Modulnummer')).toHaveTextContent('INF-101')
    expect(row(dialog, 'Bewertung')).toHaveTextContent('benotet')
    expect(row(dialog, 'Lehrende')).toHaveTextContent('Prof. Dr. Ada Lovelace')

    const courses = within(row(dialog, 'Lehrveranstaltungen')).getAllByRole('listitem')
    expect(courses.map((item) => item.textContent)).toEqual([
      'Vorlesung · 2 SWS',
      'Übung: Programmierpraktikum · 2 SWS',
    ])
    expect(row(dialog, 'Arbeitsaufwand')).toHaveTextContent('Gesamt: 150 h')
    expect(row(dialog, 'Arbeitsaufwand')).toHaveTextContent('Präsenz: 60 h')
    expect(row(dialog, 'Arbeitsaufwand')).toHaveTextContent('Selbststudium: 90 h')
    expect(row(dialog, 'Prüfungsform')).toHaveTextContent('Klausur (90 Min.)')
    expect(within(row(dialog, 'Literatur')).getAllByRole('listitem')).toHaveLength(2)
    expect(row(dialog, 'Anrechenbarkeit')).toHaveTextContent('Nebenfach Informatik')

    const link = within(dialog).getByRole('link', { name: 'https://example.org/modules/inf-101' })
    expect(link).toHaveAttribute('href', 'https://example.org/modules/inf-101')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(within(dialog).queryByText(/keine Angaben aus dem Modulkatalog/)).not.toBeInTheDocument()
  })

  it('renders a non-http website as plain text', async () => {
    const { user } = renderBoard(makePlan({ website: 'javascript:alert(1)' }))
    const dialog = await openDetails(user, 'Grundlagen der Programmierung')

    expect(row(dialog, 'Webseite')).toHaveTextContent('javascript:alert(1)')
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows a note for a module without details', async () => {
    const { user } = renderBoard(makePlan(undefined))
    const dialog = await openDetails(user, 'Grundlagen der Programmierung')

    expect(row(dialog, 'Leistungspunkte')).toHaveTextContent(preset.creditLabel)
    expect(
      within(dialog).getByText('Für dieses Modul sind keine Angaben aus dem Modulkatalog gespeichert.'),
    ).toBeInTheDocument()
  })

  it('uses English labels', async () => {
    await i18n.changeLanguage('en')
    const { user } = renderBoard(makePlan(DETAILS))
    const dialog = await openDetails(user, 'Grundlagen der Programmierung', 'Module details')

    expect(within(dialog).getByRole('heading', { name: 'Key facts' })).toBeInTheDocument()
    expect(row(dialog, 'Lecturers')).toHaveTextContent('Prof. Dr. Ada Lovelace')
    expect(row(dialog, 'Workload')).toHaveTextContent('Total: 150 h')
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})
