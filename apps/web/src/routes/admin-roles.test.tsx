import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const stats = {
  users: { total: 3, verified: 3, newLast30Days: 3, activeLast30Days: 1 },
  plans: { total: 0, byPreset: [] },
  shares: { active: 0 },
  reminders: { enabled: 0, sentLast30Days: 0 },
}

const account = (id: string, email: string, role: string) => ({
  id,
  email,
  emailVerified: true,
  role,
  createdAt: '2026-09-01T10:00:00Z',
  lastActiveAt: null,
  plans: 0,
  activeShares: 0,
  reminders: false,
})

const superadmin = account('s', 'chef@example.org', 'superadmin')
const admin = account('a', 'admin@example.org', 'admin')
const student = account('u', 'studi@example.org', 'user')

function mockApi(role: 'admin' | 'superadmin', email: string) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (url === '/api/admin/me') return respond({ email, role })
    if (url === '/api/admin/stats') return respond(stats)
    if (url === '/api/admin/audit') return respond({ entries: [] })
    if (url === '/api/admin/settings') return respond({ maxPlansPerUser: 4 })
    if (url === '/api/admin/chat')
      return respond({ enabled: true, dailyLimit: 20, configured: false, model: null })
    if (url.startsWith('/api/admin/users?') && url.includes('role=admin'))
      return respond({ users: [superadmin, admin] })
    if (url.startsWith('/api/admin/users?')) return respond({ users: [superadmin, admin, student] })
    if (url === '/api/admin/admins' && init?.method === 'POST') return respond({ id: 'n' }, 201)
    return respond({ error: 'not_found' }, 404)
  })
}

function renderAdmin() {
  render(
    <GuestStoreContext.Provider value={createGuestStore(window.localStorage)}>
      <RouterProvider router={createAppRouter(createMemoryHistory({ initialEntries: ['/admin'] }))} />
    </GuestStoreContext.Provider>,
  )
  return userEvent.setup()
}

const rowOf = (section: HTMLElement, email: string) => {
  const row = within(section).getByText(email).closest('tr')
  if (!row) throw new Error(`no row for ${email}`)
  return row
}

beforeEach(async () => {
  await i18n.changeLanguage('de')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('admin roles in the dashboard', () => {
  it('lets the superadmin manage admins and keeps the superadmin account untouchable', async () => {
    const fetchMock = mockApi('superadmin', 'chef@example.org')
    const user = renderAdmin()

    const team = await screen.findByRole('region', { name: 'Admins' })
    const accounts = screen.getByRole('region', { name: 'Konten' })
    await waitFor(() => expect(within(accounts).getByText('studi@example.org')).toBeInTheDocument())

    expect(
      within(rowOf(accounts, 'studi@example.org')).getByRole('button', { name: 'Zum Admin machen' }),
    ).toBeVisible()
    expect(
      within(rowOf(accounts, 'admin@example.org')).getByRole('button', { name: 'Adminrechte entziehen' }),
    ).toBeVisible()
    expect(within(rowOf(accounts, 'chef@example.org')).queryAllByRole('button')).toEqual([])

    await user.type(within(team).getByLabelText('E-Mail-Adresse'), 'Neu@example.org')
    await user.type(within(team).getByLabelText('Startpasswort'), 'ein-startpasswort')
    await user.click(within(team).getByRole('button', { name: 'Admin anlegen' }))

    expect(await within(team).findByText('Admin neu@example.org angelegt.')).toBeInTheDocument()
    const createCall = fetchMock.mock.calls.find(([url]) => url === '/api/admin/admins')
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      email: 'Neu@example.org',
      password: 'ein-startpasswort',
    })
  })

  it('hides admin management from regular admins', async () => {
    mockApi('admin', 'admin@example.org')
    renderAdmin()

    const accounts = await screen.findByRole('region', { name: 'Konten' })
    await waitFor(() => expect(within(accounts).getByText('studi@example.org')).toBeInTheDocument())
    expect(screen.queryByRole('region', { name: 'Admins' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Zum Admin machen' })).not.toBeInTheDocument()
    expect(within(rowOf(accounts, 'chef@example.org')).getByText('geschützt')).toBeInTheDocument()
    expect(within(rowOf(accounts, 'admin@example.org')).getByText('über die Kontoseite')).toBeInTheDocument()
    expect(
      within(rowOf(accounts, 'studi@example.org')).getByRole('button', { name: 'Löschen…' }),
    ).toBeVisible()
  })
})
