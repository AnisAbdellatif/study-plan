import { readFileSync } from 'node:fs'
import {
  createGuestDocument,
  createPlanFromPreset,
  extractGrades,
  moveModule,
  type Plan,
  presetSchema,
  setExamDate,
  setModuleResult,
  setTargetGrade,
} from '@study-plan/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { createAuth } from './auth.ts'
import { chatSettings, updateChatSettings } from './chat/settings.ts'
import { chatUsageReport } from './chat/usage.ts'
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
import { createScriptedLlm } from './llm/scripted.ts'
import type { LlmModelInfo } from './llm/types.ts'
import { createMemoryMailer, type Mailer } from './mail.ts'
import { berlinDate, runReminders, UNSUBSCRIBE_PATH, verifyUnsubscribeToken } from './reminders.ts'
import { ensureSuperadmin } from './roles.ts'

const config = loadConfig({
  NODE_ENV: 'test',
  // CI also runs these tests against a real PostgreSQL server, see the postgres job in .github/workflows/ci.yml.
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'pglite://memory',
  PUBLIC_URL: 'http://localhost:5173',
  BETTER_AUTH_SECRET: 'test-secret-that-is-long-enough-for-better-auth',
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

/** A plan as the browser sends it: grades taken out and encrypted. The ciphertext is a stand-in. */
const SEALED_DATA = 'c2VhbGVkLWdyYWRlcw=='
const sealedDocument = (plan: Plan) => ({
  ...createGuestDocument(extractGrades(plan).plan),
  encryptedGrades: { v: 1, iv: 'AAAAAAAAAAAAAAAA', data: SEALED_DATA },
})

const PASSWORD = 'richtig-langes-passwort'
const mailer = createMemoryMailer()
let connection: DatabaseConnection
let auth: ReturnType<typeof createAuth>
let app: ReturnType<typeof createApp>

beforeAll(async () => {
  connection = await openDatabase(config.databaseUrl)
  await connection.migrate()
  auth = createAuth({ config, db: connection.db, mailer })
  app = createApp({ config, db: connection.db, auth, mailer })
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

async function signIn(email: string, password = PASSWORD) {
  return call('/api/auth/sign-in/email', { method: 'POST', body: { email, password } })
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

    const graded = setModuleResult(planDocument().plan, 'INF-101', { kind: 'graded', grade: 1.3 })
    // A readable grade or target grade is never stored; the browser sends grades encrypted.
    const plaintext = await call(`/api/plans/${id}`, {
      method: 'PUT',
      cookie,
      body: { document: createGuestDocument(graded), revision: 1 },
    })
    expect(plaintext.status).toBe(422)
    expect(await json(plaintext)).toEqual({ error: 'grades_not_encrypted' })
    const withTarget = createGuestDocument(setTargetGrade(planDocument().plan, 1.7))
    expect(
      (await call('/api/plans', { method: 'POST', cookie, body: { document: withTarget } })).status,
    ).toBe(422)

    const changed = sealedDocument(graded)
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

  it('allows 4 plans by default; admins change the global and the per-account limit', async () => {
    const adminEmail = 'limits-admin@example.org'
    const admin = await registerVerifiedUser(adminEmail)
    await connection.db.update(userTable).set({ role: 'admin' }).where(eq(userTable.email, adminEmail))
    const student = await registerVerifiedUser('limits-student@example.org')
    const [studentRow] = await connection.db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.email, 'limits-student@example.org'))
    const studentId = studentRow?.id ?? ''
    const create = () =>
      call('/api/plans', { method: 'POST', cookie: student, body: { document: planDocument() } })

    for (let index = 0; index < 4; index++) expect((await create()).status).toBe(201)
    const blocked = await create()
    expect(blocked.status).toBe(409)
    expect(await json(blocked)).toEqual({ error: 'too_many_plans', limit: 4 })
    expect(await json(await call('/api/plans', { cookie: student }))).toMatchObject({ limit: 4 })

    // Students never reach the settings.
    expect((await call('/api/admin/settings', { cookie: student })).status).toBe(404)

    expect(await json(await call('/api/admin/settings', { cookie: admin }))).toEqual({ maxPlansPerUser: 4 })
    const raised = await call('/api/admin/settings', {
      method: 'PUT',
      cookie: admin,
      body: { maxPlansPerUser: 5 },
    })
    expect(raised.status).toBe(200)
    expect((await create()).status).toBe(201)
    expect((await create()).status).toBe(409)

    const own = await call(`/api/admin/users/${studentId}/plan-limit`, {
      method: 'PUT',
      cookie: admin,
      body: { planLimit: 6 },
    })
    expect(await json(own)).toEqual({ planLimit: 6 })
    const listed = await json<{ users: { email: string; planLimit: number | null; plans: number }[] }>(
      await call('/api/admin/users?q=limits-student', { cookie: admin }),
    )
    expect(listed.users[0]).toMatchObject({ planLimit: 6, plans: 5 })
    expect(await json(await call('/api/plans', { cookie: student }))).toMatchObject({ limit: 6 })
    expect((await create()).status).toBe(201)
    expect((await create()).status).toBe(409)

    // Unlimited assistant messages are granted and taken back the same way, and show in the list.
    const unlimitedChat = await call(`/api/admin/users/${studentId}/unlimited-chat`, {
      method: 'PUT',
      cookie: admin,
      body: { unlimitedChat: true },
    })
    expect(await json(unlimitedChat)).toEqual({ unlimitedChat: true })
    expect(
      (
        await json<{ users: { unlimitedChat: boolean }[] }>(
          await call('/api/admin/users?q=limits-student', { cookie: admin }),
        )
      ).users[0],
    ).toMatchObject({ unlimitedChat: true })
    expect(
      (
        await call(`/api/admin/users/${studentId}/unlimited-chat`, {
          method: 'PUT',
          cookie: admin,
          body: { unlimitedChat: 'yes' },
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await call(`/api/admin/users/${studentId}/unlimited-chat`, {
          method: 'PUT',
          cookie: student,
          body: { unlimitedChat: true },
        })
      ).status,
    ).toBe(404)
    await call(`/api/admin/users/${studentId}/unlimited-chat`, {
      method: 'PUT',
      cookie: admin,
      body: { unlimitedChat: false },
    })

    // Back to the global value: the six plans stay, but no new one fits.
    await call(`/api/admin/users/${studentId}/plan-limit`, {
      method: 'PUT',
      cookie: admin,
      body: { planLimit: null },
    })
    expect(await json(await call('/api/plans', { cookie: student }))).toMatchObject({ limit: 5 })
    expect(
      (await json<{ plans: unknown[] }>(await call('/api/plans', { cookie: student }))).plans,
    ).toHaveLength(6)

    for (const value of [0, 51, 2.5, '4']) {
      const invalid = await call('/api/admin/settings', {
        method: 'PUT',
        cookie: admin,
        body: { maxPlansPerUser: value },
      })
      expect(invalid.status).toBe(400)
    }
    await call('/api/admin/settings', { method: 'PUT', cookie: admin, body: { maxPlansPerUser: 4 } })

    // Admins ask the assistant without the daily limit by default; students keep it unless it is lifted.
    expect(await json(await call('/api/chat/status', { cookie: admin }))).toMatchObject({
      unlimited: true,
      remaining: null,
    })
    expect(await json(await call('/api/chat/status', { cookie: student }))).toMatchObject({
      unlimited: false,
      remaining: 20,
    })
    // Leave no extra admin behind for the admin tests further down.
    await connection.db.update(userTable).set({ role: 'user' }).where(eq(userTable.email, adminEmail))
  })
})

describe('chat', () => {
  it('answers from programme data only, keeps a daily limit and needs one of the account’s plans', async () => {
    const llm = createScriptedLlm([
      {
        toolCalls: [{ id: 'c1', name: 'get_module', arguments: JSON.stringify({ code: 'INF-101' }) }],
        usage: { promptTokens: 100, completionTokens: 5, cost: 0.002 },
      },
      {
        content: 'INF-101 wird im Wintersemester angeboten.',
        usage: { promptTokens: 200, completionTokens: 20, cost: 0.003 },
      },
    ])
    const chatApp = createApp({ config, db: connection.db, auth, mailer, llm })
    const ask = (options: CallOptions) => {
      const headers = new Headers({ origin: config.publicOrigin, 'content-type': 'application/json' })
      if (options.cookie) headers.set('cookie', options.cookie)
      return chatApp.request(options.body === undefined ? '/api/chat/status' : '/api/chat', {
        method: options.body === undefined ? 'GET' : 'POST',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      })
    }

    const cookie = await registerVerifiedUser('chat@example.org')
    let secretPlan = setModuleResult(planDocument('Mein Plan').plan, 'INF-101', {
      kind: 'graded',
      grade: 2.3,
    })
    secretPlan = setExamDate(secretPlan, 'INF-101', '2027-02-15')
    secretPlan = setTargetGrade(secretPlan, 1.7)
    const created = await json<{ id: string }>(
      await call('/api/plans', { method: 'POST', cookie, body: { document: sealedDocument(secretPlan) } }),
    )
    const question = {
      planId: created.id,
      locale: 'de',
      messages: [{ role: 'user', content: 'Wann wird INF-101 angeboten?' }],
    }

    expect((await ask({ body: question })).status).toBe(401)
    expect(await json(await ask({ cookie }))).toEqual({
      available: true,
      dailyLimit: 20,
      unlimited: false,
      remaining: 20,
    })

    const answered = await ask({ cookie, body: question })
    expect(answered.status).toBe(200)
    expect(await json(answered)).toEqual({
      reply: 'INF-101 wird im Wintersemester angeboten.',
      modules: [{ code: 'INF-101', name: expect.any(String) }],
      remaining: 19,
    })
    // Nothing of the student's own data went to the model.
    const sent = JSON.stringify(llm.requests)
    for (const secret of ['attempts', '2027-02-15', 'targetGrade', '"grade"', SEALED_DATA])
      expect(sent, secret).not.toContain(secret)

    // The admin dashboard gets totals per day and model, nothing tied to the account.
    const usage = await chatUsageReport(connection.db)
    expect(usage.totals.today).toMatchObject({
      questions: 1,
      failed: 0,
      calls: 2,
      promptTokens: 300,
      completionTokens: 25,
    })
    expect(usage.totals.today.cost).toBeCloseTo(0.005)
    expect(usage.models).toMatchObject([{ model: 'test/scripted', questions: 1, calls: 2 }])
    expect(usage.days).toHaveLength(30)
    expect(usage.days.at(-1)).toMatchObject({ day: berlinDate(new Date()), questions: 1 })

    const foreign = await ask({ cookie, body: { ...question, planId: crypto.randomUUID() } })
    expect(foreign.status).toBe(404)
    expect((await ask({ cookie, body: { ...question, messages: [] } })).status).toBe(400)

    await updateChatSettings(connection.db, { enabled: true, dailyLimit: 2, model: null })
    expect((await ask({ cookie, body: question })).status).toBe(200)
    const limited = await ask({ cookie, body: question })
    expect(limited.status).toBe(429)
    expect(await json(limited)).toEqual({ error: 'chat_quota_exceeded', dailyLimit: 2 })

    // An admin lifts the limit for this account: questions go through and nothing counts down.
    const chatUser = eq(userTable.email, 'chat@example.org')
    await connection.db.update(userTable).set({ unlimitedChat: true }).where(chatUser)
    expect(await json(await ask({ cookie }))).toMatchObject({ unlimited: true, remaining: null })
    const unlimited = await ask({ cookie, body: question })
    expect(unlimited.status).toBe(200)
    expect(await json(unlimited)).toMatchObject({ remaining: null })
    await connection.db.update(userTable).set({ unlimitedChat: false }).where(chatUser)
    expect((await ask({ cookie, body: question })).status).toBe(429)

    await updateChatSettings(connection.db, { enabled: false, dailyLimit: 20, model: null })
    expect((await ask({ cookie, body: question })).status).toBe(503)
    await updateChatSettings(connection.db, { enabled: true, dailyLimit: 20, model: null })
    expect(await chatSettings(connection.db)).toEqual({ enabled: true, dailyLimit: 20, model: null })

    // A blank answer still held by an older browser tab doesn't break the conversation.
    const afterBlank = await ask({
      cookie,
      body: {
        ...question,
        messages: [
          { role: 'user', content: 'Erste Frage' },
          { role: 'assistant', content: '' },
          { role: 'user', content: 'Zweite Frage' },
        ],
      },
    })
    expect(afterBlank.status).toBe(200)
    expect(llm.requests.at(-1)?.messages.filter((message) => message.role === 'assistant')).toEqual([])

    // The app without a model reports the chat as unavailable.
    expect(await json(await call('/api/chat/status', { cookie }))).toMatchObject({ available: false })
  })

  it('lets admins switch the model once it exists and supports tools, and asks to confirm a paid one', async () => {
    const info = (id: string, overrides: Partial<LlmModelInfo> = {}): LlmModelInfo => ({
      id,
      name: id,
      providers: 2,
      supportsTools: true,
      free: false,
      pricing: { prompt: 0.1, completion: 0.4 },
      contextLength: 131072,
      ...overrides,
    })
    const llm = createScriptedLlm([{ content: 'Antwort' }], 'default/model', {
      'paid/model': info('paid/model'),
      'free/model:free': info('free/model:free', { free: true, pricing: { prompt: 0, completion: 0 } }),
      'plain/model': info('plain/model', { supportsTools: false }),
    })
    const chatApp = createApp({ config, db: connection.db, auth, mailer, llm })
    const request = (path: string, { method = 'GET', body, cookie }: CallOptions = {}) => {
      const headers = new Headers({ origin: config.publicOrigin, 'content-type': 'application/json' })
      if (cookie) headers.set('cookie', cookie)
      return chatApp.request(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    }
    const adminEmail = 'model-admin@example.org'
    const admin = await registerVerifiedUser(adminEmail)
    await connection.db.update(userTable).set({ role: 'admin' }).where(eq(userTable.email, adminEmail))
    const save = (model: string | null, acceptPaid?: boolean) =>
      request('/api/admin/chat', {
        method: 'PUT',
        cookie: admin,
        body: { enabled: true, dailyLimit: 20, model, ...(acceptPaid === undefined ? {} : { acceptPaid }) },
      })

    expect(await json(await request('/api/admin/chat', { cookie: admin }))).toEqual({
      enabled: true,
      dailyLimit: 20,
      configured: true,
      model: 'default/model',
      customModel: null,
      defaultModel: 'default/model',
    })

    const unknown = await save('nobody/model')
    expect(unknown.status).toBe(400)
    expect(await json(unknown)).toEqual({ error: 'unknown_model' })
    expect(await json(await save('plain/model'))).toMatchObject({ error: 'model_without_tools' })
    expect((await save('../../key')).status).toBe(400)

    const check = await request('/api/admin/chat/model-check', {
      method: 'POST',
      cookie: admin,
      body: { model: 'paid/model' },
    })
    expect(await json(check)).toEqual({ model: info('paid/model') })

    const unconfirmed = await save('paid/model')
    expect(unconfirmed.status).toBe(409)
    expect(await json(unconfirmed)).toMatchObject({ error: 'model_not_free', model: { id: 'paid/model' } })
    expect((await chatSettings(connection.db)).model).toBeNull()

    expect(await json(await save('paid/model', true))).toMatchObject({
      model: 'paid/model',
      customModel: 'paid/model',
    })
    // Saving the other settings again keeps the confirmed model without asking once more.
    expect((await save('paid/model')).status).toBe(200)

    // The chat now asks the chosen model.
    const created = await json<{ id: string }>(
      await call('/api/plans', { method: 'POST', cookie: admin, body: { document: planDocument() } }),
    )
    const asked = await request('/api/chat', {
      method: 'POST',
      cookie: admin,
      body: { planId: created.id, locale: 'de', messages: [{ role: 'user', content: 'Hallo' }] },
    })
    expect(asked.status).toBe(200)
    expect(llm.requests.at(-1)?.model).toBe('paid/model')

    expect((await save('free/model:free')).status).toBe(200)
    expect(await json(await save(null))).toMatchObject({ model: 'default/model', customModel: null })

    // Leave no extra admin behind for the admin tests further down.
    await connection.db.update(userTable).set({ role: 'user' }).where(eq(userTable.email, adminEmail))
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
    return sealedDocument(setTargetGrade(plan, 1.7))
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
      includeGrades: false,
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
      includeGrades: false,
    })
  })

  it('never shares results or grades, even when an older client asks for them', async () => {
    const created = await call(`/api/plans/${planId}/share`, {
      method: 'POST',
      cookie,
      body: { includeGrades: true },
    })
    expect(created.status).toBe(201)
    const { token } = await json<Created & { includeGrades: boolean }>(created)
    expect(await json(await call(`/api/plans/${planId}/share`, { cookie }))).toMatchObject({
      active: true,
      includeGrades: false,
    })

    const text = await (await call(`/api/share/${token}`)).text()
    expect(text).not.toContain('2027-07-20')
    expect(text).not.toContain(SEALED_DATA)
    const body = JSON.parse(text) as SharedResponse & { includeGrades: boolean }
    expect(body.includeGrades).toBe(false)
    expect(body.plan.modules.every((module) => module.attempts.length === 0)).toBe(true)
    expect(body.plan.modules.every((module) => module.examDate === undefined)).toBe(true)
    expect(body.plan.targetGrade).toBeUndefined()

    const invalid = await call(`/api/plans/${planId}/share`, {
      method: 'POST',
      cookie,
      body: { includeGrades: 'yes' },
    })
    expect(invalid.status).toBe(400)
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
  const SUPERADMIN = { email: 'chef@example.org', password: 'superadmin-passwort-1', name: 'Chef' }
  let superCookie = ''
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
    expect(await ensureSuperadmin(connection.db, auth, SUPERADMIN)).toBe('created')
    superCookie = sessionCookie(await signIn(SUPERADMIN.email, SUPERADMIN.password))
    expect(superCookie).toContain('session_token')
    adminCookie = await registerVerifiedUser('admin@example.org')
    const adminId = (await userRow('admin@example.org')).id
    const granted = await call(`/api/admin/users/${adminId}/role`, {
      method: 'PUT',
      cookie: superCookie,
      body: { role: 'admin' },
    })
    expect(await json(granted)).toEqual({ role: 'admin' })
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

  it('lets admins in with their role', async () => {
    expect(await json(await call('/api/admin/me', { cookie: adminCookie }))).toEqual({
      email: 'admin@example.org',
      role: 'admin',
    })
    expect(await json(await call('/api/admin/me', { cookie: superCookie }))).toEqual({
      email: 'chef@example.org',
      role: 'superadmin',
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

  it('reports mail delivery, checks the connection and sends a test e-mail to the admin', async () => {
    const status = await json<{ transport: string; lastSuccess: { at: string } | null }>(
      await call('/api/admin/mail', { cookie: adminCookie }),
    )
    expect(status.transport).toBe('memory')
    expect(status.lastSuccess).not.toBeNull()
    expect(
      await json(await call('/api/admin/mail/verify', { method: 'POST', cookie: adminCookie })),
    ).toMatchObject({
      ok: true,
    })

    const sent = await call('/api/admin/mail/test', { method: 'POST', cookie: adminCookie })
    expect(await json(sent)).toEqual({ ok: true, to: 'admin@example.org' })
    expect(lastMailTo('admin@example.org').subject).toContain('Test')

    mailer.failWith = 'Invalid login: 535 Authentication failed'
    try {
      expect(
        await json(await call('/api/admin/mail/verify', { method: 'POST', cookie: adminCookie })),
      ).toEqual({
        ok: false,
        error: 'Invalid login: 535 Authentication failed',
      })
      expect(await json(await call('/api/admin/mail/test', { method: 'POST', cookie: adminCookie }))).toEqual(
        {
          ok: false,
          error: 'Invalid login: 535 Authentication failed',
        },
      )
      const after = await json<{ lastFailure: { error: string } | null }>(
        await call('/api/admin/mail', { cookie: adminCookie }),
      )
      expect(after.lastFailure?.error).toBe('Invalid login: 535 Authentication failed')
    } finally {
      mailer.failWith = null
    }

    const { entries } = await json<{ entries: { action: string }[] }>(
      await call('/api/admin/audit', { cookie: adminCookie }),
    )
    expect(entries.slice(0, 2).map((entry) => entry.action)).toEqual(['send_test_email', 'send_test_email'])
    expect((await call('/api/admin/mail')).status).toBe(404)
  })

  describe('presets', () => {
    interface PresetSummary {
      id: string
      universityName: string
      programmeName: string
      degree: string
      poVersion: string
      updatedAt: string
    }

    const upload = (path: string, method: string, body: unknown, cookie = adminCookie) =>
      call(path, { method, cookie, body })

    const presetFile = (changes: Record<string, unknown> = {}) => ({ ...preset, ...changes })

    it('answers 404 to anyone who is not an admin', async () => {
      const student = await registerVerifiedUser('vorlagen-studi@example.org')
      for (const cookie of [undefined, student]) {
        const response = await call('/api/admin/presets', { method: 'POST', cookie, body: presetFile() })
        expect(response.status).toBe(404)
        expect(await json(response)).toEqual({ error: 'not_found' })
      }
      expect(await json(await call('/api/presets'))).toEqual({ presets: [] })
    })

    it('creates, lists, loads, replaces and deletes presets with a stable id', async () => {
      const created = await upload('/api/admin/presets', 'POST', presetFile())
      expect(created.status).toBe(201)
      const { preset: summary } = await json<{ preset: PresetSummary }>(created)
      expect(summary).toMatchObject({
        universityName: preset.university.name,
        programmeName: 'Informatik',
        degree: 'bsc',
        poVersion: preset.poVersion,
      })

      const second = await upload(
        '/api/admin/presets',
        'POST',
        presetFile({ university: { slug: 'aaa', name: 'Aachen Test' } }),
        superCookie,
      )
      expect(second.status).toBe(201)

      // Public, no session, sorted by university.
      const listed = await json<{ presets: PresetSummary[] }>(await call('/api/presets'))
      expect(listed.presets.map((entry) => entry.universityName)).toEqual([
        'Aachen Test',
        preset.university.name,
      ])
      expect(listed.presets[1]).toEqual({ ...summary })

      const loaded = await json<{ preset: { id: string; modules: unknown[] } }>(
        await call(`/api/presets/${summary.id}`),
      )
      expect(loaded.preset.id).toBe(`preset/${summary.id}`)
      expect(presetSchema.safeParse(loaded.preset).success).toBe(true)
      expect(loaded.preset.modules).toHaveLength(preset.modules.length)

      const replaced = await upload(
        `/api/admin/presets/${summary.id}`,
        'PUT',
        presetFile({ id: 'someone/else', poVersion: 'PO 2030', modules: preset.modules.slice(0) }),
      )
      expect(replaced.status).toBe(200)
      expect((await json<{ preset: PresetSummary }>(replaced)).preset).toMatchObject({
        id: summary.id,
        poVersion: 'PO 2030',
      })
      const reloaded = await json<{ preset: { id: string; poVersion: string } }>(
        await call(`/api/presets/${summary.id}`),
      )
      expect(reloaded.preset).toMatchObject({ id: `preset/${summary.id}`, poVersion: 'PO 2030' })

      expect((await upload(`/api/admin/presets/${summary.id}`, 'DELETE', undefined)).status).toBe(204)
      expect((await call(`/api/presets/${summary.id}`)).status).toBe(404)
      expect((await upload(`/api/admin/presets/${summary.id}`, 'DELETE', undefined)).status).toBe(404)
      expect((await call('/api/presets/not-a-uuid')).status).toBe(404)
      expect((await upload('/api/admin/presets/not-a-uuid', 'PUT', presetFile())).status).toBe(404)

      const { entries } = await json<{ entries: { action: string; targetUserId: string }[] }>(
        await call('/api/admin/audit', { cookie: adminCookie }),
      )
      expect(entries.slice(0, 3)).toEqual([
        expect.objectContaining({ action: 'delete_preset', targetUserId: summary.id }),
        expect.objectContaining({ action: 'update_preset', targetUserId: summary.id }),
        expect.objectContaining({ action: 'create_preset' }),
      ])
    })

    it('rejects invalid programme files with the issues', async () => {
      const invalid = await upload('/api/admin/presets', 'POST', { modules: [] })
      expect(invalid.status).toBe(400)
      const body = await json<{ error: string; reason: string; issues: { path: string; message: string }[] }>(
        invalid,
      )
      expect(body).toMatchObject({ error: 'invalid_preset', reason: 'invalid_preset' })
      expect(body.issues.map((issue) => issue.path)).toContain('university.name')

      const notJson = await app.request('/api/admin/presets', {
        method: 'POST',
        headers: { origin: config.publicOrigin, cookie: adminCookie, 'content-type': 'application/json' },
        body: '{"kaputt": }',
      })
      expect(notJson.status).toBe(400)
      expect(await json(notJson)).toMatchObject({ error: 'invalid_preset', reason: 'invalid_json' })
    })

    it('refuses a second preset for the same university, programme, degree and PO version', async () => {
      const file = presetFile({ poVersion: 'PO Doppelt' })
      const first = await json<{ preset: PresetSummary }>(await upload('/api/admin/presets', 'POST', file))
      const duplicate = await upload('/api/admin/presets', 'POST', { ...file, notes: 'andere Notizen' })
      expect(duplicate.status).toBe(409)
      expect(await json(duplicate)).toEqual({ error: 'preset_exists' })

      const other = await json<{ preset: PresetSummary }>(
        await upload('/api/admin/presets', 'POST', presetFile({ poVersion: 'PO Anders' })),
      )
      const clash = await upload(`/api/admin/presets/${other.preset.id}`, 'PUT', file)
      expect(clash.status).toBe(409)
      // Replacing a preset with data of the same programme is not a clash with itself.
      expect((await upload(`/api/admin/presets/${first.preset.id}`, 'PUT', file)).status).toBe(200)
    })

    it('accepts programme files above the general 1 MB limit, up to 5 MB', async () => {
      const large = presetFile({ poVersion: 'PO Groß', notes: 'x'.repeat(2 * 1024 * 1024) })
      expect((await upload('/api/admin/presets', 'POST', large)).status).toBe(201)
      const tooLarge = presetFile({ poVersion: 'PO Riesig', notes: 'x'.repeat(6 * 1024 * 1024) })
      expect((await upload('/api/admin/presets', 'POST', tooLarge)).status).toBe(413)
      expect(
        (await call('/api/plans', { method: 'POST', cookie: adminCookie, body: { document: large } })).status,
      ).toBe(413)
    })
  })

  describe('superadmin', () => {
    it('is created once as a verified password account and never overwritten on later starts', async () => {
      const row = await userRow('chef@example.org')
      expect(row).toMatchObject({ role: 'superadmin', emailVerified: true, name: 'Chef' })
      const [created] = await connection.db.select().from(account).where(eq(account.userId, row.id))
      const [signedUp] = await connection.db
        .select()
        .from(account)
        .where(eq(account.userId, (await userRow('admin@example.org')).id))
      expect(created).toMatchObject({ providerId: 'credential', issuer: signedUp?.issuer })

      expect(
        await ensureSuperadmin(connection.db, auth, { ...SUPERADMIN, password: 'ein-anderes-passwort' }),
      ).toBe('exists')
      expect(
        await ensureSuperadmin(connection.db, auth, { ...SUPERADMIN, email: 'jemand@example.org' }),
      ).toBe('exists')
      expect((await signIn(SUPERADMIN.email, SUPERADMIN.password)).status).toBe(200)
      expect((await signIn(SUPERADMIN.email, 'ein-anderes-passwort')).status).toBe(401)
      const superadmins = await connection.db.select().from(userTable).where(eq(userTable.role, 'superadmin'))
      expect(superadmins).toHaveLength(1)
    })

    it('allows only one superadmin in the database', async () => {
      await expect(
        connection.db
          .update(userTable)
          .set({ role: 'superadmin' })
          .where(eq(userTable.email, 'admin@example.org')),
      ).rejects.toThrow()
    })

    it('keeps roles out of reach of the auth API', async () => {
      const cookie = await registerVerifiedUser('streber@example.org')
      await call('/api/auth/update-user', { method: 'POST', cookie, body: { role: 'superadmin' } })
      expect((await userRow('streber@example.org')).role).toBe('user')
      await call('/api/auth/sign-up/email', {
        method: 'POST',
        body: { email: 'frech@example.org', password: PASSWORD, name: 'frech', role: 'admin' },
      })
      const [row] = await connection.db
        .select()
        .from(userTable)
        .where(eq(userTable.email, 'frech@example.org'))
      expect(row?.role ?? 'user').toBe('user')
    })

    it('never needs e-mail verification: dashboard, sign-in and restarts all work unverified', async () => {
      const unverify = () =>
        connection.db
          .update(userTable)
          .set({ emailVerified: false })
          .where(eq(userTable.email, SUPERADMIN.email))

      await unverify()
      expect((await call('/api/admin/me', { cookie: superCookie })).status).toBe(200)

      const signedIn = await signIn(SUPERADMIN.email.toUpperCase(), SUPERADMIN.password)
      expect(signedIn.status).toBe(200)
      expect((await userRow(SUPERADMIN.email)).emailVerified).toBe(true)

      await unverify()
      expect(await ensureSuperadmin(connection.db, auth, SUPERADMIN)).toBe('exists')
      expect((await userRow(SUPERADMIN.email)).emailVerified).toBe(true)
    })

    it('still requires verification from everyone else, admins included', async () => {
      await connection.db
        .update(userTable)
        .set({ emailVerified: false })
        .where(eq(userTable.email, 'admin@example.org'))
      expect((await call('/api/admin/me', { cookie: adminCookie })).status).toBe(404)
      expect((await signIn('admin@example.org')).status).toBe(403)
      expect((await userRow('admin@example.org')).emailVerified).toBe(false)
      await connection.db
        .update(userTable)
        .set({ emailVerified: true })
        .where(eq(userTable.email, 'admin@example.org'))
    })

    it('protects the superadmin from admins and from deleting itself', async () => {
      const superId = (await userRow('chef@example.org')).id
      for (const [path, method] of [
        [`/api/admin/users/${superId}`, 'DELETE'],
        [`/api/admin/users/${superId}/sign-out`, 'POST'],
      ] as const) {
        const response = await call(path, { method, cookie: adminCookie })
        expect(response.status).toBe(403)
        expect(await json(response)).toEqual({ error: 'protected_account' })
      }
      const self = await call(`/api/admin/users/${superId}`, { method: 'DELETE', cookie: superCookie })
      expect(self.status).toBe(409)
      const viaAuth = await call('/api/auth/delete-user', {
        method: 'POST',
        cookie: superCookie,
        body: { password: SUPERADMIN.password },
      })
      expect(viaAuth.status).toBe(403)
      expect(await userRow('chef@example.org')).toBeDefined()
    })

    it('lets only the superadmin create, demote and delete admins', async () => {
      const newAdmin = { email: 'Zweite@example.org', password: 'zweites-admin-passwort', name: 'Zweite' }
      const byAdmin = await call('/api/admin/admins', { method: 'POST', cookie: adminCookie, body: newAdmin })
      expect(byAdmin.status).toBe(403)
      expect(await json(byAdmin)).toEqual({ error: 'requires_superadmin' })

      const created = await call('/api/admin/admins', { method: 'POST', cookie: superCookie, body: newAdmin })
      expect(created.status).toBe(201)
      const { id } = await json<{ id: string }>(created)
      expect(
        (await call('/api/admin/admins', { method: 'POST', cookie: superCookie, body: newAdmin })).status,
      ).toBe(409)
      const secondCookie = sessionCookie(await signIn('zweite@example.org', newAdmin.password))
      expect(await json(await call('/api/admin/me', { cookie: secondCookie }))).toMatchObject({
        role: 'admin',
      })

      const listed = await json<{ users: { email: string; role: string }[] }>(
        await call('/api/admin/users?role=admin', { cookie: superCookie }),
      )
      expect(listed.users.map((entry) => entry.email).sort()).toEqual([
        'admin@example.org',
        'chef@example.org',
        'zweite@example.org',
      ])

      // Admins cannot act on each other.
      for (const response of [
        await call(`/api/admin/users/${id}/sign-out`, { method: 'POST', cookie: adminCookie }),
        await call(`/api/admin/users/${id}/role`, {
          method: 'PUT',
          cookie: adminCookie,
          body: { role: 'user' },
        }),
      ]) {
        expect(response.status).toBe(403)
      }

      const demoted = await call(`/api/admin/users/${id}/role`, {
        method: 'PUT',
        cookie: superCookie,
        body: { role: 'user' },
      })
      expect(await json(demoted)).toEqual({ role: 'user' })
      expect((await call('/api/admin/me', { cookie: secondCookie })).status).toBe(404)

      const invalid = await call(`/api/admin/users/${id}/role`, {
        method: 'PUT',
        cookie: superCookie,
        body: { role: 'superadmin' },
      })
      expect(invalid.status).toBe(400)

      const adminId = (await userRow('admin@example.org')).id
      expect(
        (await call(`/api/admin/users/${adminId}`, { method: 'DELETE', cookie: superCookie })).status,
      ).toBe(204)
      expect((await call('/api/admin/me', { cookie: adminCookie })).status).toBe(404)

      const { entries } = await json<{ entries: { action: string }[] }>(
        await call('/api/admin/audit', { cookie: superCookie }),
      )
      expect(entries.slice(0, 3).map((entry) => entry.action)).toEqual([
        'delete_user',
        'revoke_admin',
        'create_admin',
      ])
    })
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
    expect(mail.text).toContain('Study Plan account')
    expect(mail.html).toContain('<html lang="en"')
    expect(mail.html).toContain('>Confirm email address</a>')
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
