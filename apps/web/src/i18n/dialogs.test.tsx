import {
  createGuestDocument,
  createPlanFromPreset,
  findModule,
  type Plan,
  type Preset,
} from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { GradeDialog } from '../components/board/grade-dialog.tsx'
import { ImportGradesDialog } from '../components/board/import-grades-dialog.tsx'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'
import { examplePreset, examplePreset2027, luhPreset } from '../test/fixtures.ts'
import i18n from './index.ts'

const PRESETS: Record<string, Preset> = {
  [examplePreset.id]: examplePreset,
  [examplePreset2027.id]: examplePreset2027,
  [luhPreset.id]: luhPreset,
}

const presetById = (id: string): Preset => {
  const preset = PRESETS[id]
  if (!preset) throw new Error(`expected the preset ${id}`)
  return preset
}

const planFrom = (id: string): Plan =>
  createPlanFromPreset(presetById(id), {
    id: 'plan-test',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })

function renderApp({ path = '/', plan }: { path?: string; plan?: Plan } = {}) {
  const store = createGuestStore(window.localStorage)
  if (plan) store.replacePlan(plan)
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={router} />
    </GuestStoreContext.Provider>,
  )
  return { store, user: userEvent.setup() }
}

function renderWithStore(plan: Plan, element: (plan: Plan) => React.ReactNode) {
  const store = createGuestStore(window.localStorage)
  store.replacePlan(plan)
  render(<GuestStoreContext.Provider value={store}>{element(plan)}</GuestStoreContext.Provider>)
  return { store, user: userEvent.setup() }
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('dialogs in English', () => {
  it('shows the grade dialog with English labels, grades with a decimal point and the attempt summary', async () => {
    const plan = planFrom('example/informatik-bsc-example-2027')
    const module = findModule(plan, 'INF-101')
    const user = userEvent.setup()
    render(<GradeDialog module={module} plan={plan} onSave={() => {}} onClose={() => {}} />)

    const dialog = await screen.findByRole('dialog', { name: 'Grundlagen der Programmierung' })
    const select = within(dialog).getByLabelText('Grade')
    expect(within(select).getByRole('option', { name: 'Still open' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: '1.3' })).toHaveValue('grade:1.3')
    expect(within(select).getByRole('option', { name: '5.0 (failed)' })).toHaveValue('grade:5')
    expect(within(select).getByRole('group', { name: 'No result' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'No-show' })).toBeInTheDocument()
    expect(within(dialog).getByText('Exam date')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

    await user.selectOptions(select, 'grade:5')
    await user.click(within(dialog).getByRole('button', { name: 'Add another attempt' }))
    await user.selectOptions(within(dialog).getByLabelText('Grade, attempt 2'), 'grade:5')
    expect(within(dialog).getByTestId('attempt-summary')).toHaveTextContent(
      '2 of 3 attempts used. Your next attempt is your last.',
    )
    expect(within(dialog).getByRole('button', { name: 'Remove attempt 2' })).toBeInTheDocument()
  })

  it('groups composite grades', async () => {
    const plan = planFrom('luh/technische-informatik-bsc-2026')
    render(
      <GradeDialog module={findModule(plan, 'GI-GDS')} plan={plan} onSave={() => {}} onClose={() => {}} />,
    )
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('group', { name: 'Grade steps' })).toBeInTheDocument()
    expect(within(dialog).getByRole('group', { name: 'Combined module grades' })).toBeInTheDocument()
  })

  it('shows pass/fail options for ungraded modules', async () => {
    const plan = planFrom('example/informatik-bsc-example')
    render(
      <GradeDialog module={findModule(plan, 'SQ-101')} plan={plan} onSave={() => {}} onClose={() => {}} />,
    )
    const select = within(await screen.findByRole('dialog')).getByLabelText('Result')
    expect(within(select).getByRole('option', { name: 'Passed' })).toHaveValue('passed')
    expect(within(select).getByRole('option', { name: 'Failed' })).toHaveValue('failed')
  })

  it('imports grades written with a decimal point and English result words', async () => {
    const { store, user } = renderWithStore(planFrom('example/informatik-bsc-example'), (plan) => (
      <ImportGradesDialog plan={plan} open onOpenChange={() => {}} />
    ))
    const dialog = await screen.findByRole('dialog', { name: 'Import grades' })

    fireEvent.change(within(dialog).getByLabelText('Text from your transcript'), {
      target: {
        value:
          'Module\tGrade\nGrundlagen der Programmierung\t1.3\nSchlüsselqualifikation: Wissenschaftliches Arbeiten\tpassed\nLinA 1\t1.7',
      },
    })
    expect(within(dialog).getByRole('columnheader', { name: 'Result' })).toBeInTheDocument()
    expect(within(dialog).getByText('1.3')).toBeInTheDocument()
    expect(within(dialog).getByText('passed')).toBeInTheDocument()
    expect(within(dialog).getByText('Please choose a module')).toBeInTheDocument()
    expect(within(dialog).getByText(/Skipped 1 line without a grade\./)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Apply 2 results' })).toBeEnabled()

    await user.selectOptions(within(dialog).getByLabelText('Module for line 4'), 'Lineare Algebra I')
    await user.click(within(dialog).getByRole('button', { name: 'Apply 3 results' }))
    await waitFor(() =>
      expect(store.getState().plan?.modules.find((m) => m.code === 'MAT-101')?.attempts[0]?.grade).toBe(1.7),
    )
  })

  it('explains in English why a plan file cannot be imported', async () => {
    const { user } = renderApp({ path: '/start' })
    const file = new File(['{"hello":"world"}'], 'notes.json', { type: 'application/json' })
    await user.upload(await screen.findByLabelText('Choose plan file'), file)

    const dialog = await screen.findByRole('dialog', { name: 'Import failed' })
    expect(dialog).toHaveTextContent('This file isn’t an export from this Study Planner.')
    expect(within(dialog).getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('asks in English before an import replaces the current plan', async () => {
    const plan = planFrom('example/informatik-bsc-example')
    const { user } = renderApp({ plan })
    const other = { ...plan, id: 'other', name: 'Second plan' }
    const file = new File([JSON.stringify(createGuestDocument(other))], 'other.json', {
      type: 'application/json',
    })
    await user.upload(await screen.findByLabelText('Choose plan file'), file)

    const dialog = await screen.findByRole('alertdialog', { name: 'Replace current plan?' })
    expect(dialog).toHaveTextContent('“Second plan” replaces your current plan in this browser.')
    expect(within(dialog).getByRole('button', { name: 'Replace' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('explains in English that sharing needs an account', async () => {
    const { user } = renderApp({ plan: planFrom('example/informatik-bsc-example') })
    await user.click(await screen.findByRole('button', { name: /Weitere Aktionen|More actions/ }))
    await user.click(await screen.findByRole('menuitem', { name: /Plan teilen…|Share plan…/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Share plan' })
    expect(dialog).toHaveTextContent(
      'To share, you need an account that stores your plan. Sign in or create an account.',
    )
    expect(within(dialog).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in')
    expect(within(dialog).getByRole('link', { name: 'create an account' })).toHaveAttribute(
      'href',
      '/sign-up',
    )
  })
})
