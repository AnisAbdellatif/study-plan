import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import { ChangePasswordSection } from './auth-pages.tsx'

const mocks = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
}))

vi.mock('../lib/auth-client.ts', () => ({
  authClient: { requestPasswordReset: mocks.requestPasswordReset },
}))

beforeEach(async () => {
  await i18n.changeLanguage('de')
  mocks.requestPasswordReset.mockReset()
})

describe('change password on the account page', () => {
  it('sends a one-time link to the signed-in address', async () => {
    mocks.requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null })
    render(<ChangePasswordSection email="studi@example.org" />)
    const user = userEvent.setup()

    expect(screen.getByRole('heading', { name: 'Passwort ändern' })).toBeInTheDocument()
    expect(screen.getByText(/funktioniert nur einmal/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Link zum Ändern senden' }))

    expect(mocks.requestPasswordReset).toHaveBeenCalledWith({
      email: 'studi@example.org',
      redirectTo: '/reset-password',
    })
    const confirmation = await screen.findByRole('status')
    expect(confirmation).toHaveTextContent('Wir haben dir einen Link an studi@example.org geschickt.')
    expect(screen.getByRole('button', { name: 'Link erneut senden' })).toBeEnabled()
  })

  it('reports rate limiting instead of claiming the link was sent', async () => {
    mocks.requestPasswordReset.mockResolvedValue({ data: null, error: { status: 429 } })
    render(<ChangePasswordSection email="studi@example.org" />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Link zum Ändern senden' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Zu viele Versuche.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
