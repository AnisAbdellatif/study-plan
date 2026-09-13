import { inferAdditionalFields } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

/**
 * Talks to /api/auth on the same origin. In development, Vite forwards /api to the API server.
 * `locale` ('de' or 'en') is an extra user field on the API; e-mails go out in that language.
 */
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [inferAdditionalFields({ user: { locale: { type: 'string', required: false } } })],
})

export type AuthSession = typeof authClient.$Infer.Session
