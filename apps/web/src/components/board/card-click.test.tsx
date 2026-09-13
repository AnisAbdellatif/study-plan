import { createPlanFromPreset } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createAppRouter } from '../../router.tsx'
import { createGuestStore, GuestStoreContext } from '../../store/guest-store.ts'
import { examplePreset } from '../../test/fixtures.ts'

function renderBoard() {
  const store = createGuestStore(window.localStorage)
  store.replacePlan(
    createPlanFromPreset(examplePreset, {
      id: 'plan-test',
      startTerm: { season: 'winter', year: 2026 },
      now: new Date('2026-09-13T10:00:00Z'),
    }),
  )
  render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={createAppRouter(createMemoryHistory({ initialEntries: ['/'] }))} />
    </GuestStoreContext.Provider>,
  )
  return userEvent.setup()
}

describe('clicking a module card', () => {
  it('opens the module details', async () => {
    const user = renderBoard()
    const firstSemester = await screen.findByRole('region', { name: /^1\. Semester/ })
    await user.click(within(firstSemester).getByRole('heading', { name: 'Grundlagen der Programmierung' }))
    const dialog = await screen.findByRole('dialog', { name: 'Grundlagen der Programmierung' })
    expect(
      within(dialog).getByText('keine Angaben aus dem Modulkatalog gespeichert', {
        exact: false,
      }),
    ).toBeInTheDocument()
  })

  it('opens only the menu when the menu button is clicked', async () => {
    const user = renderBoard()
    await user.click(
      await screen.findByRole('button', { name: 'Aktionen für Grundlagen der Programmierung' }),
    )
    expect(await screen.findByRole('menuitem', { name: 'Moduldetails' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
