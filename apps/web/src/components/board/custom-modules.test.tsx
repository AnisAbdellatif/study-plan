import { createPlanFromPreset, type Plan, setModuleResult } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.ts'
import { createAppRouter } from '../../router.tsx'
import { createGuestStore, GuestStoreContext } from '../../store/guest-store.ts'
import { examplePreset } from '../../test/fixtures.ts'
import { CustomModuleDialog } from './custom-module-dialog.tsx'

function makePlan(): Plan {
  return createPlanFromPreset(examplePreset, {
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

type User = ReturnType<typeof userEvent.setup>

async function createModule(user: User, name: string, credits: string) {
  const backlog = await screen.findByRole('region', { name: /^Nicht eingeplant/ })
  await user.click(within(backlog).getByRole('button', { name: 'Eigenes Modul hinzufügen' }))
  const dialog = await screen.findByRole('dialog', { name: 'Eigenes Modul hinzufügen' })
  await user.type(within(dialog).getByLabelText('Name'), name)
  await user.type(within(dialog).getByLabelText(/^Leistungspunkte/), credits)
  await user.click(within(dialog).getByRole('button', { name: 'Hinzufügen' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
}

describe('custom modules', () => {
  it('creates a module through the dialog, validating the fields', async () => {
    const { user, store } = renderBoard(makePlan())
    const backlog = await screen.findByRole('region', { name: /^Nicht eingeplant/ })
    await user.click(within(backlog).getByRole('button', { name: 'Eigenes Modul hinzufügen' }))
    const dialog = await screen.findByRole('dialog', { name: 'Eigenes Modul hinzufügen' })

    await user.type(within(dialog).getByLabelText(/^Leistungspunkte/), '0')
    await user.click(within(dialog).getByRole('button', { name: 'Hinzufügen' }))
    expect(within(dialog).getByText('Gib einen Namen ein.')).toBeInTheDocument()
    expect(within(dialog).getByText(/Gib eine Zahl größer als 0/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')

    await user.type(within(dialog).getByLabelText('Name'), 'Japanisch A1')
    await user.clear(within(dialog).getByLabelText(/^Leistungspunkte/))
    await user.type(within(dialog).getByLabelText(/^Leistungspunkte/), '2.5')
    await user.click(within(dialog).getByRole('button', { name: 'Hinzufügen' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const card = within(backlog).getByRole('heading', { name: 'Japanisch A1' }).closest('li')
    expect(card).toHaveTextContent('Eigenes Modul')
    expect(card).not.toHaveTextContent('custom')
    const module = store.getState().plan?.modules.find((m) => m.name === 'Japanisch A1')
    expect(card).not.toHaveTextContent(module?.code ?? 'custom-1')
    expect(module).toMatchObject({ custom: true, credits: 2.5, grading: 'graded', countsTowardAverage: true })
    expect(store.getState().plan?.backlog).toContain(module?.code)
    expect(await screen.findByText(/Japanisch A1 hinzugefügt/)).toBeInTheDocument()
  })

  it('edits name and credits and deletes after confirmation', async () => {
    const { user, store } = renderBoard(makePlan())
    await createModule(user, 'Japanisch A1', '5')

    await user.click(screen.getByRole('button', { name: 'Aktionen für Japanisch A1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Bearbeiten…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Japanisch A1 bearbeiten' })
    expect(within(dialog).getByLabelText(/^Leistungspunkte/)).toHaveValue(5)
    await user.clear(within(dialog).getByLabelText('Name'))
    await user.type(within(dialog).getByLabelText('Name'), 'Japanisch A2')
    await user.clear(within(dialog).getByLabelText(/^Leistungspunkte/))
    await user.type(within(dialog).getByLabelText(/^Leistungspunkte/), '3')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const custom = () => store.getState().plan?.modules.filter((m) => m.custom) ?? []
    expect(custom()).toMatchObject([{ name: 'Japanisch A2', credits: 3 }])

    await user.click(screen.getByRole('button', { name: 'Aktionen für Japanisch A2' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Löschen…' }))
    const confirm = await screen.findByRole('alertdialog', { name: '„Japanisch A2“ löschen?' })
    expect(confirm).toHaveTextContent('samt eingetragener Ergebnisse')
    await user.click(within(confirm).getByRole('button', { name: 'Löschen' }))

    await waitFor(() => expect(custom()).toEqual([]))
    expect(screen.queryByRole('heading', { name: 'Japanisch A2' })).not.toBeInTheDocument()
  })

  it('counts a graded custom module toward the overall grade', async () => {
    const { user } = renderBoard(setModuleResult(makePlan(), 'INF-101', { kind: 'graded', grade: 1.3 }))
    expect(await screen.findByTestId('overall-grade')).toHaveTextContent('1,3')
    await createModule(user, 'Japanisch A1', '5')

    await user.click(screen.getByRole('button', { name: 'Aktionen für Japanisch A1' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Note eintragen…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Japanisch A1' })
    await user.selectOptions(within(dialog).getByLabelText('Note'), '4,0')
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }))

    await waitFor(() => expect(screen.getByTestId('overall-grade')).not.toHaveTextContent('1,3'))
    expect(screen.getByTestId('overall-grade')).not.toHaveTextContent('–')
  })

  it('disables counting for ungraded modules', async () => {
    const { user, store } = renderBoard(makePlan())
    await user.click(await screen.findByRole('button', { name: 'Weitere Aktionen' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Eigenes Modul hinzufügen…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Eigenes Modul hinzufügen' })
    const counts = within(dialog).getByLabelText('zählt zum Notenschnitt')
    expect(counts).toBeChecked()
    expect(counts).toBeEnabled()

    await user.click(within(dialog).getByLabelText(/^unbenotet/))
    expect(counts).toBeDisabled()
    expect(counts).not.toBeChecked()
    expect(within(dialog).getByText('Unbenotete Module zählen nicht zum Schnitt.')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Name'), 'Sprachkurs')
    await user.type(within(dialog).getByLabelText(/^Leistungspunkte/), '2')
    await user.click(within(dialog).getByRole('button', { name: 'Hinzufügen' }))
    await waitFor(() =>
      expect(store.getState().plan?.modules.find((m) => m.name === 'Sprachkurs')).toMatchObject({
        grading: 'pass_fail',
        countsTowardAverage: false,
      }),
    )
  })

  it('explains when the programme cannot count custom modules', () => {
    const plan = makePlan()
    const fixed: Plan = {
      ...plan,
      rules: { ...plan.rules, aggregation: { ...plan.rules.aggregation, weightMode: 'fixed' } },
    }
    render(<CustomModuleDialog plan={fixed} target={{ mode: 'create' }} onSave={vi.fn()} onClose={vi.fn()} />)
    const dialog = screen.getByRole('dialog', { name: 'Eigenes Modul hinzufügen' })
    expect(within(dialog).getByLabelText('zählt zum Notenschnitt')).toBeDisabled()
    expect(dialog).toHaveTextContent('deshalb können eigene Module nicht mitzählen')
  })

  it('is labelled in English', async () => {
    await i18n.changeLanguage('en')
    const { user } = renderBoard(makePlan())
    await user.click(await screen.findByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Add custom module…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add custom module' })
    await user.type(within(dialog).getByLabelText('Name'), 'Japanese A1')
    await user.type(within(dialog).getByLabelText(/^Credits/), '5')
    expect(within(dialog).getByLabelText('counts toward the grade average')).toBeChecked()
    expect(within(dialog).getByLabelText('Offered in')).toHaveDisplayValue('winter and summer semester')
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))

    const backlog = await screen.findByRole('region', { name: /^Not planned/ })
    await waitFor(() =>
      expect(within(backlog).getByRole('heading', { name: 'Japanese A1' }).closest('li')).toHaveTextContent(
        'Custom module',
      ),
    )
    await user.click(within(backlog).getByRole('button', { name: 'Actions for Japanese A1' }))
    expect(await screen.findByRole('menuitem', { name: 'Edit…' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete…' })).toBeInTheDocument()
  })
})
