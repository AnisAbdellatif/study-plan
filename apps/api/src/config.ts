import { z } from 'zod'

const DEVELOPMENT_SECRET = 'development-only-secret-never-use-in-production'

/** A capable, inexpensive model on OpenRouter; override with OPENROUTER_MODEL. */
export const DEFAULT_CHAT_MODEL = 'anthropic/claude-haiku-4.5'

/** Compose passes unset variables as empty strings; those mean "not set". */
const optionalText = z.preprocess((value) => (value === '' ? undefined : value), z.string().min(1).optional())
const optionalUrl = z.preprocess((value) => (value === '' ? undefined : value), z.url().optional())

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
  MAIL_FROM: z.string().min(3).default('Study Plan <noreply@localhost>'),
  /** Directory with the built web app. When set, the API serves it as well. */
  WEB_DIST: z.string().min(1).optional(),
  /**
   * Behind a reverse proxy: the header carrying the client IP, e.g. x-forwarded-for. Needed for per-IP rate
   * limiting; only set it when the proxy overwrites the header, otherwise clients could spoof it.
   */
  IP_ADDRESS_HEADER: z.string().min(1).optional(),
  /** How often reminder e-mails are checked, in minutes. 0 turns reminders off for this process. */
  REMINDER_INTERVAL_MINUTES: z.coerce.number().int().min(0).max(1440).default(60),
  /**
   * The superadmin account created on first start. The password is only used to create the account; change it
   * afterwards through the normal password reset.
   */
  SUPERADMIN_EMAIL: z.email().optional(),
  SUPERADMIN_PASSWORD: z.string().min(10).max(128).optional(),
  SUPERADMIN_NAME: z.string().trim().min(1).max(100).default('Superadmin'),
  /** OpenRouter API key for the study assistant. Without it the assistant is off. */
  OPENROUTER_API_KEY: optionalText,
  OPENROUTER_MODEL: optionalText,
  /** Only for tests or a compatible proxy; defaults to OpenRouter itself. */
  OPENROUTER_BASE_URL: optionalUrl,
})

/** Local development only, so a fresh checkout has a working admin account. */
const DEVELOPMENT_SUPERADMIN = { email: 'admin@example.com', password: 'development-admin-password' }

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
  /** 0 when reminders are off. */
  reminderIntervalMinutes: number
  /** Seed for the superadmin account; undefined in tests, which create it themselves. */
  superadmin: { email: string; password: string; name: string } | undefined
  /** The study assistant's model access; undefined without an API key. */
  chat: { apiKey: string; model: string; baseUrl: string | undefined } | undefined
}

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  const env = envSchema.parse(source)

  if (env.NODE_ENV === 'production') {
    const missing = [
      env.BETTER_AUTH_SECRET ? null : 'BETTER_AUTH_SECRET',
      env.SMTP_URL ? null : 'SMTP_URL',
      source.DATABASE_URL ? null : 'DATABASE_URL',
      source.PUBLIC_URL ? null : 'PUBLIC_URL',
      env.SUPERADMIN_EMAIL ? null : 'SUPERADMIN_EMAIL',
      env.SUPERADMIN_PASSWORD ? null : 'SUPERADMIN_PASSWORD',
    ].filter((name): name is string => name !== null)
    if (missing.length > 0) throw new Error(`Missing required production settings: ${missing.join(', ')}`)
  }

  const superadminEmail =
    env.SUPERADMIN_EMAIL ?? (env.NODE_ENV === 'development' ? DEVELOPMENT_SUPERADMIN.email : undefined)
  const superadminPassword =
    env.SUPERADMIN_PASSWORD ?? (env.NODE_ENV === 'development' ? DEVELOPMENT_SUPERADMIN.password : undefined)

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
    reminderIntervalMinutes: env.REMINDER_INTERVAL_MINUTES,
    superadmin:
      superadminEmail && superadminPassword
        ? { email: superadminEmail.toLowerCase(), password: superadminPassword, name: env.SUPERADMIN_NAME }
        : undefined,
    chat: env.OPENROUTER_API_KEY
      ? {
          apiKey: env.OPENROUTER_API_KEY,
          model: env.OPENROUTER_MODEL ?? DEFAULT_CHAT_MODEL,
          baseUrl: env.OPENROUTER_BASE_URL,
        }
      : undefined,
  }
}
