import { createPlanFromPreset, toSharedPlan } from '@study-plan/shared'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decideLocaleSync } from '../components/locale-sync.tsx'
import { findPreset } from '../presets.ts'
import { createAppRouter } from '../router.tsx'
import { describeAuthError } from '../routes/auth-pages.tsx'
import { createGuestStore, GuestStoreContext } from '../store/guest-store.ts'
import i18n from './index.ts'

function renderApp(path: string) {
  const store = createGuestStore(window.localStorage)
  const router = createAppRouter(createMemoryHistory({ initialEntries: [path] }))
  render(
    <GuestStoreContext.Provider value={store}>
      <RouterProvider router={router} />
    </GuestStoreContext.Provider>,
  )
  return { store, user: userEvent.setup() }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('account, start and shared pages in English', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows the start page', async () => {
    renderApp('/start')
    expect(await screen.findByRole('heading', { name: 'Create your study plan' })).toBeInTheDocument()
    expect(screen.getByText('Winter semester')).toBeInTheDocument()
    expect(screen.getByText('Summer semester')).toBeInTheDocument()
    expect(screen.getByLabelText('Degree programme')).toBeInTheDocument()
    expect(screen.getByText(/^Semester 1: (Winter|Summer) \d{4}/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create plan' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Already have an account? Sign in' })).toBeInTheDocument()
  })

  it('shows the sign-in page', async () => {
    renderApp('/sign-in')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Study Planner' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'No account yet? Sign up' })).toBeInTheDocument()
  })

  it('shows the sign-up page', async () => {
    renderApp('/sign-up')
    expect(await screen.findByRole('heading', { name: 'Create an account' })).toBeInTheDocument()
    expect(screen.getByText(/^At least 10 characters\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'privacy policy' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
  })

  it('shows the forgot-password page', async () => {
    renderApp('/forgot-password')
    expect(await screen.findByRole('heading', { name: 'Forgot your password' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request link' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toBeInTheDocument()
  })

  it('turns reminders off from the e-mail link', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ examReminders: false }))
    const { user } = renderApp('/unsubscribe?token=abc.def')
    expect(await screen.findByRole('heading', { name: 'Turn off email reminders' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Turn off reminders' }))
    expect(await screen.findByText(/Reminders are turned off/)).toBeInTheDocument()
  })

  it('explains an incomplete unsubscribe link', async () => {
    renderApp('/unsubscribe')
    expect(await screen.findByText(/This link is incomplete/)).toBeInTheDocument()
  })

  it('shows a shared plan', async () => {
    const preset = findPreset('example/informatik-bsc-example')?.preset
    if (!preset) throw new Error('expected a bundled preset')
    const plan = createPlanFromPreset(preset, {
      id: 'plan-test',
      startTerm: { season: 'winter', year: 2026 },
      now: new Date('2026-09-13T10:00:00Z'),
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({
        name: 'Kim’s plan',
        updatedAt: '2026-09-12T10:00:00.000Z',
        sharedAt: '2026-09-12T10:00:00.000Z',
        plan: toSharedPlan({ ...plan, name: 'Kim’s plan' }),
      }),
    )
    renderApp('/shared/AAAAAAAAAAAAAAAAAAAAAAAA')
    expect(await screen.findByRole('heading', { name: 'Kim’s plan' })).toBeInTheDocument()
    expect(screen.getByText('Shared plan')).toBeInTheDocument()
    expect(
      screen.getByText(/^Last changed .*Without grades, exam dates or target average\./),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Semester 1' })).toHaveTextContent('Winter 2026/27')
    expect(screen.getByRole('button', { name: 'Use as my own plan' })).toBeInTheDocument()
  })

  it('explains a deactivated shared link', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'not_found' }, 404))
    renderApp('/shared/AAAAAAAAAAAAAAAAAAAAAAAA')
    expect(await screen.findByRole('heading', { name: 'Link not available' })).toBeInTheDocument()
    expect(screen.getByText(/This link has been deactivated or doesn’t exist\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create your own plan' })).toBeInTheDocument()
  })

  it('describes auth errors', () => {
    expect(describeAuthError({ status: 401 })).toBe('The email address or password is wrong.')
    expect(describeAuthError({ code: 'PASSWORD_TOO_SHORT' })).toBe(
      'Your password needs at least 10 characters.',
    )
  })
})

describe('decideLocaleSync', () => {
  const base = { uiLocale: 'en', accountLocale: 'de', hasSavedChoice: false, firstCheck: true } as const

  it('does nothing when the account already has the UI language', () => {
    expect(decideLocaleSync({ ...base, accountLocale: 'en' })).toEqual({ kind: 'none' })
  })

  it('adopts the account language after sign-in when the browser has no choice of its own', () => {
    expect(decideLocaleSync(base)).toEqual({ kind: 'adopt', locale: 'de' })
  })

  it('saves the UI language when the browser has a saved choice', () => {
    expect(decideLocaleSync({ ...base, hasSavedChoice: true })).toEqual({ kind: 'update', locale: 'en' })
  })

  it('saves the UI language when it changes later', () => {
    expect(decideLocaleSync({ ...base, firstCheck: false })).toEqual({ kind: 'update', locale: 'en' })
  })

  it('saves the UI language when the account has no valid locale', () => {
    expect(decideLocaleSync({ ...base, accountLocale: undefined })).toEqual({ kind: 'update', locale: 'en' })
    expect(decideLocaleSync({ ...base, accountLocale: 'fr' })).toEqual({ kind: 'update', locale: 'en' })
  })
})
