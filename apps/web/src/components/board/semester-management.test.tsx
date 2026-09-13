import { createPlanFromPreset, type Plan } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
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

const semesters = (store: ReturnType<typeof createGuestStore>) => store.getState().plan?.semesters ?? []

beforeEach(async () => {
  window.localStorage.clear()
  await i18n.changeLanguage('de')
})

describe('semester management on the board', () => {
  it('inserts, moves and deletes semesters from the column menu', async () => {
    const plan = makePlan()
    const count = plan.semesters.length
    const firstModules = plan.semesters[0]?.moduleCodes ?? []
    expect(firstModules.length).toBeGreaterThan(0)
    const { store, user } = renderBoard(plan)
    const openMenu = async (column: string) =>
      user.click(await screen.findByRole('button', { name: `Aktionen für ${column}` }))

    await openMenu('1. Semester')
    await user.click(await screen.findByRole('menuitem', { name: 'Semester davor einfügen' }))
    expect(semesters(store)).toHaveLength(count + 1)
    expect(semesters(store)[0]?.moduleCodes).toEqual([])
    expect(semesters(store)[1]?.moduleCodes).toEqual(firstModules)

    // The old first semester is now the second one; move it back to the front.
    await openMenu('2. Semester')
    await user.click(await screen.findByRole('menuitem', { name: 'Nach links verschieben' }))
    expect(semesters(store)[0]?.moduleCodes).toEqual(firstModules)
    expect(semesters(store)[1]?.moduleCodes).toEqual([])

    // An empty semester goes without asking.
    await openMenu('2. Semester')
    await user.click(await screen.findByRole('menuitem', { name: 'Semester löschen…' }))
    expect(semesters(store)).toHaveLength(count)
    expect(screen.queryByRole('button', { name: 'Semester löschen' })).not.toBeInTheDocument()

    // A semester with modules asks first and then moves them to the backlog.
    await openMenu('1. Semester')
    await user.click(await screen.findByRole('menuitem', { name: 'Semester löschen…' }))
    expect(await screen.findByText(/Module landen unter „Nicht eingeplant“/)).toBeInTheDocument()
    expect(semesters(store)).toHaveLength(count)
    await user.click(screen.getByRole('button', { name: 'Semester löschen' }))
    expect(semesters(store)).toHaveLength(count - 1)
    expect(store.getState().plan?.backlog).toEqual(expect.arrayContaining(firstModules))
  })

  it('offers no move beyond the edges and keeps at least one semester', async () => {
    const plan = makePlan()
    const single: Plan = {
      ...plan,
      semesters: plan.semesters.slice(0, 1),
      backlog: [...plan.backlog, ...plan.semesters.slice(1).flatMap((semester) => semester.moduleCodes)],
    }
    const { user } = renderBoard(single)
    await user.click(await screen.findByRole('button', { name: 'Aktionen für 1. Semester' }))
    for (const name of ['Nach links verschieben', 'Nach rechts verschieben', 'Semester löschen…']) {
      expect(await screen.findByRole('menuitem', { name })).toHaveAttribute('aria-disabled', 'true')
    }
  })
})
