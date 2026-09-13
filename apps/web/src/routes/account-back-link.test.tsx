import { createGuestDocument, createPlanFromPreset } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'
import { examplePreset } from '../test/fixtures.ts'

vi.mock('../components/account-sync.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/account-sync.tsx')>()),
  useAccountSync: () => ({
    user: { id: 'u1', email: 'studi@example.org', role: 'user' },
    state: { kind: 'no_account_plan' },
    sessionPending: false,
    sync: { stop: vi.fn(), uploadLocal: vi.fn(), retry: vi.fn(), linkedPlanId: vi.fn(() => null) },
  }),
}))

function renderAccount(withPlan: boolean) {
  const store = createGuestStore(window.localStorage)
  if (withPlan) {
    const plan = createPlanFromPreset(examplePreset, {
      id: 'plan-test',
      startTerm: { season: 'winter', year: 2026 },
      now: new Date('2026-09-13T10:00:00Z'),
    })
    store.replacePlan(createGuestDocument(plan).plan)
  }
  render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={createAppRouter(createMemoryHistory({ initialEntries: ['/account'] }))} />
    </GuestStoreContext.Provider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('de')
  window.localStorage.clear()
  // Reminder settings and the admin check load in the background; a 404 keeps them quiet.
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ error: 'not_found' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    }),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('way back from the account page', () => {
  it('leads back to the plan when there is one', async () => {
    renderAccount(true)
    const link = await screen.findByRole('link', { name: 'Zurück zu deinem Plan' })
    expect(link).toHaveAttribute('href', '/')
  })

  it('leads to the start page when there is no plan yet', async () => {
    renderAccount(false)
    const link = await screen.findByRole('link', { name: 'Zur Startseite' })
    expect(link).toHaveAttribute('href', '/start')
  })
})
