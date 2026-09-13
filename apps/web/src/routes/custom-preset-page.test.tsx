import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import example from '../../../../presets/example/informatik-bsc-example.json'
import i18n from '../i18n/index.ts'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'
import { DRAFT_KEY } from './custom-preset-page.tsx'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

function renderApp(path = '/start/custom') {
  const store = createGuestStore(window.localStorage)
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  const user = userEvent.setup()
  // userEvent installs its own clipboard stub, so ours goes in afterwards.
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  const view = render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={router} />
    </GuestStoreContext.Provider>,
  )
  return { store, user, writeText, view }
}

const withDetails = {
  ...example,
  modules: example.modules.map((module, index) =>
    index === 0 ? { ...module, details: { englishName: 'Programming Basics', sws: 4 } } : module,
  ),
}

const validAnswer = [
  'Hier ist das Ergebnis:',
  '',
  '```json',
  JSON.stringify(withDetails, null, 2),
  '```',
  '',
  'Viel Erfolg im Studium!',
].join('\n')

async function describeProgramme(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Hochschule'), 'Universität Musterstadt')
  await user.type(screen.getByLabelText('Studiengang'), 'Medieninformatik')
  await user.click(screen.getByRole('button', { name: 'Prompt erstellen' }))
}

async function pasteAnswer(user: ReturnType<typeof userEvent.setup>, answer: string) {
  await user.click(screen.getByLabelText('Antwort des Sprachmodells'))
  await user.paste(answer)
  await user.click(screen.getByRole('button', { name: 'Antwort prüfen' }))
}

beforeEach(() => window.sessionStorage.clear())

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
  window.sessionStorage.clear()
})

describe('custom preset page', () => {
  it('is linked from the start page', async () => {
    const { user } = renderApp('/start')
    await user.click(await screen.findByRole('link', { name: 'Eigenen Studiengang hinzufügen' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Eigenen Studiengang hinzufügen' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1. Studiengang beschreiben' })).toBeInTheDocument()
  })

  it('generates and copies the prompt', async () => {
    const { user, writeText } = renderApp()
    expect(await screen.findByRole('button', { name: 'Prompt erstellen' })).toBeDisabled()
    await describeProgramme(user)

    const prompt = screen.getByLabelText('Prompt') as HTMLTextAreaElement
    expect(prompt.value).toContain('# Task')
    expect(prompt.value).toContain('Universität Musterstadt')

    await user.click(screen.getByRole('button', { name: 'Prompt kopieren' }))
    expect(writeText).toHaveBeenCalledWith(prompt.value)
    expect(await screen.findByText('Kopiert')).toBeInTheDocument()
  })

  it('lists the issues of an invalid answer and copies a follow-up for the LLM', async () => {
    const { user, writeText } = renderApp()
    await describeProgramme(user)
    await pasteAnswer(user, 'Klar!\n```json\n{"modules": []}\n```')

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Die Antwort passt noch nicht')).toBeInTheDocument()
    expect(within(alert).getAllByRole('listitem').length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: '4. Plan anlegen' })).not.toBeInTheDocument()

    await user.click(
      within(alert).getByRole('button', { name: 'Fehlerbericht für das Sprachmodell kopieren' }),
    )
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('Your JSON does not match the required schema.'),
    )
  })

  it('previews a valid answer and creates a plan from it', async () => {
    const { user, store } = renderApp()
    await describeProgramme(user)
    await pasteAnswer(user, validAnswer)

    expect(await screen.findByText('Die Antwort passt')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`^${example.modules.length} Module, davon`))).toBeInTheDocument()
    expect(
      screen.getByText(`1 von ${example.modules.length} Modulen mit Angaben aus dem Modulkatalog`),
    ).toBeInTheDocument()
    const notes = screen.getByText('Hinweise des Sprachmodells').closest('details')
    if (!notes) throw new Error('expected the notes section')
    expect(within(notes).getByText(/Fictional example preset/)).toHaveClass('whitespace-pre-line')

    await user.click(screen.getByLabelText('Wintersemester'))
    await user.click(screen.getByRole('button', { name: 'Plan anlegen' }))

    expect(await screen.findByRole('heading', { name: '1. Semester' })).toBeInTheDocument()
    const plan = store.getState().plan
    expect(plan?.preset.universityName).toBe('Universität Musterstadt')
    expect(plan?.preset.programmeName).toBe('Medieninformatik')
    expect(plan?.preset.id).toMatch(/^custom\//)
    expect(plan?.startTerm.season).toBe('winter')
    expect(plan?.modules.find((module) => module.code === example.modules[0]?.code)?.details).toEqual({
      englishName: 'Programming Basics',
      sws: 4,
    })
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('keeps the draft in sessionStorage', async () => {
    const first = renderApp()
    await describeProgramme(first.user)
    await first.user.click(screen.getByLabelText('Antwort des Sprachmodells'))
    await first.user.paste('noch nicht fertig')
    first.view.unmount()

    renderApp()
    expect(await screen.findByLabelText('Hochschule')).toHaveValue('Universität Musterstadt')
    expect(screen.getByLabelText('Studiengang')).toHaveValue('Medieninformatik')
    expect(screen.getByLabelText('Antwort des Sprachmodells')).toHaveValue('noch nicht fertig')
    expect((screen.getByLabelText('Prompt') as HTMLTextAreaElement).value).toContain('Medieninformatik')
  })

  it('shows English headings', async () => {
    await i18n.changeLanguage('en')
    const { user } = renderApp()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Add your own programme' }),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText('University'), 'Example University')
    await user.type(screen.getByLabelText('Degree programme'), 'Computer Science')
    await user.click(screen.getByRole('button', { name: 'Create prompt' }))
    expect(screen.getByRole('heading', { name: '1. Describe your programme' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '2. Give the prompt to a language model' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '3. Paste the answer' })).toBeInTheDocument()
  })
})
