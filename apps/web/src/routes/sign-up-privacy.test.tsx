import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import { SignUpPage } from './auth-pages.tsx'

const mocks = vi.hoisted(() => ({ signUp: vi.fn() }))

vi.mock('../lib/auth-client.ts', () => ({
  authClient: { signUp: { email: mocks.signUp }, sendVerificationEmail: vi.fn() },
}))

function renderSignUp() {
  const rootRoute = createRootRoute({ component: SignUpPage })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/sign-up'] }),
  })
  render(<RouterProvider router={router} />)
}

beforeEach(async () => {
  await i18n.changeLanguage('de')
  mocks.signUp.mockReset()
  mocks.signUp.mockResolvedValue({ data: {}, error: null })
})

describe('privacy policy on sign-up', () => {
  it('creates the account only after the privacy policy is accepted', async () => {
    renderSignUp()
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('E-Mail-Adresse'), 'studi@example.org')
    await user.type(screen.getByLabelText('Passwort'), 'ein-langes-passwort')
    const consent = screen.getByRole('checkbox', {
      name: 'Ich habe die Datenschutzerklärung gelesen und akzeptiere sie.',
    })
    expect(consent).toBeRequired()
    expect(consent).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Konto erstellen' }))
    expect(mocks.signUp).not.toHaveBeenCalled()

    await user.click(consent)
    await user.click(screen.getByRole('button', { name: 'Konto erstellen' }))
    expect(mocks.signUp).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('heading', { name: 'Bestätige deine E-Mail-Adresse' })).toBeInTheDocument()
  })

  it('shows a busy button with a spinner until the verification e-mail is sent', async () => {
    let finish: (value: { data: object; error: null }) => void = () => {}
    mocks.signUp.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    renderSignUp()
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('E-Mail-Adresse'), 'studi@example.org')
    await user.type(screen.getByLabelText('Passwort'), 'ein-langes-passwort')
    await user.click(
      screen.getByRole('checkbox', { name: 'Ich habe die Datenschutzerklärung gelesen und akzeptiere sie.' }),
    )
    await user.click(screen.getByRole('button', { name: 'Konto erstellen' }))

    const busy = await screen.findByRole('button', { busy: true })
    expect(busy).toBeDisabled()
    expect(busy.querySelector('svg.animate-spin')).not.toBeNull()

    finish({ data: {}, error: null })
    expect(await screen.findByRole('heading', { name: 'Bestätige deine E-Mail-Adresse' })).toBeInTheDocument()
  })

  it('opens the privacy policy in a new tab so the form keeps its input', async () => {
    renderSignUp()
    const link = await screen.findByRole('link', { name: 'Datenschutzerklärung' })
    expect(link).toHaveAttribute('href', '/privacy')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
