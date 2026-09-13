import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError } from 'better-auth/api'
import { eq } from 'drizzle-orm'
import type { Config } from './config.ts'
import type { Database } from './db/connection.ts'
import { account, rateLimit, session, user, verification } from './db/schema.ts'
import { type Mailer, mailLocale, passwordResetMail, verificationMail } from './mail.ts'
import { hashPassword, verifyPassword } from './password.ts'

const HOUR = 60 * 60
const DAY = 24 * HOUR

export interface AuthDependencies {
  config: Config
  db: Database
  mailer: Mailer
}

export function createAuth({ config, db, mailer }: AuthDependencies) {
  return betterAuth({
    appName: 'Studienplaner',
    baseURL: config.publicUrl,
    basePath: '/api/auth',
    secret: config.authSecret,
    trustedOrigins: [config.publicOrigin],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification, rateLimit },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: HOUR,
      password: { hash: hashPassword, verify: verifyPassword },
      sendResetPassword: async ({ user: recipient, url }) => {
        await mailer.send(passwordResetMail(recipient.email, url, mailLocale(recipient)))
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: HOUR,
      sendVerificationEmail: async ({ user: recipient, url }) => {
        await mailer.send(verificationMail(recipient.email, url, mailLocale(recipient)))
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (recipient) => {
          const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, recipient.id))
          if (row?.role === 'superadmin') {
            throw APIError.from('FORBIDDEN', {
              code: 'SUPERADMIN_NOT_DELETABLE',
              message: 'The superadmin account cannot be deleted',
            })
          }
        },
      },
      additionalFields: {
        /** The web app sends its UI language at sign-up and when the student switches; e-mails use it. */
        locale: { type: 'string', required: false, defaultValue: 'de', input: true },
        /** Readable in the session so the web app can adapt; only the admin routes change it, see roles.ts. */
        role: { type: 'string', required: false, defaultValue: 'user', input: false },
      },
    },
    session: {
      // Sessions last 30 days and are extended at most once a day while in use.
      expiresIn: 30 * DAY,
      updateAge: DAY,
      // Deleting the account needs a sign-in within the last 10 minutes or the password.
      freshAge: 10 * 60,
    },
    rateLimit: {
      enabled: config.env !== 'test',
      // Stored in the database so restarts do not reset the counters.
      storage: 'database',
      window: 60,
      max: 60,
    },
    advanced: {
      useSecureCookies: config.publicUrl.startsWith('https://'),
      ...(config.ipAddressHeaders ? { ipAddress: { ipAddressHeaders: config.ipAddressHeaders } } : {}),
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
