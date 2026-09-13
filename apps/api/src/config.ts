import { z } from 'zod'

const DEVELOPMENT_SECRET = 'development-only-secret-never-use-in-production'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** postgres://… for PostgreSQL, pglite://<directory> for an embedded database, pglite://memory for tests. */
  DATABASE_URL: z.string().min(1).default('pglite://.data/pglite'),
  /** The origin students open in the browser. E-mail links and cookie security derive from it. */
  PUBLIC_URL: z.url().default('http://localhost:5173'),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  /** SMTP connection URL, e.g. smtps://user:password@mail.example.org:465. Without it, e-mails are only logged. */
  SMTP_URL: z.string().min(1).optional(),
  MAIL_FROM: z.string().min(3).default('Studienplaner <noreply@localhost>'),
  /** Directory with the built web app. When set, the API serves it as well. */
  WEB_DIST: z.string().min(1).optional(),
  /**
   * Behind a reverse proxy: the header carrying the client IP, e.g. x-forwarded-for. Needed for per-IP rate
   * limiting; only set it when the proxy overwrites the header, otherwise clients could spoof it.
   */
  IP_ADDRESS_HEADER: z.string().min(1).optional(),
  /** How often reminder e-mails are checked, in minutes. 0 turns reminders off for this process. */
  /** Comma-separated e-mail addresses of verified accounts that may open the admin dashboard. */
  ADMIN_EMAILS: z.string().default(''),
  REMINDER_INTERVAL_MINUTES: z.coerce.number().int().min(0).max(1440).default(60),
})

export interface Config {
  env: 'development' | 'test' | 'production'
  port: number
  databaseUrl: string
  /** Without trailing slash, e.g. https://plan.example.org */
  publicUrl: string
  publicOrigin: string
  authSecret: string
  smtpUrl: string | undefined
  mailFrom: string
  webDist: string | undefined
  ipAddressHeaders: string[] | undefined
  /** Lower-case e-mail addresses with admin access. Empty means nobody. */
  adminEmails: string[]
  /** 0 when reminders are off. */
  reminderIntervalMinutes: number
}

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  const env = envSchema.parse(source)

  if (env.NODE_ENV === 'production') {
    const missing = [
      env.BETTER_AUTH_SECRET ? null : 'BETTER_AUTH_SECRET',
      env.SMTP_URL ? null : 'SMTP_URL',
      source.DATABASE_URL ? null : 'DATABASE_URL',
      source.PUBLIC_URL ? null : 'PUBLIC_URL',
    ].filter((name): name is string => name !== null)
    if (missing.length > 0) throw new Error(`Missing required production settings: ${missing.join(', ')}`)
  }

  return {
    env: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    publicUrl: env.PUBLIC_URL.replace(/\/+$/, ''),
    publicOrigin: new URL(env.PUBLIC_URL).origin,
    authSecret: env.BETTER_AUTH_SECRET ?? DEVELOPMENT_SECRET,
    smtpUrl: env.SMTP_URL,
    mailFrom: env.MAIL_FROM,
    webDist: env.WEB_DIST,
    ipAddressHeaders: env.IP_ADDRESS_HEADER?.split(',').map((header) => header.trim().toLowerCase()),
    adminEmails: env.ADMIN_EMAILS.split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
    reminderIntervalMinutes: env.REMINDER_INTERVAL_MINUTES,
  }
}
