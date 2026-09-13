import { createPlanFromPreset, moveModule, type Plan, type Preset } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'
import { examplePreset, examplePreset2027, luhPreset } from '../test/fixtures.ts'
import i18n from './index.ts'

const PRESETS: Record<string, Preset> = {
  [examplePreset.id]: examplePreset,
  [examplePreset2027.id]: examplePreset2027,
  [luhPreset.id]: luhPreset,
}

function planFrom(id: string): Plan {
  const preset = PRESETS[id]
  if (!preset) throw new Error(`expected the example preset ${id}`)
  return createPlanFromPreset(preset, {
    id: 'plan-test',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
}

function renderBoard(plan: Plan) {
  const store = createGuestStore(window.localStorage)
  store.replacePlan(plan)
  const router = createAppRouter(createMemoryHistory({ initialEntries: ['/'] }))
  render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={router} />
    </GuestStoreContext.Provider>,
  )
  return { store, user: userEvent.setup() }
}

describe('board in English', () => {
  it('renders semesters, summary, hints, deadlines and menus in English and switches back to German', async () => {
    const base = planFrom('example/informatik-bsc-example')
    const secondSemester = base.semesters[1]
    if (!secondSemester) throw new Error('expected a second semester')
    // A winter-only module in a summer semester produces a plan hint.
    const plan = moveModule(base, 'INF-101', secondSemester.id)

    await i18n.changeLanguage('en')
    const { user } = renderBoard(plan)

    expect(await screen.findByRole('heading', { name: 'Semester 1' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Semester 2' })).toHaveTextContent('Summer 2027')
    expect(screen.getByRole('heading', { name: 'Not planned' })).toBeInTheDocument()

    const overview = screen.getByRole('complementary', { name: 'Overview' })
    expect(within(overview).getByText('Current grade average')).toBeInTheDocument()
    expect(within(overview).getByText('Progress')).toBeInTheDocument()
    expect(within(overview).getByText('Areas')).toBeInTheDocument()
    expect(within(overview).getByText('How your grade average is calculated')).toBeInTheDocument()

    const hints = screen.getByRole('region', { name: 'Plan hints' })
    expect(within(hints).getByText(/^\d+ warnings?$/)).toBeInTheDocument()
    expect(
      within(hints).getByText(
        'Grundlagen der Programmierung is only offered in the winter semester, but it is planned for Summer 2027.',
      ),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Semester 2' })).getByText(
        'Only offered in the winter semester',
      ),
    ).toBeInTheDocument()

    const whatIf = screen.getByRole('region', { name: 'What if' })
    expect(within(whatIf).getByLabelText('Target average')).toBeInTheDocument()

    const deadlines = screen.getByRole('region', { name: 'Upcoming dates' })
    expect(within(deadlines).getByRole('button', { name: 'Calendar (.ics)' })).toBeDisabled()
    expect(within(deadlines).getByText(/Add an exam date in the grade dialog/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Actions for Grundlagen der Programmierung' }))
    expect(await screen.findByRole('menuitem', { name: 'Enter grade…' })).toBeInTheDocument()
    expect(screen.getByText('Move to')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /^Semester 2 \(Summer 2027\)/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    expect(await screen.findByRole('menuitem', { name: 'Import grades…' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Share plan…' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Print or save as PDF' })).toBeInTheDocument()
    // Adding and removing semesters lives in each semester's own menu now.
    expect(screen.queryByRole('menuitem', { name: 'Add semester' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Start over…' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await act(() => i18n.changeLanguage('de'))
    expect(await screen.findByRole('heading', { name: '1. Semester' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '2. Semester' })).toHaveTextContent('SS 2027')
    expect(screen.getByRole('region', { name: 'Hinweise zum Plan' })).toHaveTextContent(
      'Grundlagen der Programmierung wird nur im Wintersemester angeboten, ist aber im SS 2027 geplant.',
    )
    expect(screen.getByText('Aktueller Schnitt')).toBeInTheDocument()
  })

  it('shows the admission card in English', async () => {
    await i18n.changeLanguage('en')
    renderBoard(planFrom('luh/technische-informatik-bsc-2026'))
    const card = await screen.findByRole('region', { name: /Admission: Bachelorarbeit/ })
    expect(within(card).getByText('0 of 120 LP')).toBeInTheDocument()
    expect(within(card).getByRole('progressbar', { name: /Credits for admission/ })).toBeInTheDocument()
    expect(within(card).getByTestId('requirement-forecast')).toHaveTextContent(
      /According to your plan|The planned modules/,
    )
  })
})
