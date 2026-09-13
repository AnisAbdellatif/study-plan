import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

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
