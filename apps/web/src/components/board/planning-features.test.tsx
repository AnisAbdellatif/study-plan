import { createPlanFromPreset, type Plan } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n/index.ts'
import { createAppRouter } from '../../router.tsx'
import { createGuestStore, GuestStoreContext } from '../../store/guest-store.ts'
import { examplePreset } from '../../test/fixtures.ts'

function makePlan(): Plan {
  return createPlanFromPreset(examplePreset, {
    id: 'plan-test',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
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

beforeEach(async () => {
  window.localStorage.clear()
  await i18n.changeLanguage('de')
})

describe('planning features on the board', () => {
  it('marks a semester as a leave semester from its menu', async () => {
    const { store, user } = renderBoard(makePlan())
    await user.click(await screen.findByRole('button', { name: 'Aktionen für 2. Semester' }))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Urlaubssemester' }))
    expect(store.getState().plan?.semesters[1]?.kind).toBe('leave')
    expect(await screen.findByText(/ist ein Urlaubssemester, trotzdem ist dort/)).toBeInTheDocument()
  })

  it('shows the expected graduation and applies a suggested plan', async () => {
    const plan = makePlan()
    const { store, user } = renderBoard(plan)
    expect(await screen.findByRole('heading', { name: 'Voraussichtlicher Abschluss' })).toBeInTheDocument()
    expect(screen.getByTestId('forecast-planned')).toHaveTextContent('Fachsemester')

    await user.click(screen.getByRole('button', { name: 'Plan vorschlagen…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Plan vorschlagen' })
    const credits = within(dialog).getByLabelText(`${plan.preset.creditLabel} pro Semester`)
    await user.clear(credits)
    await user.type(credits, '12')
    expect(within(dialog).getByTestId('suggest-preview')).toHaveTextContent(
      /werden verschoben|wird verschoben/,
    )

    await user.click(within(dialog).getByRole('button', { name: 'Vorschlag übernehmen' }))
    expect(screen.queryByRole('dialog', { name: 'Plan vorschlagen' })).not.toBeInTheDocument()
    expect(store.getState().plan?.semesters.length).toBeGreaterThan(plan.semesters.length)
  })

  it('records a recognition in the grade dialog and asks for the recognised result', async () => {
    const plan = makePlan()
    const code = plan.semesters[0]?.moduleCodes[0] ?? ''
    const module = plan.modules.find((item) => item.code === code)
    if (!module) throw new Error('example plan needs a module in semester 1')
    const { store, user } = renderBoard(plan)

    await user.click(await screen.findByRole('button', { name: `Aktionen für ${module.name}` }))
    await user.click(
      await screen.findByRole('menuitem', {
        name: module.grading === 'graded' ? 'Note eintragen…' : 'Ergebnis eintragen…',
      }),
    )
    const dialog = await screen.findByRole('dialog', { name: module.name })
    await user.click(within(dialog).getByRole('checkbox', { name: /Anderswo erbracht/ }))
    await user.selectOptions(within(dialog).getByLabelText('Stand'), 'approved')
    await user.type(within(dialog).getByLabelText(/^Hochschule/), 'Universidad de Granada')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    expect(store.getState().plan?.modules.find((item) => item.code === code)?.recognition).toEqual({
      status: 'approved',
      institution: 'Universidad de Granada',
    })
    expect(await screen.findByText(/ist anerkannt, aber noch ohne Ergebnis/)).toBeInTheDocument()
    expect(screen.getAllByText('anerkannt').length).toBeGreaterThan(0)
  })
})
