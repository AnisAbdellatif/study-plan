import { addPlaceholder, createPlanFromPreset, type Plan, summarizePlan } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import i18n from '../../i18n/index.ts'
import { createAppRouter } from '../../router.tsx'
import { BOARD_VIEW_STORAGE_KEY } from '../../routes/board-page.tsx'
import { createGuestStore, GuestStoreContext } from '../../store/guest-store.ts'
import { luhPreset } from '../../test/fixtures.ts'
import { PlanOverview } from './plan-overview.tsx'

function makePlan(): Plan {
  const plan = createPlanFromPreset(luhPreset, {
    id: 'plan-test',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
  const first = plan.semesters[0]?.moduleCodes[0]
  return {
    ...plan,
    modules: plan.modules.map((m) =>
      m.code === first
        ? {
            ...m,
            details: {
              ...m.details,
              lecturers: ['Prof. Dr. Ada Lovelace', 'Dr. Alan Turing'],
              courses: [
                { type: 'V', sws: 2 },
                { type: 'Ü', sws: 2 },
              ],
            },
          }
        : m,
    ),
  }
}

const withPlaceholder = (): Plan => addPlaceholder(makePlan(), 'vertiefung-informatik', 's5', 1, 'test')

function renderOverview(plan: Plan) {
  render(<PlanOverview plan={plan} summary={summarizePlan(plan)} />)
}

function renderBoard(plan: Plan) {
  const store = createGuestStore(window.localStorage)
  store.replacePlan(plan)
  return render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={createAppRouter(createMemoryHistory({ initialEntries: ['/'] }))} />
    </GuestStoreContext.Provider>,
  )
}

describe('plan overview', () => {
  it('shows one column per semester with its term', () => {
    const plan = makePlan()
    renderOverview(plan)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(`B.Sc. ${plan.preset.programmeName}`)
    const headers = screen.getAllByTestId('overview-header')
    expect(headers).toHaveLength(plan.semesters.length)
    expect(headers[0]).toHaveTextContent('1. Fachsemester')
    expect(headers[0]).toHaveTextContent('WS 2026/27')
    expect(headers[1]).toHaveTextContent('2. Fachsemester')
    expect(headers[1]).toHaveTextContent('SS 2027')
  })

  it('sizes module blocks by credits and shows hours, credits and lecturers', () => {
    const plan = makePlan()
    renderOverview(plan)
    const module = plan.modules.find((m) => m.code === plan.semesters[0]?.moduleCodes[0])
    if (!module) throw new Error('missing module')
    const block = screen
      .getAllByTestId('overview-module')
      .find((item) => within(item).queryByText(module.name))
    expect(block).toBeDefined()
    // Short marker for the grade average: Ø counts, kein Ø doesn't.
    expect(block).toHaveTextContent(
      `(2V+2Ü, ${String(module.credits).replace('.', ',')} LP, ${module.countsTowardAverage ? 'Ø' : 'kein Ø'})`,
    )
    expect(block).toHaveTextContent('Prof. Dr. Ada Lovelace, Dr. Alan Turing')
    expect(
      within(screen.getAllByTestId('overview-column')[0] as HTMLElement).getAllByTestId('overview-module'),
    ).toContain(block)
    expect(block?.style.minHeight).toBe(`calc(${module.credits} * var(--overview-lp) - var(--overview-gap))`)
  })

  it('shows placeholders and the credits per semester', () => {
    const plan = withPlaceholder()
    const summary = summarizePlan(plan)
    renderOverview(plan)
    const placeholder = screen.getByTestId('overview-placeholder')
    expect(placeholder).toHaveTextContent('Wahlpflichtmodul')
    expect(placeholder).toHaveTextContent('Vertiefung der Informatik')
    expect(placeholder).toHaveTextContent('≈ 5 LP')
    expect(screen.getAllByTestId('overview-column')[4]).toContainElement(placeholder)

    const totals = screen.getAllByTestId('overview-total')
    expect(totals).toHaveLength(plan.semesters.length)
    expect(totals[0]).toHaveTextContent(`${summary.semesters[0]?.credits} LP`)
    expect(totals[4]).toHaveTextContent('+ ≈5 LP')
    expect(screen.getByRole('list', { name: 'Bereiche' })).toHaveTextContent('Vertiefung der Informatik')
  })

  it('is labelled in English', async () => {
    await i18n.changeLanguage('en')
    renderOverview(withPlaceholder())
    expect(screen.getAllByTestId('overview-header')[0]).toHaveTextContent('Semester 1')
    expect(screen.getByTestId('overview-placeholder')).toHaveTextContent('Elective module')
  })
})

describe('board view switch', () => {
  it('mounts the overview for printing only while the board is shown', async () => {
    renderBoard(makePlan())
    const board = await screen.findByRole('radio', { name: 'Planungsboard' })
    expect(board).toBeChecked()
    expect(screen.getByRole('region', { name: /^1\. Semester/ })).toBeInTheDocument()
    expect(screen.queryByTestId('plan-overview')).not.toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('beforeprint'))
    })
    expect(screen.getByTestId('plan-overview').parentElement).toHaveClass('hidden', 'print:block')

    act(() => {
      window.dispatchEvent(new Event('afterprint'))
    })
    expect(screen.queryByTestId('plan-overview')).not.toBeInTheDocument()
  })

  it('shows the overview and remembers the choice', async () => {
    const user = userEvent.setup()
    const { unmount } = renderBoard(makePlan())
    await user.click(await screen.findByRole('radio', { name: 'Studienverlaufsplan' }))

    expect(screen.getByRole('radio', { name: 'Studienverlaufsplan' })).toBeChecked()
    expect(screen.queryByRole('region', { name: /^1\. Semester/ })).not.toBeInTheDocument()
    expect(screen.getByTestId('plan-overview').parentElement).not.toHaveClass('hidden')
    expect(window.localStorage.getItem(BOARD_VIEW_STORAGE_KEY)).toBe('overview')

    unmount()
    renderBoard(makePlan())
    expect(await screen.findByRole('radio', { name: 'Studienverlaufsplan' })).toBeChecked()
    expect(screen.queryByRole('region', { name: /^1\. Semester/ })).not.toBeInTheDocument()
  })
})
