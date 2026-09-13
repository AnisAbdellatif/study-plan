import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import i18n from '../i18n/index.ts'
import '@testing-library/jest-dom/vitest'

// Tests render German unless they switch; jsdom reports an English browser.
beforeEach(async () => {
  await i18n.changeLanguage('de')
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

// Web tests run signed out and never reach the network. Account flows are covered by the API and sync tests.
vi.mock('../lib/auth-client.ts', () => ({
  authClient: {
    useSession: () => ({
      data: null,
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: async () => {},
    }),
    signIn: { email: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    sendVerificationEmail: vi.fn(),
    deleteUser: vi.fn(),
  },
}))
