import { createPlanFromPreset } from '@study-plan/shared'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'
import { examplePreset } from '../test/fixtures.ts'
import { StorageNotice } from './storage-notice.tsx'

const mocks = vi.hoisted(() => ({ uploadLocal: vi.fn(async () => {}) }))

vi.mock('./account-sync.tsx', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./account-sync.tsx')>()),
  useAccountSync: () => ({
    user: { id: 'u1', email: 'studi@example.org', role: 'user' },
    state: { kind: 'no_account_plan' },
    sessionPending: false,
    sync: { uploadLocal: mocks.uploadLocal, retry: vi.fn(), stop: vi.fn() },
  }),
}))

function renderNotices() {
  const plan = createPlanFromPreset(examplePreset, {
    id: 'plan-test',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
  window.localStorage.clear()
  const store = createGuestStore(window.localStorage)
  store.replacePlan(plan)
  render(
    <GuestStoreContext.Provider value={store}>
      <StorageNotice plan={plan} />
    </GuestStoreContext.Provider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('de')
  mocks.uploadLocal.mockClear()
})

describe('storage notice for a signed-in plan that is not in the account yet', () => {
  it('shows one message with saving to the account, exporting and later', async () => {
    renderNotices()
    const user = userEvent.setup()

    // AccountSyncBanner no longer shows its own "save to account" box for this state; this is the only message.
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('Dein Plan liegt bisher nur in diesem Browser.')
    expect(screen.queryByText(/Sichere deinen Plan regelmäßig als Datei/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exportieren' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Im Konto sichern' }))
    expect(mocks.uploadLocal).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Später' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
