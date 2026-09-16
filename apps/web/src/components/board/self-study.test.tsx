import { createPlanFromPreset, type Plan, summarizePlan } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createAppRouter } from '../../router.tsx'
import { createGuestStore, GuestStoreContext } from '../../store/guest-store.ts'
import { luhPreset } from '../../test/fixtures.ts'

function makePlan(): Plan {
  return createPlanFromPreset(luhPreset, {
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

describe('modules just for learning', () => {
  it('stops counting a module from its card menu and lets it count again', async () => {
    const plan = makePlan()
    const code = plan.semesters[0]?.moduleCodes[0] ?? ''
    const module = plan.modules.find((item) => item.code === code)
    if (!module) throw new Error('expected a module in the first semester')
    const { user, store } = renderBoard(plan)
    const before = summarizePlan(plan).semesters[0]?.credits ?? 0

    const first = await screen.findByRole('region', { name: /^1\. Semester/ })
    expect(first).toHaveTextContent(`${before} LP`)
    await user.click(within(first).getByRole('button', { name: `Aktionen für ${module.name}` }))
    await user.click(await screen.findByRole('menuitem', { name: 'Nur zum Lernen (zählt nicht mit)' }))

    await waitFor(() =>
      expect(store.getState().plan?.modules.find((item) => item.code === code)?.selfStudy).toBe(true),
    )
    expect(await screen.findByText(`${module.name} zählt jetzt nur noch zum Lernen`)).toBeInTheDocument()
    const card = within(first).getByRole('heading', { name: module.name }).closest('li')
    expect(card).toHaveTextContent('zählt nicht')
    expect(within(first).getByText(`${before - module.credits} LP`)).toBeInTheDocument()

    await user.click(within(first).getByRole('button', { name: `Aktionen für ${module.name}` }))
    await user.click(await screen.findByRole('menuitem', { name: 'Wieder mitzählen lassen' }))
    await waitFor(() =>
      expect(store.getState().plan?.modules.find((item) => item.code === code)).not.toHaveProperty(
        'selfStudy',
      ),
    )
    expect(within(first).getByText(`${before} LP`)).toBeInTheDocument()
  })
})
