/**
 * Bun entry point. Everything runtime-specific lives here: the static file handler comes from hono/bun.
 * A Node entry would use @hono/node-server and its serveStatic instead; the rest of the app is shared.
 */
import { serveStatic } from 'hono/bun'
import { createApp } from './app.ts'
import { createAuth } from './auth.ts'
import { loadConfig } from './config.ts'
import { openDatabase } from './db/connection.ts'
import { createConsoleMailer, createSmtpMailer } from './mail.ts'

const config = loadConfig()
const database = await openDatabase(config.databaseUrl)
await database.migrate()

const mailer = config.smtpUrl ? createSmtpMailer(config.smtpUrl, config.mailFrom) : createConsoleMailer()
const auth = createAuth({ config, db: database.db, mailer })
const app = createApp({
  config,
  db: database.db,
  auth,
  staticFiles: config.webDist
    ? {
        assets: serveStatic({ root: config.webDist }),
        index: serveStatic({ path: `${config.webDist}/index.html` }),
      }
    : undefined,
})

console.info(
  `[api] listening on http://localhost:${config.port} (${config.env}, public URL ${config.publicUrl})`,
)

export default { port: config.port, fetch: app.fetch }
