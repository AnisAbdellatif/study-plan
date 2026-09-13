import { createPlanFromPreset } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'
import { examplePreset } from '../test/fixtures.ts'
import { LOCALE_STORAGE_KEY } from './config.ts'
import i18n from './index.ts'

function renderAt(path: string, withPlan = false) {
  const store = createGuestStore(window.localStorage)
  if (withPlan) {
    store.replacePlan(
      createPlanFromPreset(examplePreset, {
        id: 'plan-test',
        startTerm: { season: 'winter', year: 2026 },
        now: new Date('2026-09-13T10:00:00Z'),
      }),
    )
  }
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={router} />
    </GuestStoreContext.Provider>,
  )
  return userEvent.setup()
}

describe('language dropdown', () => {
  it('switches the language from the header and remembers the choice', async () => {
    const user = renderAt('/start')
    expect(await screen.findByRole('heading', { name: 'Studienplan anlegen' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Sprache: Deutsch' }))
    expect(await screen.findByRole('menuitemradio', { name: 'Deutsch' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await user.click(screen.getByRole('menuitemradio', { name: 'English' }))

    await waitFor(() => expect(i18n.resolvedLanguage).toBe('en'))
    expect(await screen.findByRole('button', { name: 'Language: English' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Studienplan anlegen' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
  })

  it('sits in the board header once and no longer in the footer', async () => {
    renderAt('/', true)
    expect(await screen.findByRole('heading', { name: '1. Semester' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Sprache:/ })).toHaveLength(1)
    const footer = screen.getByRole('contentinfo')
    expect(footer.querySelector('button')).toBeNull()
  })
})
