import { createPlanFromPreset, type Plan, setModuleResult } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n/index.ts'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'
import { examplePreset, examplePreset2027 } from '../test/fixtures.ts'
import { UPDATE_DRAFT_KEY } from './update-programme-page.tsx'

const makePlan = (): Plan =>
  setModuleResult(
    setModuleResult(
      createPlanFromPreset(examplePreset, {
        id: 'plan-test',
        startTerm: { season: 'winter', year: 2026 },
        now: new Date('2026-09-13T10:00:00Z'),
      }),
      'MAT-101',
      { kind: 'graded', grade: 1.7 },
    ),
    'INF-101',
    { kind: 'graded', grade: 2.3 },
  )

function renderApp({ path = '/plan/update', plan }: { path?: string; plan?: Plan | null } = {}) {
  const store = createGuestStore(window.localStorage)
  if (plan !== null) store.replacePlan(plan ?? makePlan())
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={router} />
    </GuestStoreContext.Provider>,
  )
  return { store, router, user: userEvent.setup() }
}

const fenced = (data: unknown) => ['```json', JSON.stringify(data, null, 2), '```'].join('\n')

/** The successor programme as the LLM is told to return it: continuing modules keep the plan's codes. */
const answer2027 = fenced(JSON.parse(JSON.stringify(examplePreset2027).replaceAll('"MAT-111"', '"MAT-101"')))

async function pasteAndCheck(user: ReturnType<typeof userEvent.setup>, answer: string) {
  await user.click(screen.getByLabelText('Antwort des Sprachmodells'))
  await user.paste(answer)
  await user.click(screen.getByRole('button', { name: 'Antwort prüfen' }))
}

beforeEach(() => window.sessionStorage.clear())
afterEach(() => window.sessionStorage.clear())

describe('updating the programme data', () => {
  it('sends visitors without a plan to the start page', async () => {
    const { router } = renderApp({ plan: null })
    expect(await screen.findByRole('heading', { name: 'Studienplan anlegen' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/start')
  })

  it('opens from the board menu with the fields prefilled and the plan modules in the prompt', async () => {
    const { user, router } = renderApp({ path: '/' })
    await user.click(await screen.findByRole('button', { name: 'Weitere Aktionen' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Studiengangsdaten aktualisieren…' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Studiengangsdaten aktualisieren' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/plan/update')
    expect(screen.getByLabelText('Hochschule')).toHaveValue('Beispiel-Universität')
    expect(screen.getByLabelText('Studiengang')).toHaveValue('Informatik')
    // Left empty so the LLM's version from the new documents wins; the current one is shown in the hint.
    expect(screen.getByLabelText('Version der Prüfungsordnung (optional)')).toHaveValue('')
    expect(screen.getByText(/Aktuell: PO 2024 \(fiktiv\)\./)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Prompt erstellen' }))
    const prompt = (screen.getByLabelText('Prompt') as HTMLTextAreaElement).value
    expect(prompt).toContain('# Existing plan')
    expect(prompt).toContain('`MAT-101`')
  })

  it('previews the changes of a newer PO and applies them after confirming', async () => {
    const { user, store } = renderApp()
    const poField = await screen.findByLabelText('Version der Prüfungsordnung (optional)')
    await user.clear(poField)
    await user.type(poField, 'PO 2027 (fiktiv)')
    await user.click(screen.getByRole('button', { name: 'Prompt erstellen' }))
    await pasteAndCheck(user, answer2027)

    expect(await screen.findByText('Die Antwort passt')).toBeInTheDocument()
    const changes = screen.getByRole('region', { name: '4. Änderungen prüfen' })
    expect(
      within(changes).getByText(
        'Noten, Platzierungen und Prüfungstermine bleiben erhalten, wo sie noch passen.',
      ),
    ).toBeInTheDocument()
    expect(within(changes).getByText(/^Neue Module/)).toBeInTheDocument()
    expect(within(changes).getByText('Maschinelles Lernen')).toBeInTheDocument()
    expect(within(changes).getByText('IT-Sicherheit: wird aus dem Plan entfernt')).toBeInTheDocument()
    expect(within(changes).getByText(/^Geänderte Module/)).toBeInTheDocument()
    expect(within(changes).getByText(/^Lineare Algebra: /)).toBeInTheDocument()

    await user.click(within(changes).getByRole('button', { name: 'Plan aktualisieren' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Plan aktualisieren?' })
    expect(store.getState().plan?.preset.poVersion).toBe('PO 2024 (fiktiv)')
    await user.click(within(dialog).getByRole('button', { name: 'Aktualisieren' }))

    expect(await screen.findByRole('heading', { name: '1. Semester' })).toBeInTheDocument()
    const plan = store.getState().plan
    if (!plan) throw new Error('expected a plan')
    const find = (code: string) => plan.modules.find((module) => module.code === code)
    expect(find('MAT-101')?.name).toBe('Lineare Algebra')
    expect(find('MAT-101')?.attempts[0]?.grade).toBe(1.7)
    expect(find('INF-101')?.attempts[0]?.grade).toBe(2.3)
    expect(find('WP-402')).toBeUndefined()
    expect(find('WP-403')).toBeDefined()
    expect(plan.backlog).toContain('WP-403')
    expect(plan.preset.id).toBe('example/informatik-bsc-example')
    expect(plan.preset.poVersion).toBe('PO 2027 (fiktiv)')
    expect(screen.getAllByText(/PO 2027 \(fiktiv\)/).length).toBeGreaterThan(0)
    expect(screen.getByTestId('overall-grade')).not.toHaveTextContent('–')
    expect(window.sessionStorage.getItem(UPDATE_DRAFT_KEY)).toBeNull()
  })

  it('says that nothing changes when the answer matches the plan', async () => {
    const { user } = renderApp()
    await user.click(await screen.findByRole('button', { name: 'Prompt erstellen' }))
    await pasteAndCheck(user, fenced(examplePreset))

    expect(
      await screen.findByText('Mit dieser Antwort ändert sich nichts an deinem Plan.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Plan aktualisieren' })).not.toBeInTheDocument()
  })

  it('shows the update page in English', async () => {
    await i18n.changeLanguage('en')
    const { user } = renderApp()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Update programme data' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to your plan' })).toBeInTheDocument()
    expect(screen.getByText('when the module handbook was updated,')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create prompt' }))
    expect(screen.getByText(/The prompt lists the modules of your plan/)).toBeInTheDocument()
    await user.click(screen.getByLabelText('Answer from the language model'))
    await user.paste(fenced(examplePreset))
    await user.click(screen.getByRole('button', { name: 'Check answer' }))
    expect(await screen.findByRole('heading', { name: '4. Review the changes' })).toBeInTheDocument()
    expect(screen.getByText('This answer doesn’t change anything in your plan.')).toBeInTheDocument()
  })
})
