import {
  addCustomModule,
  addPlaceholder,
  createPlanFromPreset,
  moveModule,
  toSharedPlan,
} from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { areaTone, moduleTone, NEUTRAL_TONE } from '../lib/area-colors.ts'
import { createAppRouter } from '../router.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'
import { luhPreset } from '../test/fixtures.ts'

describe('shared plans with placeholders and custom modules', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows placeholders read-only and labels custom modules', async () => {
    let plan = createPlanFromPreset(luhPreset, {
      id: 'plan-test',
      startTerm: { season: 'winter', year: 2026 },
      now: new Date('2026-09-13T10:00:00Z'),
    })
    plan = addPlaceholder(plan, 'vertiefung-informatik', 's5', undefined, 'test')
    const added = addCustomModule(plan, {
      name: 'Japanisch A1',
      credits: 5,
      grading: 'graded',
      countsTowardAverage: true,
      offering: 'both',
      areaId: null,
    })
    plan = moveModule(added.plan, added.code, 's1')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          name: 'Plan von Kim',
          updatedAt: '2026-09-12T10:00:00.000Z',
          sharedAt: '2026-09-12T10:00:00.000Z',
          plan: toSharedPlan(plan),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const store = createGuestStore(window.localStorage)
    render(
      <GuestStoreContext.Provider value={store}>
        <RouterProvider
          router={createAppRouter(
            createMemoryHistory({ initialEntries: ['/shared/AAAAAAAAAAAAAAAAAAAAAAAA'] }),
          )}
        />
      </GuestStoreContext.Provider>,
    )

    expect(await screen.findByRole('heading', { name: 'Plan von Kim' })).toBeInTheDocument()
    const fifth = screen.getByRole('region', { name: '5. Semester' })
    const placeholder = within(fifth).getByTestId('shared-placeholder')
    expect(placeholder).toHaveTextContent('Platzhalter')
    expect(placeholder).toHaveTextContent('Vertiefung der Informatik')
    expect(placeholder).toHaveTextContent('≈ 5 LP')
    expect(fifth).toHaveTextContent('+ ≈5 LP')
    expect(fifth).not.toHaveTextContent('placeholder-test')
    // Placeholders stay read-only; module cards next to them open their details.
    expect(within(placeholder).queryByRole('button')).not.toBeInTheDocument()

    const first = screen.getByRole('region', { name: '1. Semester' })
    expect(first).toHaveTextContent('Japanisch A1')
    expect(first).toHaveTextContent('Eigenes Modul')
    expect(first).not.toHaveTextContent('custom')

    // Same area colours as the board: modules and placeholders carry their area's tone, custom modules the
    // neutral one, and a legend names the areas.
    const hasTone = (element: HTMLElement | undefined, classes: string) => {
      for (const name of classes.split(' ')) expect(element).toHaveClass(name)
    }
    hasTone(placeholder, areaTone(plan, 'vertiefung-informatik').stripe)
    const cards = within(first).getAllByTestId('shared-module')
    hasTone(
      cards.find((card) => card.textContent?.includes('Japanisch A1')),
      NEUTRAL_TONE.stripe,
    )
    const areaModule = plan.semesters[0]?.moduleCodes.find((code) =>
      plan.modules.some((module) => module.code === code && !module.custom),
    )
    const areaModuleName = plan.modules.find((module) => module.code === areaModule)?.name ?? ''
    expect(moduleTone(plan, areaModule ?? '')).not.toBe(NEUTRAL_TONE)
    hasTone(
      cards.find((card) => card.textContent?.includes(areaModuleName)),
      moduleTone(plan, areaModule ?? '').stripe,
    )
    const legend = screen.getByRole('list', { name: 'Bereiche' })
    expect(within(legend).getByText('Vertiefung der Informatik')).toBeInTheDocument()
  })
})
