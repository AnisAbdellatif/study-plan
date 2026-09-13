import { createPlanFromPreset, moveModule, type Plan } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import i18n from '../../i18n/index.ts'
import { moduleMatchesQuery } from '../../lib/module-search.ts'
import { createAppRouter } from '../../router.tsx'
import { createGuestStore, GuestStoreContext } from '../../store/guest-store.ts'
import { examplePreset } from '../../test/fixtures.ts'

function planWithBacklog(): Plan {
  let plan = createPlanFromPreset(examplePreset, {
    id: 'plan-test',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
  for (const code of ['INF-101', 'MAT-101', 'MAT-102', 'SQ-101', 'WP-401'])
    plan = moveModule(plan, code, null)
  return {
    ...plan,
    modules: plan.modules.map((module) =>
      module.code === 'WP-401' ? { ...module, details: { englishName: 'Database Systems' } } : module,
    ),
  }
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

describe('searching the unplanned modules', () => {
  it('filters by name, category and English title, ignoring case and umlauts', async () => {
    const { user } = renderBoard(planWithBacklog())
    const backlog = await screen.findByRole('region', { name: /^Nicht eingeplant/ })
    const list = within(backlog).getByRole('list', { name: /Nicht eingeplant/ })
    expect(cardNames(list)).toHaveLength(5)

    const search = within(backlog).getByLabelText('Nicht eingeplante Module durchsuchen')
    await user.type(search, 'ANALYSIS')
    expect(cardNames(list)).toEqual(['Analysis I'])
    expect(within(backlog).getByRole('status')).toHaveTextContent('1 von 5 Modulen')

    await user.clear(search)
    await user.type(search, 'schluessel')
    expect(cardNames(list)).toEqual(['Schlüsselqualifikation: Wissenschaftliches Arbeiten'])

    await user.clear(search)
    await user.type(search, 'database')
    expect(cardNames(list)).toEqual(['Datenbanksysteme'])

    await user.clear(search)
    await user.type(search, 'pflicht algebra')
    expect(cardNames(list)).toEqual(['Lineare Algebra I'])
  })

  it('explains an empty result and clears with the button or Escape', async () => {
    const { user } = renderBoard(planWithBacklog())
    const backlog = await screen.findByRole('region', { name: /^Nicht eingeplant/ })
    const list = within(backlog).getByRole('list', { name: /Nicht eingeplant/ })
    const search = within(backlog).getByLabelText('Nicht eingeplante Module durchsuchen')

    await user.type(search, 'quantenphysik')
    expect(within(list).getByText('Kein Modul passt zu „quantenphysik“.')).toBeInTheDocument()
    await user.click(within(backlog).getByRole('button', { name: 'Suche leeren' }))
    expect(search).toHaveValue('')
    expect(cardNames(list)).toHaveLength(5)

    await user.type(search, 'analysis{Escape}')
    expect(search).toHaveValue('')
    expect(cardNames(list)).toHaveLength(5)
  })

  it('keeps moving modules from a filtered list working', async () => {
    const { user, store } = renderBoard(planWithBacklog())
    const backlog = await screen.findByRole('region', { name: /^Nicht eingeplant/ })
    await user.type(within(backlog).getByLabelText('Nicht eingeplante Module durchsuchen'), 'analysis')
    await user.click(within(backlog).getByRole('button', { name: 'Aktionen für Analysis I' }))
    await user.click(await screen.findByRole('menuitem', { name: /^2\. Semester/ }))
    expect(store.getState().plan?.semesters[1]?.moduleCodes).toContain('MAT-102')
    expect(store.getState().plan?.backlog).not.toContain('MAT-102')
  })

  it('is labelled in English and has no search in semester columns', async () => {
    await i18n.changeLanguage('en')
    renderBoard(planWithBacklog())
    const backlog = await screen.findByRole('region', { name: /^Not planned/ })
    expect(within(backlog).getByLabelText('Search unplanned modules')).toHaveAttribute(
      'placeholder',
      'Search modules',
    )
    const firstSemester = screen.getByRole('region', { name: /^Semester 1|^1st semester|^1\. / })
    expect(within(firstSemester).queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('matches codes only when they are shown', () => {
    const module = planWithBacklog().modules.find((m) => m.code === 'INF-101')
    if (!module) throw new Error('expected module')
    expect(moduleMatchesQuery(module, 'inf-101', true)).toBe(true)
    expect(moduleMatchesQuery(module, 'inf-101', false)).toBe(false)
    expect(moduleMatchesQuery(module, '   ', false)).toBe(true)
  })
})
