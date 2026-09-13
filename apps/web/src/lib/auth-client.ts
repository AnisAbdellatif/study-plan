import { createAuthClient } from 'better-auth/react'

/** Talks to /api/auth on the same origin. In development, Vite forwards /api to the API server. */
export const authClient = createAuthClient({ basePath: '/api/auth' })

export type AuthSession = typeof authClient.$Infer.Session
