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

describe('grouping options not decided yet', () => {
  it('groups two options from the card menu, counts them once and keeps the chosen one', async () => {
    const { plan, first, second } = planWithTwoOptions()
    const { user, store } = renderBoard(plan)
    const fifth = await screen.findByRole('region', { name: /^5\. Semester/ })
    const credits = summarizePlan(plan).semesters[4]?.credits ?? 0
    expect(fifth).toHaveTextContent(`${credits} LP`)

    await user.click(within(fifth).getByRole('button', { name: `Aktionen für ${first}` }))
    expect(await screen.findByText('Gruppieren mit (noch nicht entschieden)')).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: second }))

    await waitFor(() => expect(store.getState().plan?.moduleGroups).toHaveLength(1))
    expect(
      await screen.findByText(`${second} mit ${first} gruppiert, die Gruppe zählt wie ein Modul`),
    ).toBeInTheDocument()
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
})
