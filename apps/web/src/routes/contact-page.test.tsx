import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function renderAt(path: string) {
  render(
    <GuestStoreContext.Provider value={createGuestStore(window.localStorage)}>
      <RouterProvider router={createAppRouter(createMemoryHistory({ initialEntries: [path] }))} />
    </GuestStoreContext.Provider>,
  )
  return userEvent.setup()
}

function mockApi(contact: () => Response) {
  const posted: unknown[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (url === '/api/contact' && init?.method === 'POST') {
      posted.push(JSON.parse(String(init.body)))
      return contact()
    }
    return respond({ error: 'not_found' }, 404)
  })
  return posted
}

beforeEach(async () => {
  window.localStorage.clear()
  await i18n.changeLanguage('de')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('contact page', () => {
  it('is linked from the footer and sends the message', async () => {
    const posted = mockApi(() => respond({ sent: true }, 202))
    const user = renderAt('/privacy')
    const footer = await screen.findByRole('contentinfo')
    await user.click(within(footer).getByRole('link', { name: 'Kontakt' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Kontakt' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Name (optional)'), 'Erika')
    await user.type(screen.getByLabelText('Deine E-Mail-Adresse'), 'erika@example.org')
    await user.type(screen.getByLabelText('Nachricht'), 'Die Vorlage für Informatik ist veraltet.')
    await user.click(screen.getByRole('button', { name: 'Nachricht senden' }))

    expect(await screen.findByText('Danke für deine Nachricht!')).toBeInTheDocument()
    expect(
      screen.getByText('Wir melden uns so bald wie möglich unter erika@example.org.'),
    ).toBeInTheDocument()
    expect(posted).toEqual([
      {
        name: 'Erika',
        email: 'erika@example.org',
        message: 'Die Vorlage für Informatik ist veraltet.',
        locale: 'de',
      },
    ])
  })

  it('keeps the message and explains when too many were sent', async () => {
    mockApi(() => respond({ error: 'too_many_requests' }, 429))
    const user = renderAt('/contact')
    await user.type(await screen.findByLabelText('Deine E-Mail-Adresse'), 'erika@example.org')
    await user.type(screen.getByLabelText('Nachricht'), 'Noch eine Frage zum Planer.')
    await user.click(screen.getByRole('button', { name: 'Nachricht senden' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Du hast gerade mehrere Nachrichten geschickt.',
    )
    expect(screen.getByLabelText('Nachricht')).toHaveValue('Noch eine Frage zum Planer.')
  })

  it('links the privacy policy section about the form', async () => {
    mockApi(() => respond({ sent: true }, 202))
    renderAt('/contact')
    expect(await screen.findByRole('link', { name: 'Datenschutzerklärung' })).toHaveAttribute(
      'href',
      '/privacy#contact',
    )
  })
})
