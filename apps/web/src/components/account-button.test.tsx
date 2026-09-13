import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import { AccountButton } from './account-button.tsx'

const mocks = vi.hoisted(() => ({
  signedIn: true,
  signOut: vi.fn(async () => ({})),
  stop: vi.fn(),
}))

vi.mock('../lib/auth-client.ts', () => ({ authClient: { signOut: mocks.signOut } }))

vi.mock('./account-sync.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./account-sync.tsx')>()),
  useAccountSync: () => ({
    user: mocks.signedIn ? { id: 'u1', email: 'studi@example.org', role: 'user' } : null,
    state: { kind: 'synced', savedAt: '2026-09-13T10:00:00Z' },
    sessionPending: false,
    sync: { stop: mocks.stop },
  }),
}))

function renderAt(path: string) {
  const rootRoute = createRootRoute({ component: () => <AccountButton /> })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(async () => {
  await i18n.changeLanguage('de')
  mocks.signOut.mockClear()
  mocks.stop.mockClear()
})

describe('account button', () => {
  it('signs out from the account menu and stops syncing', async () => {
    mocks.signedIn = true
    const router = renderAt('/plan/update')
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Konto/ }))
    expect(await screen.findByText('studi@example.org')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Konto verwalten' })).toBeInTheDocument()

    await user.click(screen.getByRole('menuitem', { name: 'Abmelden' }))
    await vi.waitFor(() => expect(mocks.stop).toHaveBeenCalled())
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/start'))
    // Signing out also removes the plan from this browser.
    expect(window.localStorage.getItem('study-plan:guest')).toBeNull()
  })

  it('offers to sign in when signed out, except on the sign-in page itself', async () => {
    mocks.signedIn = false
    renderAt('/start')
    expect(await screen.findByRole('link', { name: 'Anmelden' })).toBeInTheDocument()
  })

  it('stays out of the way on the sign-in page', async () => {
    mocks.signedIn = false
    renderAt('/sign-in')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('link', { name: 'Anmelden' })).not.toBeInTheDocument()
  })
})
