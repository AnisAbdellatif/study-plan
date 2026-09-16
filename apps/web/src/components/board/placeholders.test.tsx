import {
  addPlaceholder,
  choiceAreas,
  choosePlaceholder,
  createPlanFromPreset,
  type Plan,
} from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import i18n from '../../i18n/index.ts'
import { createAppRouter } from '../../router.tsx'
import { createGuestStore, GuestStoreContext } from '../../store/guest-store.ts'
import { luhPreset } from '../../test/fixtures.ts'

const AREA = 'vertiefung-informatik'

function makePlan(): Plan {
  return createPlanFromPreset(luhPreset, {
    id: 'plan-test',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
}

/** A plan with one Vertiefung placeholder as the second entry of the fifth semester. */
function planWithPlaceholder(): Plan {
  return addPlaceholder(makePlan(), AREA, 's5', 1, 'test')
}

function renderBoard(plan: Plan) {
  const store = createGuestStore(window.localStorage)
  store.replacePlan(plan)
  render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={createAppRouter(createMemoryHistory({ initialEntries: ['/'] }))} />
    </GuestStoreContext.Provider>,
  )
  return { store, user: userEvent.setup() }
}

const cardNames = (list: HTMLElement) =>
  within(list)
    .queryAllByRole('heading', { level: 3 })
    .map((h) => h.textContent)

const tile = (name: string) =>
  screen.getAllByTestId('choice-area-tile').find((item) => within(item).queryByRole('heading', { name }))

describe('choice area tiles', () => {
  it('shows one tile per choice area with progress and hides its options from the module list', async () => {
    renderBoard(planWithPlaceholder())
    const backlog = await screen.findByRole('region', { name: /^Nicht eingeplant/ })
    const tiles = within(backlog).getByRole('list', { name: 'Wahlbereiche' })
    expect(cardNames(tiles)).toEqual(['Vertiefung der Informatik', 'Vertiefung der Informationstechnik'])

    expect(tile('Vertiefung der Informatik')).toHaveTextContent('1 Platzhalter (≈5 LP) · Ziel 10–20 LP')
    expect(tile('Vertiefung der Informatik')).toHaveTextContent('15 Module verfügbar')
    expect(tile('Vertiefung der Informationstechnik')).toHaveTextContent('Ziel 10–20 LP')
    expect(tile('Vertiefung der Informationstechnik')).not.toHaveTextContent('Platzhalter')

    const list = within(backlog).getByRole('list', { name: 'Module in Nicht eingeplant' })
    expect(cardNames(list)).toEqual([])
    expect(within(list).queryByText('Artificial Intelligence I')).not.toBeInTheDocument()
    expect(list).toHaveTextContent('Keine weiteren Module offen')
  })

  it('plans a placeholder from the tile menu', async () => {
    const { user, store } = renderBoard(makePlan())
    await user.click(await screen.findByRole('button', { name: 'Aktionen für Vertiefung der Informatik' }))
    await user.click(await screen.findByRole('menuitem', { name: /^5\. Semester/ }))

    const fifth = screen.getByRole('region', { name: /^5\. Semester/ })
    const card = await within(fifth).findByTestId('placeholder-card')
    expect(card).toHaveTextContent('Vertiefung der Informatik')
    expect(card).toHaveTextContent('≈ 5 LP')
    expect(within(fifth).getByText(/\+ ≈5 LP/)).toBeInTheDocument()
    expect(tile('Vertiefung der Informatik')).toHaveTextContent('1 Platzhalter (≈5 LP)')

    const plan = store.getState().plan
    expect(plan?.placeholders).toHaveLength(1)
    expect(plan?.semesters[4]?.moduleCodes.at(-1)).toBe(plan?.placeholders?.[0]?.id)
    expect(
      await screen.findByText('Platzhalter für Vertiefung der Informatik im 5. Semester eingeplant'),
    ).toBeInTheDocument()
  })

  it('browses the options without choosing', async () => {
    const { user } = renderBoard(makePlan())
    await user.click(await screen.findByRole('button', { name: 'Aktionen für Vertiefung der Informatik' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Optionen ansehen…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Optionen für Vertiefung der Informatik' })
    expect(within(dialog).getByText('Artificial Intelligence I')).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('button', { name: /Artificial Intelligence I/ }),
    ).not.toBeInTheDocument()
  })

  it('filters the options by the kind of assessment', async () => {
    // The example's modules carry no exam forms, so the test gives three of them a written exam.
    const base = makePlan()
    const options = choiceAreas(base).find((choice) => choice.area.id === AREA)?.available ?? []
    const written = options.slice(0, 3).map((module) => module.code)
    const plan: Plan = {
      ...base,
      modules: base.modules.map((module) =>
        options.some((option) => option.code === module.code)
          ? {
              ...module,
              details: {
                ...module.details,
                examForms: [written.includes(module.code) ? 'Klausur (90 Min.)' : 'mündliche Prüfung'],
              },
            }
          : module,
      ),
    }
    const { user } = renderBoard(plan)
    await user.click(await screen.findByRole('button', { name: 'Aktionen für Vertiefung der Informatik' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Optionen ansehen…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Optionen für Vertiefung der Informatik' })
    const shown = () =>
      options
        .filter((module) => within(dialog).queryByText(module.name, { selector: 'span' }) !== null)
        .map((module) => module.code)

    expect(within(dialog).getByRole('radio', { name: /^Klausur/ })).toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: /^Klausur/ }))
    expect(shown()).toEqual(written)

    // The two rows narrow down together: written exams offered in the summer.
    await user.click(within(dialog).getByRole('radio', { name: /^Sommersemester/ }))
    expect(shown()).toEqual(
      options
        .filter(
          (module) =>
            written.includes(module.code) && (module.offering === 'summer' || module.offering === 'both'),
        )
        .map((module) => module.code),
    )

    await user.click(within(dialog).getByRole('radio', { name: /^Mündlich/ }))
    expect(shown().every((code) => !written.includes(code))).toBe(true)
  })

  it('filters the options by the semester they are offered in', async () => {
    const plan = makePlan()
    const available = choiceAreas(plan).find((choice) => choice.area.id === AREA)?.available ?? []
    const { user } = renderBoard(plan)
    await user.click(await screen.findByRole('button', { name: 'Aktionen für Vertiefung der Informatik' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Optionen ansehen…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Optionen für Vertiefung der Informatik' })
    const shown = () =>
      available
        .filter((module) => within(dialog).queryByText(module.name, { selector: 'span' }) !== null)
        .map((module) => module.code)

    expect(shown()).toHaveLength(available.length)

    for (const season of ['summer', 'winter'] as const) {
      await user.click(
        within(dialog).getByRole('radio', {
          name: new RegExp(season === 'summer' ? 'Sommersemester' : 'Wintersemester'),
        }),
      )
      const expected = available
        .filter((module) => module.offering === season || module.offering === 'both')
        .map((module) => module.code)
      expect(expected.length).toBeGreaterThan(0)
      expect(shown()).toEqual(expected)
    }

    await user.click(within(dialog).getByRole('radio', { name: /Alle/ }))
    expect(shown()).toHaveLength(available.length)
  })
})

describe('area choices', () => {
  /** The two Vertiefung areas as a choice of one, the way a programme offers its Nebenfächer. */
  const planWithChoice = (): Plan =>
    createPlanFromPreset(
      {
        ...luhPreset,
        areaChoices: [
          {
            id: 'schwerpunkt',
            name: 'Schwerpunkt',
            areaIds: ['vertiefung-informatik', 'vertiefung-informationstechnik'],
          },
        ],
      },
      { id: 'plan-test', startTerm: { season: 'winter', year: 2026 }, now: new Date('2026-09-13T10:00:00Z') },
    )

  it('groups the areas under the choice, keeps only the picked one and clears the pick', async () => {
    const { user, store } = renderBoard(planWithChoice())
    const backlog = await screen.findByRole('region', { name: /^Nicht eingeplant/ })
    expect(within(backlog).queryByRole('list', { name: 'Wahlbereiche' })).not.toBeInTheDocument()
    const group = () => within(backlog).getByRole('list', { name: 'Schwerpunkt' })
    expect(cardNames(group())).toEqual(['Vertiefung der Informatik', 'Vertiefung der Informationstechnik'])

    await user.click(
      within(group()).getByRole('button', { name: 'Vertiefung der Informatik wählen (Schwerpunkt)' }),
    )
    await waitFor(() =>
      expect(store.getState().plan?.chosenAreas).toEqual({ schwerpunkt: 'vertiefung-informatik' }),
    )
    expect(await screen.findByText('Vertiefung der Informatik als Schwerpunkt gewählt')).toBeInTheDocument()
    const picked = within(group()).getAllByTestId('choice-area-tile')
    expect(picked).toHaveLength(1)
    expect(picked[0]).toHaveTextContent(/Vertiefung der Informatik\s*Gewählt/)
    expect(within(group()).queryByRole('button', { name: /wählen \(Schwerpunkt\)/ })).not.toBeInTheDocument()

    await user.click(within(group()).getByRole('button', { name: 'Aktionen für Vertiefung der Informatik' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Wahl aufheben' }))
    await waitFor(() => expect(store.getState().plan?.chosenAreas).toBeUndefined())
    expect(within(group()).getAllByTestId('choice-area-tile')).toHaveLength(2)
    expect(await screen.findByText('Wahl für Schwerpunkt aufgehoben')).toBeInTheDocument()
  })
})

describe('placeholder cards', () => {
  it('narrows the options with the search and replaces the placeholder in place', async () => {
    const { user, store } = renderBoard(planWithPlaceholder())
    const fifth = await screen.findByRole('region', { name: /^5\. Semester/ })
    await user.click(within(fifth).getByRole('button', { name: 'Modul auswählen…' }))

    const dialog = await screen.findByRole('dialog', {
      name: 'Modul für Vertiefung der Informatik auswählen',
    })
    const options = within(dialog).getByRole('list', { name: 'Verfügbare Module' })
    expect(within(options).getAllByRole('button')).toHaveLength(15)

    await user.type(within(dialog).getByLabelText('Optionen durchsuchen'), 'datenbank')
    const matches = within(options).getAllByRole('button')
    expect(matches).toHaveLength(1)
    // The fifth semester is a winter semester.
    expect(matches[0]).toHaveTextContent('nur im Sommersemester angeboten')

    await user.clear(within(dialog).getByLabelText('Optionen durchsuchen'))
    await user.type(within(dialog).getByLabelText('Optionen durchsuchen'), 'quanten')
    expect(within(dialog).getByText('Kein Modul passt zu „quanten“.')).toBeInTheDocument()

    await user.clear(within(dialog).getByLabelText('Optionen durchsuchen'))
    await user.type(within(dialog).getByLabelText('Optionen durchsuchen'), 'datenbank')
    await user.click(within(dialog).getByRole('button', { name: /Grundlagen der Datenbanksysteme/ }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const plan = store.getState().plan
    expect(plan?.semesters[4]?.moduleCodes[1]).toBe('VI-GDBS')
    expect(plan?.placeholders).toEqual([])
    expect(within(fifth).queryByTestId('placeholder-card')).not.toBeInTheDocument()
    expect(
      within(fifth).getByRole('heading', { name: 'Grundlagen der Datenbanksysteme' }),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('Grundlagen der Datenbanksysteme für Vertiefung der Informatik gewählt'),
    ).toBeInTheDocument()
  })

  it('turns a chosen module back into a placeholder', async () => {
    const { user, store } = renderBoard(
      choosePlaceholder(planWithPlaceholder(), 'placeholder-test', 'VI-GDBS'),
    )
    await user.click(
      await screen.findByRole('button', { name: 'Aktionen für Grundlagen der Datenbanksysteme' }),
    )
    await user.click(await screen.findByRole('menuitem', { name: 'Auswahl zurücknehmen' }))

    const fifth = screen.getByRole('region', { name: /^5\. Semester/ })
    expect(await within(fifth).findByTestId('placeholder-card')).toHaveTextContent(
      'Vertiefung der Informatik',
    )
    const plan = store.getState().plan
    expect(plan?.semesters[4]?.moduleCodes[1]).toBe(plan?.placeholders?.[0]?.id)
    expect(plan?.backlog).toContain('VI-GDBS')
  })

  it('offers another choice for a chosen module', async () => {
    const { user, store } = renderBoard(
      choosePlaceholder(planWithPlaceholder(), 'placeholder-test', 'VI-GDBS'),
    )
    await user.click(
      await screen.findByRole('button', { name: 'Aktionen für Grundlagen der Datenbanksysteme' }),
    )
    await user.click(await screen.findByRole('menuitem', { name: 'Andere Wahl…' }))

    const dialog = await screen.findByRole('dialog', {
      name: 'Modul für Vertiefung der Informatik auswählen',
    })
    await user.click(within(dialog).getByRole('button', { name: /Grundlagen der IT-Sicherheit/ }))
    await waitFor(() => expect(store.getState().plan?.semesters[4]?.moduleCodes[1]).toBe('VI-ITSEC'))
    expect(store.getState().plan?.placeholders).toEqual([])
    expect(store.getState().plan?.backlog).toContain('VI-GDBS')
  })

  it('removes a placeholder from its menu', async () => {
    const { user, store } = renderBoard(planWithPlaceholder())
    await user.click(
      await screen.findByRole('button', { name: 'Aktionen für Platzhalter Vertiefung der Informatik' }),
    )
    expect(await screen.findByRole('menuitem', { name: /^5\. Semester/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.queryByRole('menuitem', { name: 'Nicht eingeplant' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Platzhalter entfernen' }))

    await waitFor(() => expect(store.getState().plan?.placeholders).toEqual([]))
    expect(screen.queryByTestId('placeholder-card')).not.toBeInTheDocument()
    expect(
      store.getState().plan?.semesters[4]?.moduleCodes.some((code) => code.startsWith('placeholder-')),
    ).toBe(false)
    expect(await screen.findByText('Platzhalter für Vertiefung der Informatik entfernt')).toBeInTheDocument()
  })

  it('is labelled in English', async () => {
    await i18n.changeLanguage('en')
    const { user } = renderBoard(makePlan())
    const backlog = await screen.findByRole('region', { name: /^Not planned/ })
    expect(within(backlog).getByRole('list', { name: 'Elective areas' })).toBeInTheDocument()
    expect(tile('Vertiefung der Informatik')).toHaveTextContent('Target 10–20 LP')
    expect(tile('Vertiefung der Informatik')).toHaveTextContent('15 modules available')

    await user.click(screen.getByRole('button', { name: 'Actions for Vertiefung der Informatik' }))
    expect(await screen.findByText('Add placeholder to')).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: /^Semester 5/ }))

    const fifth = screen.getByRole('region', { name: /^Semester 5/ })
    expect(await within(fifth).findByText('Placeholder')).toBeInTheDocument()
    await user.click(within(fifth).getByRole('button', { name: 'Choose module…' }))
    const dialog = await screen.findByRole('dialog', {
      name: 'Choose a module for Vertiefung der Informatik',
    })
    expect(within(dialog).getByLabelText('Search options')).toBeInTheDocument()
    expect(within(dialog).getAllByText(/only offered in the summer semester/).length).toBeGreaterThan(0)
  })
})
