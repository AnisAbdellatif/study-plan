/**
 * Bun entry point. Everything runtime-specific lives here: the static file handler comes from hono/bun.
 * A Node entry would use @hono/node-server and its serveStatic instead; the rest of the app is shared.
 */
import { serveStatic } from 'hono/bun'
import { createApp } from './app.ts'
import { createAuth } from './auth.ts'
import { loadConfig } from './config.ts'
import { openDatabase } from './db/connection.ts'
import { createOpenRouterClient } from './llm/openrouter.ts'
import { createConsoleMailer, createSmtpMailer } from './mail.ts'
import { startReminderScheduler } from './reminders.ts'
import { ensureSuperadmin } from './roles.ts'

const IMMUTABLE = 'public, max-age=31536000, immutable'

const config = loadConfig()
const database = await openDatabase(config.databaseUrl)
await database.migrate()

const mailer = config.smtpUrl ? createSmtpMailer(config.smtpUrl, config.mailFrom) : createConsoleMailer()
const auth = createAuth({ config, db: database.db, mailer })

if (config.superadmin) {
  const outcome = await ensureSuperadmin(database.db, auth, config.superadmin)
  if (outcome !== 'exists') console.info(`[api] superadmin ${config.superadmin.email} ${outcome}`)
}
const llm = config.chat
  ? createOpenRouterClient({
      apiKey: config.chat.apiKey,
      model: config.chat.model,
      baseUrl: config.chat.baseUrl,
      appUrl: config.publicUrl,
      appName: 'Study Plan',
    })
  : undefined

const app = createApp({
  config,
  db: database.db,
  auth,
  mailer,
  llm,
  staticFiles: config.webDist
    ? {
        // Vite puts a content hash in every file name under assets/, so those never change and can be cached
        // for a year. Everything else, index.html above all, is checked again so a deploy shows up at once.
        assets: serveStatic({
          root: config.webDist,
          onFound: (path, c) => {
            c.header('Cache-Control', /[\\/]assets[\\/]/.test(path) ? IMMUTABLE : 'no-cache')
          },
        }),
        index: serveStatic({
          path: `${config.webDist}/index.html`,
          onFound: (_path, c) => {
            c.header('Cache-Control', 'no-cache')
          },
        }),
      }
    : undefined,
})

if (config.reminderIntervalMinutes > 0 && config.env !== 'test') {
  startReminderScheduler({ db: database.db, mailer, config }, config.reminderIntervalMinutes * 60_000)
}

console.info(
  `[api] listening on http://localhost:${config.port} (${config.env}, public URL ${config.publicUrl})`,
)

export default { port: config.port, fetch: app.fetch }
