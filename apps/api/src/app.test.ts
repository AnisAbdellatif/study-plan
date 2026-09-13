import { readFileSync } from 'node:fs'
import {
  createGuestDocument,
  createPlanFromPreset,
  moveModule,
  presetSchema,
  setExamDate,
  setModuleResult,
  setTargetGrade,
} from '@study-plan/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { createAuth } from './auth.ts'
import { loadConfig } from './config.ts'
import { type DatabaseConnection, openDatabase } from './db/connection.ts'
import {
  account,
  adminAuditLog,
  planShare,
  plan as planTable,
  reminderDelivery,
  user as userTable,
} from './db/schema.ts'
import { createMemoryMailer, type Mailer } from './mail.ts'
import { berlinDate, runReminders, UNSUBSCRIBE_PATH, verifyUnsubscribeToken } from './reminders.ts'
import { MAX_PLANS_PER_USER } from './routes/plans.ts'

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'pglite://memory',
  PUBLIC_URL: 'http://localhost:5173',
  BETTER_AUTH_SECRET: 'test-secret-that-is-long-enough-for-better-auth',
  ADMIN_EMAILS: ' Admin@example.org , ',
})

const preset = presetSchema.parse(
  JSON.parse(
    readFileSync(
      new URL('../../../packages/shared/examples/informatik-bsc-example.json', import.meta.url),
      'utf8',
    ),
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
      body: { email, redirectTo: '/reset-password' },
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

describe('sharing', () => {
  interface Created {
    token: string
    url: string
  }
  interface SharedResponse {
    name: string
    plan: {
      modules: { code: string; attempts: unknown[]; examDate?: string }[]
      semesters: { moduleCodes: string[] }[]
      targetGrade?: number
    }
  }

  let cookie: string
  let planId: string

  const privateDocument = () => {
    let plan = setModuleResult(planDocument('Geteilter Plan').plan, 'INF-101', { kind: 'graded', grade: 1.3 })
    plan = setExamDate(plan, 'INF-102', '2027-07-20')
    return createGuestDocument(setTargetGrade(plan, 1.7))
  }

  beforeAll(async () => {
    cookie = await registerVerifiedUser('share@example.org')
    const created = await call('/api/plans', {
      method: 'POST',
      cookie,
      body: { document: privateDocument() },
    })
    planId = (await json<Summary>(created)).id
  })

  it('creates a link that shows the structure but no results, exam dates or target grade', async () => {
    expect(await json(await call(`/api/plans/${planId}/share`, { cookie }))).toEqual({
      active: false,
      createdAt: null,
    })

    const created = await call(`/api/plans/${planId}/share`, { method: 'POST', cookie })
    expect(created.status).toBe(201)
    const { token, url } = await json<Created>(created)
    expect(url).toBe(`${config.publicUrl}/shared/${token}`)
    expect(await json(await call(`/api/plans/${planId}/share`, { cookie }))).toMatchObject({ active: true })

    const shared = await call(`/api/share/${token}`)
    expect(shared.status).toBe(200)
    expect(shared.headers.get('x-robots-tag')).toContain('noindex')
    expect(shared.headers.get('cache-control')).toBe('no-store')
    const text = await shared.text()
    expect(text).not.toContain('2027-07-20')
    const body = JSON.parse(text) as SharedResponse
    expect(body.name).toBe('Geteilter Plan')
    expect(
      body.plan.modules.every((module) => module.attempts.length === 0 && module.examDate === undefined),
    ).toBe(true)
    expect(body.plan.targetGrade).toBeUndefined()

    const [stored] = await connection.db.select({ tokenHash: planShare.tokenHash }).from(planShare)
    expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect(stored?.tokenHash).not.toContain(token)
  })

  it('shows later changes to the plan structure', async () => {
    const { token } = await json<Created>(
      await call(`/api/plans/${planId}/share`, { method: 'POST', cookie }),
    )
    const current = await json<Summary>(await call(`/api/plans/${planId}`, { cookie }))
    const moved = createGuestDocument(moveModule(privateDocument().plan, 'BA-601', 's1'))
    await call(`/api/plans/${planId}`, {
      method: 'PUT',
      cookie,
      body: { document: moved, revision: current.revision },
    })

    const body = await json<SharedResponse>(await call(`/api/share/${token}`))
    expect(body.plan.semesters[0]?.moduleCodes).toContain('BA-601')
  })

  it('replaces the previous link when a new one is created, and revokes on request', async () => {
    const first = await json<Created>(await call(`/api/plans/${planId}/share`, { method: 'POST', cookie }))
    const second = await json<Created>(await call(`/api/plans/${planId}/share`, { method: 'POST', cookie }))
    expect((await call(`/api/share/${first.token}`)).status).toBe(404)
    expect((await call(`/api/share/${second.token}`)).status).toBe(200)

    expect((await call(`/api/plans/${planId}/share`, { method: 'DELETE', cookie })).status).toBe(204)
    expect((await call(`/api/share/${second.token}`)).status).toBe(404)
    expect(await json(await call(`/api/plans/${planId}/share`, { cookie }))).toEqual({
      active: false,
      createdAt: null,
    })
  })

  it('does not let anyone else manage the link', async () => {
    const stranger = await registerVerifiedUser('share-stranger@example.org')
    expect((await call(`/api/plans/${planId}/share`, { cookie: stranger })).status).toBe(404)
    expect((await call(`/api/plans/${planId}/share`, { method: 'POST', cookie: stranger })).status).toBe(404)
    expect((await call(`/api/plans/${planId}/share`, { method: 'DELETE', cookie: stranger })).status).toBe(
      404,
    )
    expect((await call(`/api/plans/${planId}/share`, { method: 'POST' })).status).toBe(401)
  })

  it('answers malformed and unknown tokens with 404, and ends sharing when the plan is deleted', async () => {
    expect((await call('/api/share/abc')).status).toBe(404)
    expect((await call('/api/share/AAAAAAAAAAAAAAAAAAAAAAAA')).status).toBe(404)

    const other = await json<Summary>(
      await call('/api/plans', { method: 'POST', cookie, body: { document: planDocument() } }),
    )
    const { token } = await json<Created>(
      await call(`/api/plans/${other.id}/share`, { method: 'POST', cookie }),
    )
    await call(`/api/plans/${other.id}`, { method: 'DELETE', cookie })
    expect((await call(`/api/share/${token}`)).status).toBe(404)
  })

  it('lists share links in the account export without their tokens', async () => {
    const { token } = await json<Created>(
      await call(`/api/plans/${planId}/share`, { method: 'POST', cookie }),
    )
    const response = await call('/api/account/export', { cookie })
    const text = await response.text()
    expect(text).not.toContain(token)
    const data = JSON.parse(text) as { shares: { planId: string; revokedAt: string | null }[] }
    expect(data.shares.some((share) => share.planId === planId && share.revokedAt === null)).toBe(true)
  })
})

describe('reminders', () => {
  const email = 'erinnerung@example.org'
  let cookie = ''

  const reminderDocument = () => {
    const document = planDocument('Mit Prüfungen')
    document.plan = setExamDate(document.plan, 'INF-101', '2027-02-15')
    return document
  }
  const remindersFor = (to: string) =>
    mailer.sent.filter((mail) => mail.to === to && mail.subject.startsWith('Erinnerung'))

  beforeAll(async () => {
    cookie = await registerVerifiedUser(email)
    expect(
      (await call('/api/plans', { method: 'POST', cookie, body: { document: reminderDocument() } })).status,
    ).toBe(201)
  })

  it('uses the German calendar date', () => {
    expect(berlinDate(new Date('2027-02-04T23:30:00Z'))).toBe('2027-02-05')
    expect(berlinDate(new Date('2027-07-04T22:30:00Z'))).toBe('2027-07-05')
  })

  it('sends nothing until the student turns reminders on', async () => {
    expect(await json(await call('/api/account/notifications', { cookie }))).toEqual({ examReminders: false })
    await runReminders({ db: connection.db, mailer, config }, new Date('2027-02-05T08:00:00Z'))
    expect(remindersFor(email)).toEqual([])

    expect(
      (await call('/api/account/notifications', { method: 'PUT', cookie, body: { examReminders: 'ja' } }))
        .status,
    ).toBe(400)
    const updated = await call('/api/account/notifications', {
      method: 'PUT',
      cookie,
      body: { examReminders: true },
    })
    expect(await json(updated)).toEqual({ examReminders: true })
    expect(await json(await call('/api/account/notifications', { cookie }))).toEqual({ examReminders: true })
  })

  it('mails each deadline once, with module and date only and a one-click unsubscribe header', async () => {
    const run = await runReminders({ db: connection.db, mailer, config }, new Date('2027-02-05T08:00:00Z'))
    expect(run).toEqual({ mailsSent: 1, failures: 0 })
    const [mail] = remindersFor(email)
    expect(mail?.subject).toBe('Erinnerung: Abmeldefristen und Prüfungen')
    expect(mail?.text).toContain(
      '- Letzter Tag zur Abmeldung: Grundlagen der Programmierung, Mo., 8. Februar 2027',
    )
    expect(mail?.text).not.toContain('Prüfung: Grundlagen')
    expect(mail?.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    expect(mail?.headers?.['List-Unsubscribe']).toMatch(
      /^<http:\/\/localhost:5173\/api\/notifications\/unsubscribe\?token=/,
    )

    await runReminders({ db: connection.db, mailer, config }, new Date('2027-02-05T18:00:00Z'))
    expect(remindersFor(email)).toHaveLength(1)

    await runReminders({ db: connection.db, mailer, config }, new Date('2027-02-08T08:00:00Z'))
    const reminders = remindersFor(email)
    expect(reminders).toHaveLength(2)
    expect(reminders[1]?.subject).toBe('Erinnerung: anstehende Prüfungen')
    expect(reminders[1]?.text).toContain('- Prüfung: Grundlagen der Programmierung, Mo., 15. Februar 2027')
  })

  it('retries on the next run when sending fails', async () => {
    const other = 'erinnerung-fehler@example.org'
    const otherCookie = await registerVerifiedUser(other)
    await call('/api/plans', { method: 'POST', cookie: otherCookie, body: { document: reminderDocument() } })
    await call('/api/account/notifications', {
      method: 'PUT',
      cookie: otherCookie,
      body: { examReminders: true },
    })

    const failing: Mailer = {
      send: async (mail) => {
        if (mail.to === other) throw new Error('SMTP down')
      },
    }
    const now = new Date('2027-02-06T08:00:00Z')
    const failed = await runReminders({ db: connection.db, mailer: failing, config }, now)
    expect(failed.failures).toBe(1)
    await runReminders({ db: connection.db, mailer, config }, now)
    expect(remindersFor(other)).toHaveLength(1)
  })

  it('lists reminder settings and sent reminders in the account export', async () => {
    const exported = await json<{ notifications: { examReminders: boolean }; reminders: { kind: string }[] }>(
      await call('/api/account/export', { cookie }),
    )
    expect(exported.notifications.examReminders).toBe(true)
    expect(exported.reminders.map((reminder) => reminder.kind).sort()).toEqual(['exam', 'withdrawal'])
  })

  it('unsubscribes with the token from the e-mail, without a session or Origin header', async () => {
    const header = remindersFor(email)[0]?.headers?.['List-Unsubscribe'] ?? ''
    const url = new URL(header.slice(1, -1))
    expect(url.pathname).toBe(UNSUBSCRIBE_PATH)
    const token = url.searchParams.get('token') ?? ''
    const userId = verifyUnsubscribeToken(config.authSecret, token)
    expect(userId).not.toBeNull()

    const forged = await app.request(`${UNSUBSCRIBE_PATH}?token=${encodeURIComponent(`${userId}.falsch`)}`, {
      method: 'POST',
    })
    expect(forged.status).toBe(400)

    const oneClick = await app.request(`${url.pathname}${url.search}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    })
    expect(oneClick.status).toBe(200)
    expect(await json(await call('/api/account/notifications', { cookie }))).toEqual({ examReminders: false })
  })

  it('purges delivery records a month after the deadline', async () => {
    await runReminders({ db: connection.db, mailer, config }, new Date('2027-03-20T08:00:00Z'))
    expect(await connection.db.select().from(reminderDelivery)).toEqual([])
  })
})

describe('admin', () => {
  let adminCookie = ''
  let userCookie = ''
  let userId = ''
  let shareToken = ''

  const userRow = async (email: string) => {
    const [row] = await connection.db.select().from(userTable).where(eq(userTable.email, email))
    if (!row) throw new Error(`no user ${email}`)
    return row
  }

  beforeAll(async () => {
    adminCookie = await registerVerifiedUser('admin@example.org')
    userCookie = await registerVerifiedUser('nutzer@example.org')
    userId = (await userRow('nutzer@example.org')).id
    const created = await json<{ id: string }>(
      await call('/api/plans', {
        method: 'POST',
        cookie: userCookie,
        body: { document: planDocument('Geheim') },
      }),
    )
    const share = await call(`/api/plans/${created.id}/share`, { method: 'POST', cookie: userCookie })
    shareToken = (await json<{ token: string }>(share)).token
    expect((await signUp('offen@example.org')).status).toBe(200)
  })

  it('answers 404 to anyone who is not a listed, verified admin', async () => {
    for (const cookie of [undefined, userCookie]) {
      for (const path of ['/api/admin/me', '/api/admin/stats', '/api/admin/users', '/api/admin/audit']) {
        const response = await call(path, { cookie })
        expect(response.status).toBe(404)
        expect(await json(response)).toEqual({ error: 'not_found' })
      }
      expect((await call(`/api/admin/users/${userId}`, { method: 'DELETE', cookie })).status).toBe(404)
    }
    expect(await userRow('nutzer@example.org')).toBeDefined()
  })

  it('lets the admin in, matching the address case-insensitively', async () => {
    expect(await json(await call('/api/admin/me', { cookie: adminCookie }))).toEqual({
      email: 'admin@example.org',
    })
  })

  it('shows usage numbers without grades or plan contents', async () => {
    const response = await call('/api/admin/stats', { cookie: adminCookie })
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).not.toContain('attempts')
    expect(text).not.toContain('Geheim')
    const stats = JSON.parse(text) as {
      users: { total: number; verified: number }
      plans: { total: number; byPreset: { presetId: string; programmeName: string; plans: number }[] }
      shares: { active: number }
    }
    expect(stats.users.total).toBeGreaterThan(stats.users.verified)
    expect(stats.plans.byPreset).toContainEqual(
      expect.objectContaining({ presetId: 'example/informatik-bsc-example', programmeName: 'Informatik' }),
    )
    expect(stats.plans.byPreset.reduce((sum, row) => sum + row.plans, 0)).toBe(stats.plans.total)
    expect(stats.shares.active).toBeGreaterThanOrEqual(1)
  })

  it('searches accounts by e-mail address and treats wildcards literally', async () => {
    const response = await call('/api/admin/users?q=nutzer@', { cookie: adminCookie })
    const text = await response.text()
    expect(text).not.toContain('document')
    expect(text).not.toContain('Geheim')
    const { users } = JSON.parse(text) as { users: { id: string; plans: number; activeShares: number }[] }
    expect(users).toEqual([
      expect.objectContaining({
        id: userId,
        email: 'nutzer@example.org',
        emailVerified: true,
        plans: 1,
        activeShares: 1,
      }),
    ])
    const wildcard = await json<{ users: unknown[] }>(
      await call('/api/admin/users?q=%25', { cookie: adminCookie }),
    )
    expect(wildcard.users).toEqual([])
  })

  it('resends the verification e-mail only to unverified accounts', async () => {
    const pendingId = (await userRow('offen@example.org')).id
    const before = mailer.sent.filter((mail) => mail.to === 'offen@example.org').length
    const sent = await call(`/api/admin/users/${pendingId}/verification-email`, {
      method: 'POST',
      cookie: adminCookie,
    })
    expect(sent.status).toBe(200)
    expect(mailer.sent.filter((mail) => mail.to === 'offen@example.org')).toHaveLength(before + 1)

    const verified = await call(`/api/admin/users/${userId}/verification-email`, {
      method: 'POST',
      cookie: adminCookie,
    })
    expect(verified.status).toBe(409)
    expect(await json(verified)).toEqual({ error: 'already_verified' })
  })

  it('revokes share links and ends sessions', async () => {
    expect((await call(`/api/share/${shareToken}`)).status).toBe(200)
    const revoked = await call(`/api/admin/users/${userId}/revoke-shares`, {
      method: 'POST',
      cookie: adminCookie,
    })
    expect(await json(revoked)).toEqual({ revoked: 1 })
    expect((await call(`/api/share/${shareToken}`)).status).toBe(404)

    expect((await call('/api/plans', { cookie: userCookie })).status).toBe(200)
    const signedOut = await json<{ sessions: number }>(
      await call(`/api/admin/users/${userId}/sign-out`, { method: 'POST', cookie: adminCookie }),
    )
    expect(signedOut.sessions).toBeGreaterThanOrEqual(1)
    expect((await call('/api/plans', { cookie: userCookie })).status).toBe(401)
  })

  it('refuses actions on the own account and unknown accounts', async () => {
    const adminId = (await userRow('admin@example.org')).id
    const self = await call(`/api/admin/users/${adminId}`, { method: 'DELETE', cookie: adminCookie })
    expect(self.status).toBe(409)
    expect(await json(self)).toEqual({ error: 'cannot_modify_self' })
    expect(
      (await call('/api/admin/users/unbekannt/sign-out', { method: 'POST', cookie: adminCookie })).status,
    ).toBe(404)
  })

  it('deletes an account with everything in it and keeps an audit log without e-mail addresses', async () => {
    const deleted = await call(`/api/admin/users/${userId}`, { method: 'DELETE', cookie: adminCookie })
    expect(deleted.status).toBe(204)
    expect(await connection.db.select().from(userTable).where(eq(userTable.id, userId))).toEqual([])
    expect(await connection.db.select().from(planTable).where(eq(planTable.userId, userId))).toEqual([])

    const { entries } = await json<{
      entries: { action: string; targetUserId: string; adminEmail: string }[]
    }>(await call('/api/admin/audit', { cookie: adminCookie }))
    expect(entries.slice(0, 4).map((entry) => entry.action)).toEqual([
      'delete_user',
      'sign_out',
      'revoke_shares',
      'send_verification_email',
    ])
    expect(entries[0]).toMatchObject({ targetUserId: userId, adminEmail: 'admin@example.org' })
    expect(JSON.stringify(entries)).not.toContain('nutzer@example.org')
  })

  it('purges audit entries older than a year', async () => {
    await connection.db.insert(adminAuditLog).values({
      adminEmail: 'admin@example.org',
      action: 'sign_out',
      targetUserId: 'alt',
      createdAt: new Date('2020-01-01T00:00:00Z'),
    })
    const pendingId = (await userRow('offen@example.org')).id
    await call(`/api/admin/users/${pendingId}/sign-out`, { method: 'POST', cookie: adminCookie })
    const rows = await connection.db.select().from(adminAuditLog).where(eq(adminAuditLog.targetUserId, 'alt'))
    expect(rows).toEqual([])
  })
})

describe('e-mail language', () => {
  const signUpIn = (email: string, locale: string) =>
    call('/api/auth/sign-up/email', {
      method: 'POST',
      body: { email, password: PASSWORD, name: email.split('@')[0], locale },
    })

  it('sends the verification e-mail in the language chosen at sign-up and stores it', async () => {
    expect((await signUpIn('english@example.org', 'en')).status).toBe(200)
    const mail = lastMailTo('english@example.org')
    expect(mail.subject).toBe('Please confirm your e-mail address')
    expect(mail.text).toContain('Study Planner account')
    const [row] = await connection.db
      .select({ locale: userTable.locale })
      .from(userTable)
      .where(eq(userTable.email, 'english@example.org'))
    expect(row?.locale).toBe('en')
  })

  it('falls back to German for missing or unknown languages', async () => {
    expect((await signUpIn('french@example.org', 'fr')).status).toBe(200)
    expect(lastMailTo('french@example.org').subject).toBe('Bitte bestätige deine E-Mail-Adresse')
    expect((await signUp('ohne-sprache@example.org')).status).toBe(200)
    expect(lastMailTo('ohne-sprache@example.org').subject).toBe('Bitte bestätige deine E-Mail-Adresse')
  })

  it('follows a language change for password reset and reminder e-mails', async () => {
    const email = 'switch@example.org'
    const cookie = await registerVerifiedUser(email)
    const updated = await call('/api/auth/update-user', { method: 'POST', cookie, body: { locale: 'en' } })
    expect(updated.status).toBe(200)

    await call('/api/auth/request-password-reset', {
      method: 'POST',
      body: { email, redirectTo: '/reset-password' },
    })
    expect(lastMailTo(email).subject).toBe('Reset your password')

    const document = planDocument('Exams')
    document.plan = setExamDate(document.plan, 'INF-101', '2027-06-21')
    await call('/api/plans', { method: 'POST', cookie, body: { document } })
    await call('/api/account/notifications', { method: 'PUT', cookie, body: { examReminders: true } })
    await runReminders({ db: connection.db, mailer, config }, new Date('2027-06-11T08:00:00Z'))
    const exported = await json<{ user: { locale: string } }>(await call('/api/account/export', { cookie }))
    expect(exported.user.locale).toBe('en')

    const reminder = lastMailTo(email)
    expect(reminder.subject).toBe('Reminder: withdrawal deadlines and exams')
    expect(reminder.text).toMatch(/- Last day to withdraw: Grundlagen der Programmierung, Mon,? 14 June 2027/)
    expect(reminder.text).toContain('Stop all reminders: http://localhost:5173/unsubscribe?token=')
  })
})
