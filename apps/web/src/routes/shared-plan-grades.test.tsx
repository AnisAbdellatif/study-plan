import { createPlanFromPreset, setModuleResult, toSharedPlan } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'
import { examplePreset } from '../test/fixtures.ts'

function sharedResponse() {
  let plan = createPlanFromPreset(examplePreset, {
    id: 'plan-test',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
  plan = setModuleResult(plan, 'INF-101', { kind: 'graded', grade: 1.3 })
  return {
    name: 'Plan von Kim',
    updatedAt: '2026-09-12T10:00:00.000Z',
    sharedAt: '2026-09-12T10:00:00.000Z',
    includeGrades: false,
    plan: toSharedPlan(plan),
  }
}

function renderShared() {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(sharedResponse()), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  )
  render(
    <GuestStoreContext.Provider value={createGuestStore(window.localStorage)}>
      <RouterProvider
        router={createAppRouter(
          createMemoryHistory({ initialEntries: ['/shared/AAAAAAAAAAAAAAAAAAAAAAAA'] }),
        )}
      />
    </GuestStoreContext.Provider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('de')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('shared plans', () => {
  it('opens the details of a module from its card', async () => {
    renderShared()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /Grundlagen der Programmierung/ }))
    expect(await screen.findByRole('dialog', { name: /Grundlagen der Programmierung/ })).toBeInTheDocument()
  })

  it('shows no grades or average', async () => {
    renderShared()
    expect(await screen.findByRole('heading', { name: 'Plan von Kim' })).toBeInTheDocument()
    expect(screen.getByText(/Ohne Noten, Prüfungstermine und Zielschnitt/)).toBeInTheDocument()
    expect(screen.queryByTestId('shared-average')).not.toBeInTheDocument()
    expect(screen.queryByText('1,3')).not.toBeInTheDocument()
  })
})
