import { createPlanFromPreset, moveModule, type Plan, setModuleResult } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import i18n from '../../i18n/index.ts'
import { createAppRouter } from '../../router.tsx'
import { createGuestStore, GuestStoreContext } from '../../store/guest-store.ts'
import { examplePreset } from '../../test/fixtures.ts'

const editedPlan = (): Plan => {
  let plan = createPlanFromPreset(examplePreset, {
    id: 'plan-test',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
  plan = moveModule(plan, 'INF-101', null)
  return setModuleResult(plan, 'MAT-101', { kind: 'graded', grade: 1.7 })
}

function renderBoard() {
  const store = createGuestStore(window.localStorage)
  store.replacePlan(editedPlan())
  render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={createAppRouter(createMemoryHistory({ initialEntries: ['/'] }))} />
    </GuestStoreContext.Provider>,
  )
  return { store, user: userEvent.setup() }
}

const grade = (plan: Plan | null | undefined) =>
  plan?.modules.find((module) => module.code === 'MAT-101')?.attempts[0]?.grade

describe('resetting the plan to its default', () => {
  it('moves modules back and keeps grades unless asked otherwise', async () => {
    const { store, user } = renderBoard()
    await user.click(await screen.findByRole('button', { name: 'Weitere Aktionen' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Auf Standardplan zurücksetzen…' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Plan auf den Standard zurücksetzen?' })
    await user.click(within(dialog).getByRole('button', { name: 'Zurücksetzen' }))

    const plan = store.getState().plan
    expect(plan?.semesters[0]?.moduleCodes).toContain('INF-101')
    expect(plan?.backlog).not.toContain('INF-101')
    expect(grade(plan)).toBe(1.7)
  })

  it('removes grades when the checkbox is ticked', async () => {
    const { store, user } = renderBoard()
    await user.click(await screen.findByRole('button', { name: 'Weitere Aktionen' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Auf Standardplan zurücksetzen…' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(
      within(dialog).getByRole('checkbox', { name: 'Auch Noten, Prüfungstermine und Zielschnitt entfernen' }),
    )
    await user.click(within(dialog).getByRole('button', { name: 'Zurücksetzen' }))

    expect(grade(store.getState().plan)).toBeUndefined()
    expect(store.getState().plan?.semesters[0]?.moduleCodes).toContain('INF-101')
  })

  it('is labelled in English', async () => {
    await i18n.changeLanguage('en')
    const { user } = renderBoard()
    await user.click(await screen.findByRole('button', { name: 'More actions' }))
    expect(await screen.findByRole('menuitem', { name: 'Reset to default plan…' })).toBeInTheDocument()
  })
})
