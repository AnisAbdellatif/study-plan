import { Hono, type MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { csrf } from 'hono/csrf'
import { createMiddleware } from 'hono/factory'
import { secureHeaders } from 'hono/secure-headers'
import type { Auth } from './auth.ts'
import type { Config } from './config.ts'
import type { Database } from './db/connection.ts'
import { UNSUBSCRIBE_PATH } from './reminders.ts'
import { accountRoutes } from './routes/account.ts'
import { adminRoutes, requireAdmin } from './routes/admin.ts'
import { notificationSettingsRoutes, unsubscribeRoutes } from './routes/notifications.ts'
import { planRoutes } from './routes/plans.ts'
import { planShareRoutes, publicShareRoutes } from './routes/shares.ts'
import type { AppEnv } from './types.ts'

export interface AppDependencies {
  config: Config
  db: Database
  auth: Auth
  /** Runtime-specific static file handlers for the built web app, see main.ts. */
  staticFiles?: { assets: MiddlewareHandler; index: MiddlewareHandler }
}

export function createApp({ config, db, auth, staticFiles }: AppDependencies) {
  const app = new Hono<AppEnv>()

  if (config.env !== 'test') {
    app.use('*', async (c, next) => {
      const started = performance.now()
      await next()
      // Method, path and status only: no IP addresses, query strings or bodies in the logs.
      console.info(
        `[api] ${c.req.method} ${c.req.path} ${c.res.status} ${Math.round(performance.now() - started)}ms`,
      )
    })
  }

  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        // React sets inline style attributes for progress bar widths.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
      referrerPolicy: 'strict-origin-when-cross-origin',
    }),
  )
  app.use(
    '/api/*',
    bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: 'payload_too_large' }, 413) }),
  )
  const csrfProtection = csrf({ origin: config.publicOrigin })
  // One-click unsubscribe requests come from mail clients without an Origin header. The endpoint only turns
  // reminders off and needs a signed token, so a forged request cannot do harm.
  app.use('/api/*', (c, next) => (c.req.path === UNSUBSCRIBE_PATH ? next() : csrfProtection(c, next)))

  app.get('/api/health', (c) => c.json({ status: 'ok' }))
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw))

  const requireUser = createMiddleware<AppEnv>(async (c, next) => {
    const current = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!current) return c.json({ error: 'unauthorized' }, 401)
    c.set('user', { id: current.user.id, email: current.user.email, name: current.user.name })
    await next()
  })

  app.use('/api/plans', requireUser)
  app.use('/api/plans/*', requireUser)
  app.route('/api/plans', planRoutes(db))
  app.route('/api/plans', planShareRoutes(db, config))
  // Public: anyone with a share link may read the plan's structure.
  app.route('/api/share', publicShareRoutes(db, config))
  app.use('/api/account/*', requireUser)
  app.route('/api/account/notifications', notificationSettingsRoutes(db))
  app.route('/api/account', accountRoutes(db))
  app.route('/api/notifications', unsubscribeRoutes(db, config))
  app.use('/api/admin/*', requireAdmin(auth, config))
  app.route('/api/admin', adminRoutes(db, auth))
  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404))

  if (staticFiles) {
    app.use('/*', staticFiles.assets)
    app.get('*', staticFiles.index)
  }

  app.onError((error, c) => {
    console.error(`[api] ${c.req.method} ${c.req.path} failed`, error)
    return c.json({ error: 'internal_error' }, 500)
  })

  return app
}
