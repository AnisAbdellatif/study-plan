import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'

const session = vi.hoisted(() => ({ signedIn: false, pending: false }))

vi.mock('../components/account-sync.tsx', async (importOriginal) => {
  const original = await importOriginal<typeof import('../components/account-sync.tsx')>()
  return {
    ...original,
    useAccountSync: () => ({
      user: session.signedIn ? { id: 'u1', email: 'studi@example.org', role: 'user' } : null,
      sessionPending: session.pending,
      state: { kind: 'signed_out' },
      sync: {},
    }),
  }
})

function renderStart() {
  render(
    <GuestStoreContext.Provider value={createGuestStore(window.localStorage)}>
      <RouterProvider router={createAppRouter(createMemoryHistory({ initialEntries: ['/start'] }))} />
    </GuestStoreContext.Provider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('de')
  window.localStorage.clear()
})

describe('sign-in link on the start page', () => {
  it('is shown to visitors who are not signed in', async () => {
    session.signedIn = false
    session.pending = false
    renderStart()
    expect(await screen.findByRole('link', { name: 'Schon ein Konto? Anmelden' })).toBeInTheDocument()
  })

  it('is hidden once signed in', async () => {
    session.signedIn = true
    session.pending = false
    renderStart()
    expect(await screen.findByRole('heading', { level: 1, name: 'Studienplan anlegen' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Schon ein Konto? Anmelden' })).not.toBeInTheDocument()
  })

  it('does not flash while the session is loading', async () => {
    session.signedIn = false
    session.pending = true
    renderStart()
    expect(await screen.findByRole('heading', { level: 1, name: 'Studienplan anlegen' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Schon ein Konto? Anmelden' })).not.toBeInTheDocument()
  })
})
