import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import { ASSISTANT_CONSENT_KEY, StudyAssistant } from './study-assistant.tsx'

vi.mock('./account-sync.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./account-sync.tsx')>()),
  useAccountSync: () => ({
    user: { id: 'u1', email: 'studi@example.org', role: 'user' },
    state: { kind: 'synced', savedAt: '2026-09-13T10:00:00Z' },
    sessionPending: false,
    sync: { linkedPlanId: () => 'plan-1' },
  }),
}))

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function mockApi(
  answer: () => Response,
  status: object = { available: true, dailyLimit: 20, remaining: 20 },
) {
  const posted: unknown[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (url === '/api/chat/status') return respond(status)
    if (url === '/api/chat' && init?.method === 'POST') {
      posted.push(JSON.parse(String(init.body)))
      return answer()
    }
    return respond({ error: 'not_found' }, 404)
  })
  return posted
}

function renderAssistant(onOpenModule = vi.fn()) {
  const rootRoute = createRootRoute({ component: () => <StudyAssistant onOpenModule={onOpenModule} /> })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  return { onOpenModule, user: userEvent.setup() }
}

beforeEach(async () => {
  await i18n.changeLanguage('de')
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('study assistant', () => {
  it('asks for consent once, sends only the plan id and the conversation, and links the modules it names', async () => {
    const posted = mockApi(() =>
      respond({
        reply: 'Programmieren I (INF-101) wird im Wintersemester angeboten.',
        modules: [{ code: 'INF-101', name: 'Programmieren I' }],
        remaining: 19,
      }),
    )
    const { user, onOpenModule } = renderAssistant()

    await user.click(await screen.findByRole('button', { name: 'Verstanden, Assistent nutzen' }))
    expect(window.localStorage.getItem(ASSISTANT_CONSENT_KEY)).toBe('1')

    await user.type(screen.getByLabelText('Deine Frage'), 'Wann wird Programmieren I angeboten?')
    await user.click(screen.getByRole('button', { name: 'Senden' }))

    expect(
      await screen.findByText('Programmieren I (INF-101) wird im Wintersemester angeboten.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Heute noch 19 Nachrichten')).toBeInTheDocument()
    expect(posted).toEqual([
      {
        planId: 'plan-1',
        locale: 'de',
        messages: [{ role: 'user', content: 'Wann wird Programmieren I angeboten?' }],
      },
    ])

    await user.click(screen.getByRole('button', { name: 'Programmieren I' }))
    expect(onOpenModule).toHaveBeenCalledWith('INF-101')
  })

  it('renders answers as Markdown without raw HTML, images or unsafe links', async () => {
    window.localStorage.setItem(ASSISTANT_CONSENT_KEY, '1')
    mockApi(() =>
      respond({
        reply: [
          '### Wahlmodule',
          '',
          '**Wichtig:** zwei Module im Sommer.',
          '',
          '- Robotik (INF-310)',
          '- Bildverarbeitung (INF-320)',
          '',
          '| Modul | LP |',
          '| --- | --- |',
          '| Robotik | 6 |',
          '',
          '[Handbuch](https://example.org/handbuch) [Trick](javascript:alert(1)) <b>roh</b> ![Bild](https://example.org/x.png)',
        ].join('\n'),
        modules: [],
        remaining: 19,
      }),
    )
    const { user } = renderAssistant()

    await user.type(await screen.findByLabelText('Deine Frage'), 'Welche Wahlmodule gibt es?')
    await user.click(screen.getByRole('button', { name: 'Senden' }))

    const log = await screen.findByRole('log')
    expect((await screen.findByText('Wichtig:')).tagName).toBe('STRONG')
    expect(screen.getByText('Wahlmodule').tagName).toBe('P')
    expect(screen.getByText('Bildverarbeitung (INF-320)').tagName).toBe('LI')
    expect(screen.getByRole('cell', { name: '6' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Handbuch' })).toHaveAttribute(
      'href',
      'https://example.org/handbuch',
    )
    expect(screen.queryByRole('link', { name: 'Trick' })).not.toBeInTheDocument()
    expect(log.querySelector('b, img')).toBeNull()
  })

  it('shows no countdown for an account without a daily limit', async () => {
    window.localStorage.setItem(ASSISTANT_CONSENT_KEY, '1')
    mockApi(() => respond({ reply: 'Ja.', modules: [], remaining: null }), {
      available: true,
      dailyLimit: 20,
      unlimited: true,
      remaining: null,
    })
    const { user } = renderAssistant()

    expect(await screen.findByText('Ohne Tageslimit')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Deine Frage'), 'Geht das?')
    await user.click(screen.getByRole('button', { name: 'Senden' }))
    expect(await screen.findByText('Ja.')).toBeInTheDocument()
    expect(screen.getByText('Ohne Tageslimit')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Senden' })).toBeInTheDocument()
  })

  it('explains a used-up daily limit and keeps the question', async () => {
    window.localStorage.setItem(ASSISTANT_CONSENT_KEY, '1')
    mockApi(() => respond({ error: 'chat_quota_exceeded', dailyLimit: 20 }, 429))
    const { user } = renderAssistant()

    await user.type(await screen.findByLabelText('Deine Frage'), 'Noch eine Frage')
    await user.click(screen.getByRole('button', { name: 'Senden' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Du hast heute alle 20 Nachrichten genutzt.')
    expect(screen.getByLabelText('Deine Frage')).toHaveValue('Noch eine Frage')
  })
})
