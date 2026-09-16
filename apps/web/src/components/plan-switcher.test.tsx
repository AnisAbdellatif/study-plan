import { createPlanFromPreset } from '@study-plan/shared'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'
import { examplePreset } from '../test/fixtures.ts'
import { PlanSwitcher } from './plan-switcher.tsx'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(async () => {}),
  deleteCurrentPlan: vi.fn(async (): Promise<string | null> => null),
  remove: vi.fn(async () => {}),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => mocks.navigate,
}))

vi.mock('./account-sync.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./account-sync.tsx')>()),
  useAccountSync: () => ({
    user: { id: 'u1', email: 'studi@example.org', role: 'user' },
    state: { kind: 'synced', savedAt: '2026-09-13T10:00:00.000Z' },
    sessionPending: false,
    sync: {
      linkedPlanId: () => 'plan-a',
      deleteCurrentPlan: mocks.deleteCurrentPlan,
      switchTo: vi.fn(),
      startNewPlan: vi.fn(),
    },
  }),
}))

vi.mock('../lib/api.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/api.ts')>()
  return {
    ...original,
    planApi: {
      ...original.planApi,
      overview: async () => ({
        plans: [
          { id: 'plan-a', name: 'Informatik', revision: 1, updatedAt: '2026-09-13T10:00:00.000Z' },
          { id: 'plan-b', name: 'Zweitstudium', revision: 1, updatedAt: '2026-09-12T10:00:00.000Z' },
        ],
        limit: 4,
      }),
      remove: mocks.remove,
    },
  }
})

function renderSwitcher() {
  const plan = createPlanFromPreset(examplePreset, {
    id: 'plan-test',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
    name: 'Informatik',
  })
  window.localStorage.clear()
  const store = createGuestStore(window.localStorage)
  store.replacePlan(plan)
  render(
    <GuestStoreContext.Provider value={store}>
      <PlanSwitcher plan={plan} />
    </GuestStoreContext.Provider>,
  )
  return { store, user: userEvent.setup() }
}

beforeEach(async () => {
  await i18n.changeLanguage('de')
  for (const mock of Object.values(mocks)) mock.mockClear()
})

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Plan wechseln, geöffnet ist Informatik' }))
  await screen.findByRole('menuitem', { name: 'Zweitstudium löschen' })
}

describe('deleting plans from the plan switcher', () => {
  it('asks before deleting another plan and removes only that one', async () => {
    const { user, store } = renderSwitcher()
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Zweitstudium löschen' }))

    const dialog = await screen.findByRole('alertdialog', { name: '„Zweitstudium“ löschen?' })
    expect(mocks.remove).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Plan löschen' }))

    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith('plan-b'))
    expect(mocks.deleteCurrentPlan).not.toHaveBeenCalled()
    expect(store.getState().plan?.name).toBe('Informatik')
  })

  it('deletes the open plan through the sync and goes to the start page when none is left', async () => {
    const { user, store } = renderSwitcher()
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Informatik löschen' }))

    const dialog = await screen.findByRole('alertdialog', { name: '„Informatik“ löschen?' })
    expect(dialog).toHaveTextContent('Hast du weitere Pläne im Konto, wird der nächste geöffnet.')
    await user.click(within(dialog).getByRole('button', { name: 'Plan löschen' }))

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: '/start' }))
    expect(mocks.deleteCurrentPlan).toHaveBeenCalledTimes(1)
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(store.getState().plan).toBeNull()
  })

  it('keeps the plan when the confirmation is cancelled', async () => {
    const { user } = renderSwitcher()
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'Zweitstudium löschen' }))
    const dialog = await screen.findByRole('alertdialog', { name: '„Zweitstudium“ löschen?' })
    await user.click(within(dialog).getByRole('button', { name: 'Abbrechen' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(mocks.remove).not.toHaveBeenCalled()
    expect(mocks.deleteCurrentPlan).not.toHaveBeenCalled()
  })
})
