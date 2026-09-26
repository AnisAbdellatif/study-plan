import { choiceAreas, createPlanFromPreset, moveModule, type Plan, summarizePlan } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createAppRouter } from '../../router.tsx'
import { createGuestStore, GuestStoreContext } from '../../store/guest-store.ts'
import { luhPreset } from '../../test/fixtures.ts'

const AREA = 'vertiefung-informatik'

/** Two Vertiefung options planned in the fifth semester, not decided between yet. */
function planWithTwoOptions(): { plan: Plan; first: string; second: string } {
  const base = createPlanFromPreset(luhPreset, {
    id: 'plan-test',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
  const [first, second] = (choiceAreas(base).find((choice) => choice.area.id === AREA)?.available ?? [])
    .filter((module) => module.credits === 5)
    .map((module) => module.name)
  if (!first || !second) throw new Error('expected two 5 LP options')
  const code = (name: string) => base.modules.find((module) => module.name === name)?.code ?? ''
  const plan = moveModule(moveModule(base, code(first), 's5'), code(second), 's5')
  return { plan, first, second }
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

async function selectFromMenu(user: ReturnType<typeof userEvent.setup>, column: HTMLElement, name: string) {
  await user.click(within(column).getByRole('button', { name: `Aktionen für ${name}` }))
  await user.click(await screen.findByRole('menuitem', { name: 'Zum Gruppieren auswählen' }))
}

describe('grouping options not decided yet', () => {
  it('selects options, groups them from the bar, counts them once and keeps the chosen one', async () => {
    const { plan, first, second } = planWithTwoOptions()
    const { user, store } = renderBoard(plan)
    const fifth = await screen.findByRole('region', { name: /^5\. Semester/ })
    const credits = summarizePlan(plan).semesters[4]?.credits ?? 0
    expect(fifth).toHaveTextContent(`${credits} LP`)

    await selectFromMenu(user, fifth, first)
    const bar = await screen.findByRole('region', { name: 'Auswahl zum Gruppieren' })
    expect(bar).toHaveTextContent('1 Modul ausgewählt')
    expect(within(bar).getByRole('button', { name: 'Gruppieren' })).toBeDisabled()

    await user.click(within(fifth).getByRole('checkbox', { name: `${second} zum Gruppieren auswählen` }))
    expect(bar).toHaveTextContent('2 Module ausgewählt')
    await user.click(within(bar).getByRole('button', { name: 'Gruppieren' }))

    await waitFor(() => expect(store.getState().plan?.moduleGroups).toHaveLength(1))
    expect(await screen.findByText('2 Module gruppiert, die Gruppe zählt wie ein Modul')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Auswahl zum Gruppieren' })).not.toBeInTheDocument()
    for (const name of [first, second]) {
      const card = within(fifth).getByRole('heading', { name }).closest('li')
      expect(card).toHaveTextContent('Einer von 2 · zählt als 5 LP')
    }
    expect(within(fifth).getByText(`${credits - 5} LP`)).toBeInTheDocument()

    await user.click(within(fifth).getByRole('button', { name: `Aktionen für ${second}` }))
    await user.click(await screen.findByRole('menuitem', { name: 'Dieses Modul wählen' }))

    await waitFor(() => expect(store.getState().plan).not.toHaveProperty('moduleGroups'))
    expect(within(fifth).queryByRole('heading', { name: first })).not.toBeInTheDocument()
    expect(within(fifth).getByRole('heading', { name: second })).toBeInTheDocument()
    expect(within(fifth).queryByText(/Einer von/)).not.toBeInTheDocument()
  })

  it('groups options planned in different semesters', async () => {
    const { plan, first, second } = planWithTwoOptions()
    const code = (name: string) => plan.modules.find((module) => module.name === name)?.code ?? ''
    const spread = moveModule(plan, code(second), 's4')
    const { user, store } = renderBoard(spread)
    const fourth = await screen.findByRole('region', { name: /^4\. Semester/ })
    const fifth = screen.getByRole('region', { name: /^5\. Semester/ })
    const before = summarizePlan(spread)

    await selectFromMenu(user, fifth, first)
    await user.click(within(fourth).getByRole('checkbox', { name: `${second} zum Gruppieren auswählen` }))
    await user.click(screen.getByRole('button', { name: 'Gruppieren' }))

    await waitFor(() => expect(store.getState().plan?.moduleGroups).toHaveLength(1))
    expect(within(fourth).getByRole('heading', { name: second }).closest('li')).toHaveTextContent(
      'Einer von 2',
    )
    expect(within(fifth).getByRole('heading', { name: first }).closest('li')).toHaveTextContent('Einer von 2')
    expect(summarizePlan(store.getState().plan ?? spread).credits.planned).toBe(before.credits.planned - 5)
  })

  it('only offers options of the same area and cancels with Escape', async () => {
    const { plan, first, second } = planWithTwoOptions()
    const { user, store } = renderBoard(plan)
    const fifth = await screen.findByRole('region', { name: /^5\. Semester/ })

    await selectFromMenu(user, fifth, first)
    expect(
      within(fifth).getByRole('checkbox', { name: `${second} zum Gruppieren auswählen` }),
    ).toBeInTheDocument()
    // Compulsory modules can't join, so they get no checkbox.
    expect(within(fifth).getAllByRole('checkbox')).toHaveLength(2)

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Auswahl zum Gruppieren' })).not.toBeInTheDocument(),
    )
    expect(within(fifth).queryAllByRole('checkbox')).toHaveLength(0)
    expect(store.getState().plan).not.toHaveProperty('moduleGroups')
  })
})
