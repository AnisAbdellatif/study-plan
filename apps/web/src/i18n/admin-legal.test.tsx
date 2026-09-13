import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'
import i18n from './index.ts'

function renderApp(path: string) {
  const store = createGuestStore(window.localStorage)
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={router} />
    </GuestStoreContext.Provider>,
  )
  return { user: userEvent.setup() }
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('admin dashboard in English', () => {
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  const stats = {
    users: { total: 12_345, verified: 10_200, newLast30Days: 3, activeLast30Days: 7 },
    plans: {
      total: 9,
      byPreset: [
        {
          presetId: 'luh/technische-informatik-bsc-2026',
          programmeName: 'Technische Informatik',
          universityName: 'Leibniz Universität Hannover',
          poVersion: 'PO 2017 in der Fassung ab WS 2026/27',
          plans: 9,
        },
      ],
    },
    shares: { active: 2 },
    reminders: { enabled: 4, sentLast30Days: 11 },
  }
  const users = [
    {
      id: 'u1',
      email: 'studi@example.org',
      emailVerified: false,
      createdAt: '2026-09-01T10:00:00Z',
      lastActiveAt: null,
      plans: 1,
      activeShares: 2,
      reminders: false,
    },
  ]

  it('shows English labels, English number formatting and action messages', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === '/api/admin/me') return respond({ email: 'admin@example.org' })
      if (url === '/api/admin/stats') return respond(stats)
      if (url.startsWith('/api/admin/users?q=')) return respond({ users })
      if (url === '/api/admin/audit')
        return respond({
          entries: [
            {
              id: 'a1',
              action: 'revoke_shares',
              targetUserId: 'u9',
              adminEmail: 'admin@example.org',
              createdAt: '2026-09-10T10:00:00Z',
            },
          ],
        })
      if (url === '/api/admin/users/u1/revoke-shares' && init?.method === 'POST')
        return respond({ revoked: 2 })
      return respond({ error: 'not_found' }, 404)
    })
    try {
      const { user } = renderApp('/admin')
      expect(await screen.findByRole('heading', { name: 'Admin dashboard' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Accounts' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Audit log' })).toBeInTheDocument()
      expect(await screen.findByText('10,200 confirmed, 3 new in the last 30 days')).toBeInTheDocument()
      expect(screen.getByText('12,345')).toBeInTheDocument()
      expect(screen.getByText('PO 2017 in der Fassung ab WS 2026/27')).toBeInTheDocument()
      expect(await screen.findByText('Shared links deactivated')).toBeInTheDocument()

      const row = (await screen.findByText('studi@example.org')).closest('tr')
      if (!row) throw new Error('expected a table row')
      expect(within(row).getByText('not confirmed')).toBeInTheDocument()
      expect(within(row).getByText(/^1 Sept? 2026$/)).toBeInTheDocument()

      await user.click(within(row).getByRole('button', { name: 'Deactivate links' }))
      const dialog = await screen.findByRole('alertdialog')
      expect(
        within(dialog).getByText('All active links from studi@example.org will stop working.'),
      ).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }))

      expect(await screen.findByText('2 links from studi@example.org deactivated.')).toBeInTheDocument()
    } finally {
      fetchMock.mockRestore()
    }
  })
})

describe('legal pages in English', () => {
  it('marks the privacy policy as a courtesy translation and switches to German', async () => {
    const { user } = renderApp('/privacy')
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy policy' })).toBeInTheDocument()
    expect(
      screen.getByText('This is a courtesy translation. Only the German version is legally binding.'),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/Section 25\(2\) no\. 2 TDDDG/)).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'account page' })).toHaveAttribute('href', '/account')
    expect(screen.getAllByText('[Hosting provider]').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Show German version' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Datenschutzerklärung' })).toBeInTheDocument()
    expect(screen.queryByText(/courtesy translation/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Kontoseite' })).toHaveAttribute('href', '/account')
    expect(screen.getByText(/Wir führen keine Zugriffsprotokolle mit IP-Adressen/)).toBeInTheDocument()
  })

  it('marks the legal notice as a courtesy translation and switches to German', async () => {
    const { user } = renderApp('/legal-notice')
    expect(await screen.findByRole('heading', { level: 1, name: 'Legal notice' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Information pursuant to Section 5 DDG' })).toBeInTheDocument()
    expect(
      screen.getByText('This is a courtesy translation. Only the German version is legally binding.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show German version' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Impressum' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Angaben gemäß § 5 DDG' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show German version' })).not.toBeInTheDocument()
  })
})
