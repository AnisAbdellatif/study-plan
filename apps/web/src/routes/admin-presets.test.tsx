import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

const informatik = {
  id: '5b0c1a52-8f3e-4c1e-9a55-0c6f2d7e9b10',
  universityName: 'Universität Musterstadt',
  programmeName: 'Informatik',
  degree: 'bsc',
  poVersion: 'PO 2024',
  updatedAt: '2026-09-01T10:00:00Z',
}

const label = 'Informatik B.Sc., Universität Musterstadt, PO 2024'

function mockApi() {
  let presets = [informatik]
  let uploads = 0
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url === '/api/admin/me') return respond({ email: 'admin@example.org', role: 'admin' })
    if (url === '/api/admin/stats') return respond(stats)
    if (url === '/api/admin/audit') {
      return respond({
        entries: [
          {
            id: 'e1',
            adminEmail: 'admin@example.org',
            action: 'update_preset',
            targetUserId: informatik.id,
            createdAt: '2026-09-01T10:00:00Z',
          },
        ],
      })
    }
    if (url.startsWith('/api/admin/users?')) return respond({ users: [] })
    if (url === '/api/presets') return respond({ presets })
    if (url === '/api/admin/presets' && method === 'POST') {
      uploads += 1
      if (uploads === 1) {
        return respond(
          {
            error: 'invalid_preset',
            reason: 'invalid_preset',
            issues: [
              { path: 'university.name', message: 'Too small: expected string to have >=1 characters' },
            ],
          },
          400,
        )
      }
      if (uploads === 2) return respond({ error: 'preset_exists' }, 409)
      const created = { ...informatik, id: 'c0ffee00-0000-4000-8000-000000000001', poVersion: 'PO 2030' }
      presets = [...presets, created]
      return respond({ preset: created, warnings: [] }, 201)
    }
    if (url === `/api/admin/presets/${informatik.id}` && method === 'PUT') {
      return respond({ preset: informatik, warnings: [] })
    }
    if (url === `/api/admin/presets/${informatik.id}` && method === 'DELETE') {
      presets = presets.filter((preset) => preset.id !== informatik.id)
      return new Response(null, { status: 204 })
    }
    return respond({ error: 'not_found' }, 404)
  })
  return fetchMock
}

function renderAdmin() {
  render(
    <GuestStoreContext.Provider value={createGuestStore(window.localStorage)}>
      <RouterProvider router={createAppRouter(createMemoryHistory({ initialEntries: ['/admin'] }))} />
    </GuestStoreContext.Provider>,
  )
  return userEvent.setup()
}

const jsonFile = (text: string) => new File([text], 'programme.json', { type: 'application/json' })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('presets in the admin dashboard', () => {
  it('links back to the home page', async () => {
    mockApi()
    renderAdmin()
    const link = await screen.findByRole('link', { name: 'Zur Startseite' })
    expect(link).toHaveAttribute('href', '/')
  })

  it('adds presets and reports validation issues and duplicates', async () => {
    const fetchMock = mockApi()
    const user = renderAdmin()
    const section = await screen.findByRole('region', { name: 'Vorlagen' })
    expect(await within(section).findByText('Informatik B.Sc.')).toBeInTheDocument()
    const input = within(section).getByLabelText('Studiengangsdatei (JSON) für eine neue Vorlage auswählen')

    await user.upload(input, jsonFile('{"modules": []}'))
    const alert = await within(section).findByRole('alert')
    expect(alert).toHaveTextContent('Die Datei passt nicht zum Aufbau einer Studiengangsdatei.')
    expect(within(alert).getByText(/^university\.name: Too small/)).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(
      ([url, init]) => url === '/api/admin/presets' && init?.method === 'POST',
    )
    expect(post?.[1]?.body).toBe('{"modules": []}')

    await user.upload(input, jsonFile('{}'))
    expect(await within(section).findByText(/gibt es schon als Vorlage/)).toBeInTheDocument()

    await user.upload(input, jsonFile('{}'))
    expect(
      await within(section).findByText(
        'Vorlage Informatik B.Sc., Universität Musterstadt, PO 2030 hinzugefügt.',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(within(section).getAllByRole('row')).toHaveLength(3))
  })

  it('replaces and deletes a preset and labels preset actions in the audit log', async () => {
    const fetchMock = mockApi()
    const user = renderAdmin()
    const section = await screen.findByRole('region', { name: 'Vorlagen' })
    await within(section).findByText('Informatik B.Sc.')

    await user.click(within(section).getByRole('button', { name: `${label} ersetzen…` }))
    await user.upload(
      within(section).getByLabelText('Studiengangsdatei (JSON) zum Ersetzen auswählen'),
      jsonFile('{}'),
    )
    expect(await within(section).findByText(`Vorlage ${label} ersetzt.`)).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => url === `/api/admin/presets/${informatik.id}` && init?.method === 'PUT',
      ),
    ).toBe(true)

    await user.click(within(section).getByRole('button', { name: `${label} löschen…` }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Vorlage löschen?' })
    await user.click(within(dialog).getByRole('button', { name: 'Endgültig löschen' }))
    expect(await within(section).findByText(`Vorlage ${label} gelöscht.`)).toBeInTheDocument()
    expect(await within(section).findByText(/Noch keine Vorlagen/)).toBeInTheDocument()

    const audit = screen.getByRole('region', { name: 'Protokoll' })
    expect(within(audit).getByText('Vorlage ersetzt')).toBeInTheDocument()
    expect(within(audit).getByText(`· Vorlage ${informatik.id}`)).toBeInTheDocument()
  })

  it('shows the section in English', async () => {
    await i18n.changeLanguage('en')
    mockApi()
    renderAdmin()
    const section = await screen.findByRole('region', { name: 'Presets' })
    expect(within(section).getByRole('button', { name: 'Add preset' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to home' })).toBeInTheDocument()
  })
})
