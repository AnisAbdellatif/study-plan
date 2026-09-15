import { createPlanFromPreset, type Plan, presetSchema } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import example from '../../../../packages/shared/examples/informatik-bsc-example.json'
import i18n from '../i18n/index.ts'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'

function renderAt(path: string, plan?: Plan) {
  const store = createGuestStore(window.localStorage)
  if (plan) store.replacePlan(plan)
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={router} />
    </GuestStoreContext.Provider>,
  )
  return { store, router, user: userEvent.setup() }
}

beforeEach(async () => {
  window.localStorage.clear()
  await i18n.changeLanguage('de')
})

describe('landing page', () => {
  it('introduces the product to visitors without a plan and leads to the start page', async () => {
    const { router } = renderAt('/')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Dein Studium, klar geplant.' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getAllByRole('link', { name: /Studienplan erstellen/ })[0]).toHaveAttribute(
      'href',
      '/start',
    )
    expect(screen.getByRole('link', { name: 'Loslegen' })).toHaveAttribute('href', '/start')
    expect(screen.getByRole('heading', { name: 'Alles für dein Studium an einem Ort' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Häufige Fragen' })).toBeInTheDocument()
    expect(within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Kontakt' })).toBeVisible()
  })

  it('opens the example plan on the board', async () => {
    const { store, user } = renderAt('/')
    await user.click(await screen.findByRole('button', { name: 'Beispiel ansehen' }))
    expect(await screen.findByRole('heading', { name: '1. Semester' })).toBeInTheDocument()
    expect(store.getState().plan?.preset.id).toBe('example/informatik-bsc-example')
  })

  it('stays reachable at /about and points students with a plan back to it', async () => {
    const plan = createPlanFromPreset(presetSchema.parse(example), {
      id: 'mine',
      startTerm: { season: 'winter', year: 2026 },
      now: new Date('2026-09-13T10:00:00Z'),
    })
    const { store } = renderAt('/about', plan)
    expect(await screen.findByRole('link', { name: 'Zu deinem Plan' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', { name: 'Beispiel ansehen' })).not.toBeInTheDocument()
    expect(store.getState().plan?.id).toBe('mine')
  })

  it('is translated', async () => {
    await i18n.changeLanguage('en')
    renderAt('/')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Your degree, clearly planned.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/start')
  })
})
