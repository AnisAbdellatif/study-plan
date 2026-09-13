import { createPlanFromPreset, type Plan } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../i18n/index.ts'
import { createAppRouter } from '../../router.tsx'
import { createGuestStore, GuestStoreContext } from '../../store/guest-store.ts'
import { examplePreset } from '../../test/fixtures.ts'

// Semester 1 is WS 2024/25; on 13 September 2026 the plan is in its fourth semester (SS 2026),
// so Grundlagen der Programmierung (semester 1) should have been passed before Algorithmen und Datenstrukturen.
const plan = (): Plan =>
  createPlanFromPreset(examplePreset, {
    id: 'plan-test',
    startTerm: { season: 'winter', year: 2024 },
    now: new Date('2024-09-01T10:00:00Z'),
  })

function renderBoard(value: Plan) {
  const store = createGuestStore(window.localStorage)
  store.replacePlan(value)
  render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={createAppRouter(createMemoryHistory({ initialEntries: ['/'] }))} />
    </GuestStoreContext.Provider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-13T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('prerequisites that were not passed in time', () => {
  it('marks the module in red on the card and counts it as a problem', async () => {
    renderBoard(plan())
    const secondSemester = await screen.findByRole('region', { name: /^2\. Semester/ })
    const note = within(secondSemester).getByText(
      'Voraussetzung nicht bestanden: Grundlagen der Programmierung',
    )
    expect(note.closest('li')).toHaveClass('text-red-700')

    const hints = screen.getByRole('region', { name: 'Hinweise zum Plan' })
    // Theoretische Informatik is blocked too: it needs Lineare Algebra I, also planned for the first semester.
    expect(hints.querySelector('p')).toHaveTextContent('2 Probleme · 1 Warnung')
    expect(
      within(hints).getByText(
        /Algorithmen und Datenstrukturen setzt Module voraus, die nicht rechtzeitig bestanden sind\. Grundlagen der Programmierung war für WS 2024\/25 geplant und ist nicht bestanden\./,
      ),
    ).toBeInTheDocument()
  })

  it('is written in English too', async () => {
    await i18n.changeLanguage('en')
    renderBoard(plan())
    expect(
      await screen.findByText('Prerequisite not passed: Grundlagen der Programmierung'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Grundlagen der Programmierung was planned for Winter 2024\/25 and is not passed\./),
    ).toBeInTheDocument()
  })
})
