import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const stats = {
  users: { total: 1, verified: 1, newLast30Days: 1, activeLast30Days: 1 },
  plans: { total: 0, byPreset: [] },
  shares: { active: 0 },
  reminders: { enabled: 0, sentLast30Days: 0 },
}

beforeEach(async () => {
  await i18n.changeLanguage('de')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('mail delivery in the admin dashboard', () => {
  it('shows the last failure, checks the connection and sends a test e-mail', async () => {
    let status = {
      transport: 'smtp',
      from: 'Studienplaner <noreply@study-plan.de>',
      server: { host: 'mail.example.org', port: 465, secure: true, username: 'noreply@study-plan.de' },
      lastSuccess: null,
      lastFailure: { at: '2026-09-13T10:00:00Z', error: 'Invalid login: 535 Authentication failed' },
    } as Record<string, unknown>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === '/api/admin/me') return respond({ email: 'admin@example.org', role: 'admin' })
      if (url === '/api/admin/stats') return respond(stats)
      if (url === '/api/admin/audit') return respond({ entries: [] })
      if (url.startsWith('/api/admin/users?')) return respond({ users: [] })
      if (url === '/api/admin/mail') return respond(status)
      if (url === '/api/admin/mail/verify' && init?.method === 'POST')
        return respond({ ok: false, error: 'Invalid login: 535 Authentication failed' })
      if (url === '/api/admin/mail/test' && init?.method === 'POST') {
        status = { ...status, lastSuccess: { at: '2026-09-13T11:00:00Z' } }
        return respond({ ok: true, to: 'admin@example.org' })
      }
      return respond({ error: 'not_found' }, 404)
    })

    render(
      <GuestStoreContext.Provider value={createGuestStore(window.localStorage)}>
        <RouterProvider router={createAppRouter(createMemoryHistory({ initialEntries: ['/admin'] }))} />
      </GuestStoreContext.Provider>,
    )
    const user = userEvent.setup()

    const section = await screen.findByRole('region', { name: 'E-Mail-Versand' })
    expect(
      await within(section).findByText('mail.example.org:465 · verschlüsselt (SSL/TLS)'),
    ).toBeInTheDocument()
    expect(within(section).getByText(/Der letzte Versand ist fehlgeschlagen/)).toBeInTheDocument()
    expect(within(section).getByText('Invalid login: 535 Authentication failed')).toBeInTheDocument()

    await user.click(within(section).getByRole('button', { name: 'Verbindung prüfen' }))
    expect(
      await within(section).findByText('Verbindung fehlgeschlagen: Invalid login: 535 Authentication failed'),
    ).toBeInTheDocument()

    await user.click(within(section).getByRole('button', { name: 'Test-E-Mail an mich senden' }))
    expect(
      await within(section).findByText(
        'Test-E-Mail an admin@example.org gesendet. Schau auch in den Spam-Ordner.',
      ),
    ).toBeInTheDocument()
    expect(await within(section).findByText(/Der E-Mail-Versand funktioniert/)).toBeInTheDocument()
  })
})
