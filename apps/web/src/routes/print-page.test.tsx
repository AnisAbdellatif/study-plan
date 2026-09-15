import { createPlanFromPreset, type Plan, setModuleResult } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'
import { examplePreset } from '../test/fixtures.ts'

function makePlan(): { plan: Plan; code: string; name: string } {
  const base = createPlanFromPreset(examplePreset, {
    id: 'plan-print',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
  const code = base.semesters[0]?.moduleCodes.find(
    (candidate) => base.modules.find((module) => module.code === candidate)?.grading === 'graded',
  )
  const module = base.modules.find((candidate) => candidate.code === code)
  if (!code || !module) throw new Error('the example needs a graded module in semester 1')
  return { plan: setModuleResult(base, code, { kind: 'graded', grade: 1.3 }), code, name: module.name }
}

function renderAt(path: string, plan?: Plan) {
  const store = createGuestStore(window.localStorage)
  if (plan) store.replacePlan(plan)
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={router} />
    </GuestStoreContext.Provider>,
  )
  return { router, user: userEvent.setup() }
}

beforeEach(async () => {
  window.localStorage.clear()
  await i18n.changeLanguage('de')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('print page', () => {
  it('is where the board menu leads', async () => {
    const { plan } = makePlan()
    const { router, user } = renderAt('/', plan)
    await user.click(await screen.findByRole('button', { name: 'Weitere Aktionen' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Drucken oder als PDF speichern' }))
    // The board's own heading also carries the plan name, so wait for the sheet itself.
    const sheet = await screen.findByRole('article', { name: 'Studienverlaufsplan' })
    expect(within(sheet).getByRole('heading', { level: 1, name: plan.name })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/print')
  })

  it('lays out the whole plan with semesters, areas and results, and prints on request', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const { plan, name } = makePlan()
    const { user } = renderAt('/print', plan)

    const sheet = await screen.findByRole('article', { name: 'Studienverlaufsplan' })
    expect(within(sheet).getByRole('heading', { level: 1, name: plan.name })).toBeInTheDocument()
    for (const index of plan.semesters.keys()) {
      expect(
        within(sheet).getByRole('heading', { level: 3, name: new RegExp(`^${index + 1}\\. Fachsemester`) }),
      ).toBeInTheDocument()
    }
    expect(within(sheet).getByRole('heading', { name: 'Bereiche' })).toBeInTheDocument()
    const row = within(sheet).getByText(name).closest('tr')
    if (!row) throw new Error('expected a table row for the graded module')
    expect(within(row).getByText('1,3')).toBeInTheDocument()
    expect(within(sheet).getByText('Aktueller Schnitt')).toBeInTheDocument()
    expect(document.title).toBe(`${plan.name} – Studienverlaufsplan`)

    await user.click(screen.getByRole('button', { name: 'Drucken' }))
    expect(print).toHaveBeenCalledOnce()
  })

  it('hides grades on request but keeps whether a module is passed', async () => {
    const { plan, name } = makePlan()
    const { user } = renderAt('/print', plan)
    await user.click(await screen.findByRole('checkbox', { name: 'Noten anzeigen' }))

    const row = screen.getByText(name).closest('tr')
    if (!row) throw new Error('expected a table row for the graded module')
    expect(within(row).queryByText('1,3')).not.toBeInTheDocument()
    expect(within(row).getByText('bestanden')).toBeInTheDocument()
    expect(screen.queryByText('Aktueller Schnitt')).not.toBeInTheDocument()
    expect(screen.getByText('Semester im Plan')).toBeInTheDocument()
  })

  it('sends visitors without a plan home', async () => {
    const { router } = renderAt('/print')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Dein Studium, klar geplant.' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('is translated', async () => {
    await i18n.changeLanguage('en')
    const { plan } = makePlan()
    renderAt('/print', plan)
    expect(await screen.findByRole('article', { name: 'Study plan' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: /^Semester 1/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()
  })

  it('switches to a landscape overview with the semesters side by side', async () => {
    const { plan, name } = makePlan()
    const { router, user } = renderAt('/print', plan)
    const portrait = await screen.findByRole('radio', { name: 'Hochformat' })
    expect(portrait).toBeChecked()
    expect(document.querySelector('style')?.textContent).toContain('A4 portrait')

    await user.click(screen.getByRole('radio', { name: 'Querformat' }))
    expect(await screen.findByRole('radio', { name: 'Querformat' })).toBeChecked()
    expect(router.state.location.search).toEqual({ orientation: 'landscape' })
    const sheet = screen.getByRole('article', { name: 'Studienverlaufsplan' })
    expect(sheet).toHaveAttribute('data-orientation', 'landscape')
    expect(document.querySelector('style')?.textContent).toContain('A4 landscape')

    // Every semester is a column with its modules as cards; results stay visible.
    for (const index of plan.semesters.keys()) {
      expect(
        within(sheet).getByRole('heading', { level: 3, name: `${index + 1}. Fachsemester` }),
      ).toBeInTheDocument()
    }
    const card = within(sheet).getByText(name).closest('li')
    if (!card) throw new Error('expected a card for the graded module')
    expect(within(card).getByText('1,3')).toBeInTheDocument()
    expect(within(sheet).getByRole('heading', { name: /^Bereiche/ })).toBeInTheDocument()
  })

  it('opens straight in landscape from the link', async () => {
    const { plan } = makePlan()
    renderAt('/print?orientation=landscape', plan)
    expect(await screen.findByRole('article', { name: 'Studienverlaufsplan' })).toHaveAttribute(
      'data-orientation',
      'landscape',
    )
    expect(screen.getByRole('radio', { name: 'Querformat' })).toBeChecked()
  })
})
