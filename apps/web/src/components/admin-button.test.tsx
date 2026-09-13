import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import { AdminButton } from './admin-button.tsx'

const session = vi.hoisted(() => ({ role: null as string | null }))

vi.mock('./account-sync.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./account-sync.tsx')>()),
  useAccountSync: () => ({
    user: session.role === null ? null : { id: 'u1', email: 'someone@example.org', role: session.role },
  }),
}))

function renderAt(path: string) {
  const rootRoute = createRootRoute({ component: () => <AdminButton /> })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(<RouterProvider router={router} />)
}

beforeEach(async () => {
  await i18n.changeLanguage('de')
})

describe('admin button', () => {
  it.each(['admin', 'superadmin'])('shows the way to the dashboard for the %s role', async (role) => {
    session.role = role
    renderAt('/')
    expect(await screen.findByRole('button', { name: 'Zur Verwaltung' })).toBeInTheDocument()
  })

  it.each([null, 'user'])('stays hidden for %s', async (role) => {
    session.role = role
    renderAt('/')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('button', { name: 'Zur Verwaltung' })).not.toBeInTheDocument()
  })
})
