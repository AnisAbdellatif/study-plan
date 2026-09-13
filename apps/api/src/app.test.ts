import { readFileSync } from 'node:fs'
import { createGuestDocument, createPlanFromPreset, presetSchema, setModuleResult } from '@study-plan/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { createAuth } from './auth.ts'
import { loadConfig } from './config.ts'
import { type DatabaseConnection, openDatabase } from './db/connection.ts'
import { account, plan as planTable, user as userTable } from './db/schema.ts'
import { createMemoryMailer } from './mail.ts'
import { MAX_PLANS_PER_USER } from './routes/plans.ts'

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'pglite://memory',
  PUBLIC_URL: 'http://localhost:5173',
  BETTER_AUTH_SECRET: 'test-secret-that-is-long-enough-for-better-auth',
})

const preset = presetSchema.parse(
  JSON.parse(
    readFileSync(new URL('../../../presets/example/informatik-bsc-example.json', import.meta.url), 'utf8'),
  ),
)

const planDocument = (name = 'Informatik B.Sc.') =>
  createGuestDocument(
    createPlanFromPreset(preset, {
      id: 'local',
      startTerm: { season: 'winter', year: 2026 },
      now: new Date('2026-09-13T10:00:00Z'),
      name,
    }),
  )

const PASSWORD = 'richtig-langes-passwort'
const mailer = createMemoryMailer()
let connection: DatabaseConnection
let app: ReturnType<typeof createApp>

beforeAll(async () => {
  connection = await openDatabase(config.databaseUrl)
  await connection.migrate()
  app = createApp({ config, db: connection.db, auth: createAuth({ config, db: connection.db, mailer }) })
})

afterAll(async () => {
  await connection.close()
})

interface CallOptions {
  method?: string
  body?: unknown
  cookie?: string
}

function call(path: string, { method = 'GET', body, cookie }: CallOptions = {}) {
  const headers = new Headers({ origin: config.publicOrigin })
  if (body !== undefined) headers.set('content-type', 'application/json')
  if (cookie) headers.set('cookie', cookie)
  return app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

const json = async <T>(response: Response): Promise<T> => (await response.json()) as T

const sessionCookie = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0] ?? '')
    .filter((cookie) => cookie.includes('session_token') && !cookie.endsWith('='))
    .join('; ')

function lastMailTo(email: string) {
  const mail = mailer.sent.filter((sent) => sent.to === email).at(-1)
  if (!mail) throw new Error(`no mail to ${email}`)
  return mail
}

function linkIn(text: string): URL {
  const match = /https?:\/\/\S+/.exec(text)
  if (!match) throw new Error('no link in mail')
  return new URL(match[0])
}

async function signUp(email: string) {
  return call('/api/auth/sign-up/email', {
    method: 'POST',
    body: { email, password: PASSWORD, name: email.split('@')[0] },
  })
}

async function registerVerifiedUser(email: string): Promise<string> {
  expect((await signUp(email)).status).toBe(200)
  const link = linkIn(lastMailTo(email).text)
  const verified = await call(`${link.pathname}${link.search}`)
  const cookie = sessionCookie(verified)
  expect(cookie).toContain('session_token')
  return cookie
}

describe('health and headers', () => {
  it('answers health checks with security headers', async () => {
    const response = await call('/api/health')
    expect(response.status).toBe(200)
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
  })

  it('answers unknown API routes with a JSON 404', async () => {
    const response = await call('/api/nope')
    expect(response.status).toBe(404)
    expect(await json(response)).toEqual({ error: 'not_found' })
  })
})

describe('accounts', () => {
  it('requires e-mail verification before signing in', async () => {
    const email = 'anna@example.org'
    const registered = await signUp(email)
    expect(registered.status).toBe(200)
    expect(sessionCookie(registered)).toBe('')

    const early = await call('/api/auth/sign-in/email', {
      method: 'POST',
      body: { email, password: PASSWORD },
    })
    expect(early.status).toBe(403)

    const mail = lastMailTo(email)
    expect(mail.subject).toBe('Bitte bestätige deine E-Mail-Adresse')
    const link = linkIn(mail.text)
    expect(link.origin).toBe(config.publicOrigin)
    const verified = await call(`${link.pathname}${link.search}`)
    expect(sessionCookie(verified)).toContain('session_token')

    const signIn = await call('/api/auth/sign-in/email', {
      method: 'POST',
      body: { email, password: PASSWORD },
    })
    expect(signIn.status).toBe(200)
    expect(sessionCookie(signIn)).toContain('session_token')
  })

  it('stores passwords as scrypt hashes', async () => {
    const rows = await connection.db.select({ password: account.password }).from(account)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.password?.startsWith('$scrypt$'))).toBe(true)
  })

  it('rejects passwords shorter than 10 characters', async () => {
    const response = await call('/api/auth/sign-up/email', {
      method: 'POST',
      body: { email: 'short@example.org', password: 'kurz', name: 'short' },
    })
    expect(response.status).toBe(400)
  })

  it('resets a password through the e-mailed link', async () => {
    const email = 'reset@example.org'
    await registerVerifiedUser(email)

    const requested = await call('/api/auth/request-password-reset', {
      method: 'POST',
      body: { email, redirectTo: '/passwort-neu' },
    })
    expect(requested.status).toBe(200)
    const mail = lastMailTo(email)
    expect(mail.subject).toBe('Passwort zurücksetzen')
    const token = linkIn(mail.text).pathname.split('/').at(-1)

    const reset = await call('/api/auth/reset-password', {
      method: 'POST',
      body: { token, newPassword: 'ein-neues-langes-passwort' },
    })
    expect(reset.status).toBe(200)

    const oldPassword = await call('/api/auth/sign-in/email', {
      method: 'POST',
      body: { email, password: PASSWORD },
    })
    expect(oldPassword.status).toBe(401)
    const newPassword = await call('/api/auth/sign-in/email', {
      method: 'POST',
      body: { email, password: 'ein-neues-langes-passwort' },
    })
    expect(newPassword.status).toBe(200)
  })
})

interface Summary {
  id: string
  name: string
  revision: number
  updatedAt: string
}

describe('plans', () => {
  let cookie: string

  beforeAll(async () => {
    cookie = await registerVerifiedUser('plans@example.org')
  })

  it('requires a session', async () => {
    expect((await call('/api/plans')).status).toBe(401)
  })

  it('creates, lists, loads and updates a plan, and rejects stale revisions', async () => {
    const created = await call('/api/plans', { method: 'POST', cookie, body: { document: planDocument() } })
    expect(created.status).toBe(201)
    const { id, revision } = await json<Summary>(created)
    expect(revision).toBe(1)

    const listed = await json<{ plans: Summary[] }>(await call('/api/plans', { cookie }))
    expect(listed.plans.map((p) => p.name)).toEqual(['Informatik B.Sc.'])

    const loaded = await json<Summary & { document: unknown }>(await call(`/api/plans/${id}`, { cookie }))
    expect(loaded.document).toEqual(planDocument())

    const changed = createGuestDocument(
      setModuleResult(planDocument().plan, 'INF-101', { kind: 'graded', grade: 1.3 }),
    )
    const updated = await call(`/api/plans/${id}`, {
      method: 'PUT',
      cookie,
      body: { document: changed, revision: 1 },
    })
    expect(updated.status).toBe(200)
    expect((await json<Summary>(updated)).revision).toBe(2)

    const stale = await call(`/api/plans/${id}`, {
      method: 'PUT',
      cookie,
      body: { document: planDocument(), revision: 1 },
    })
    expect(stale.status).toBe(409)
    const conflict = await json<{ error: string; current: Summary & { document: typeof changed } }>(stale)
    expect(conflict.error).toBe('revision_conflict')
    expect(conflict.current.revision).toBe(2)
    expect(conflict.current.document).toEqual(changed)
  })

  it('rejects documents that are not valid plans', async () => {
    const invalid = await call('/api/plans', {
      method: 'POST',
      cookie,
      body: { document: { hello: 'world' } },
    })
    expect(invalid.status).toBe(422)
    expect(await json(invalid)).toMatchObject({ error: 'invalid_plan', reason: 'not_a_plan' })

    const broken = planDocument()
    broken.plan.backlog.push('INF-101')
    const inconsistent = await call('/api/plans', { method: 'POST', cookie, body: { document: broken } })
    expect(inconsistent.status).toBe(422)

    // A body without a document is a malformed request, not an invalid plan.
    const noDocument = await call('/api/plans', { method: 'POST', cookie, body: {} })
    expect(noDocument.status).toBe(400)
  })

  it('keeps plans private to their owner', async () => {
    const created = await json<Summary>(
      await call('/api/plans', { method: 'POST', cookie, body: { document: planDocument('Privat') } }),
    )
    const stranger = await registerVerifiedUser('stranger@example.org')

    expect((await call(`/api/plans/${created.id}`, { cookie: stranger })).status).toBe(404)
    const overwrite = await call(`/api/plans/${created.id}`, {
      method: 'PUT',
      cookie: stranger,
      body: { document: planDocument('Gekapert'), revision: 1 },
    })
    expect(overwrite.status).toBe(404)
    expect((await call(`/api/plans/${created.id}`, { method: 'DELETE', cookie: stranger })).status).toBe(404)
    expect((await json<{ plans: Summary[] }>(await call('/api/plans', { cookie: stranger }))).plans).toEqual(
      [],
    )
    expect((await call('/api/plans/not-a-uuid', { cookie })).status).toBe(404)
  })

  it('deletes a plan', async () => {
    const created = await json<Summary>(
      await call('/api/plans', { method: 'POST', cookie, body: { document: planDocument('Weg damit') } }),
    )
    expect((await call(`/api/plans/${created.id}`, { method: 'DELETE', cookie })).status).toBe(204)
    expect((await call(`/api/plans/${created.id}`, { cookie })).status).toBe(404)
  })

  it(`allows at most ${MAX_PLANS_PER_USER} plans per account`, async () => {
    const heavy = await registerVerifiedUser('many@example.org')
    for (let index = 0; index < MAX_PLANS_PER_USER; index++) {
      const response = await call('/api/plans', {
        method: 'POST',
        cookie: heavy,
        body: { document: planDocument() },
      })
      expect(response.status).toBe(201)
    }
    const oneTooMany = await call('/api/plans', {
      method: 'POST',
      cookie: heavy,
      body: { document: planDocument() },
    })
    expect(oneTooMany.status).toBe(409)
  })
})

describe('account data', () => {
  it('exports the profile, plans and sessions as a download', async () => {
    const email = 'export@example.org'
    const cookie = await registerVerifiedUser(email)
    await call('/api/plans', { method: 'POST', cookie, body: { document: planDocument() } })

    const response = await call('/api/account/export', { cookie })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="studienplaner-daten-/)
    const data = await json<{
      format: string
      user: { email: string; emailVerified: boolean }
      plans: unknown[]
      sessions: unknown[]
    }>(response)
    expect(data.format).toBe('study-plan.account-export')
    expect(data.user).toMatchObject({ email, emailVerified: true })
    expect(data.plans).toHaveLength(1)
    expect(data.sessions.length).toBeGreaterThan(0)
  })

  it('deletes the account together with its plans after confirming the password', async () => {
    const email = 'delete@example.org'
    const cookie = await registerVerifiedUser(email)
    await call('/api/plans', { method: 'POST', cookie, body: { document: planDocument() } })
    const [{ id: userId } = { id: '' }] = await connection.db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, email))

    const wrong = await call('/api/auth/delete-user', {
      method: 'POST',
      cookie,
      body: { password: 'falsches-passwort' },
    })
    expect(wrong.status).not.toBe(200)

    const deleted = await call('/api/auth/delete-user', {
      method: 'POST',
      cookie,
      body: { password: PASSWORD },
    })
    expect(deleted.status).toBe(200)
    expect(await connection.db.select().from(userTable).where(eq(userTable.id, userId))).toEqual([])
    expect(await connection.db.select().from(planTable).where(eq(planTable.userId, userId))).toEqual([])
    expect((await call('/api/plans', { cookie })).status).toBe(401)
  })
})
