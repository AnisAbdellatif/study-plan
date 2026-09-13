import { and, count, countDistinct, desc, eq, gt, ilike, inArray, isNull, lt, max, sql } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { z } from 'zod'
import type { Auth } from '../auth.ts'
import type { Database } from '../db/connection.ts'
import {
  adminAuditLog,
  notificationSetting,
  plan,
  planShare,
  reminderDelivery,
  session,
  user,
} from '../db/schema.ts'
import { createPasswordAccount, isAdminRole } from '../roles.ts'
import type { AppEnv } from '../types.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const AUDIT_RETENTION_DAYS = 365
const USER_PAGE_SIZE = 25
/** Must match the web app, see VERIFIED_CALLBACK in apps/web/src/routes/auth-pages.tsx. */
const VERIFIED_CALLBACK = '/account?verified=1'

type AdminAction = (typeof adminAuditLog.action.enumValues)[number]

/**
 * Admin access for verified accounts with the admin or superadmin role. The role is read from the database on
 * every request, so revoking it takes effect immediately. Everyone else, signed in or not, gets the same 404 as
 * an unknown route, so the dashboard's existence is not advertised.
 */
export function requireAdmin(auth: Auth, db: Database) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const current = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!current?.user.emailVerified) return c.json({ error: 'not_found' }, 404)
    const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, current.user.id))
    if (!isAdminRole(row?.role)) return c.json({ error: 'not_found' }, 404)
    c.set('user', { id: current.user.id, email: current.user.email, name: current.user.name })
    c.set('adminRole', row.role)
    await next()
  })
}

const superadminOnly = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('adminRole') !== 'superadmin') return c.json({ error: 'requires_superadmin' }, 403)
  await next()
})

const roleChangeSchema = z.object({ role: z.enum(['admin', 'user']) })

const createAdminSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(100).optional(),
  password: z.string().min(10).max(128),
})

const readJson = async (c: Context<AppEnv>): Promise<unknown> => {
  try {
    return await c.req.json()
  } catch {
    return null
  }
}

/** Escapes LIKE wildcards so a search for "a_b" matches literally. */
const likePattern = (value: string) => `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`

/**
 * A field of the plan's preset snapshot. The field name is inlined rather than bound: GROUP BY only matches the
 * selected expression when both are textually identical. Only the fixed names below are ever passed in.
 */
const presetField = (field: 'id' | 'programmeName' | 'universityName' | 'poVersion') =>
  sql<string>`${plan.document}->'plan'->'preset'->>${sql.raw(`'${field}'`)}`

/** Operator tools. Shows account metadata and counts, never grades or plan contents. */
export function adminRoutes(db: Database, auth: Auth) {
  const routes = new Hono<AppEnv>()

  const audit = async (c: Context<AppEnv>, action: AdminAction, targetUserId: string) => {
    await db
      .delete(adminAuditLog)
      .where(lt(adminAuditLog.createdAt, new Date(Date.now() - AUDIT_RETENTION_DAYS * DAY_MS)))
    await db.insert(adminAuditLog).values({ adminEmail: c.get('user').email, action, targetUserId })
  }

  /**
   * The target account, or a response to return instead. Admins manage their own account on the account page.
   * The superadmin is off limits for everyone, and only the superadmin may act on other admins.
   */
  const target = async (c: Context<AppEnv>) => {
    const [row] = await db
      .select({ id: user.id, email: user.email, emailVerified: user.emailVerified, role: user.role })
      .from(user)
      .where(eq(user.id, c.req.param('id') ?? ''))
    if (!row) return { response: c.json({ error: 'not_found' }, 404) }
    if (row.id === c.get('user').id) return { response: c.json({ error: 'cannot_modify_self' }, 409) }
    if (row.role === 'superadmin') return { response: c.json({ error: 'protected_account' }, 403) }
    if (row.role === 'admin' && c.get('adminRole') !== 'superadmin') {
      return { response: c.json({ error: 'requires_superadmin' }, 403) }
    }
    return { row }
  }

  routes.get('/me', (c) => c.json({ email: c.get('user').email, role: c.get('adminRole') }))

  routes.get('/stats', async (c) => {
    const since = new Date(Date.now() - 30 * DAY_MS)
    const [users] = await db
      .select({
        total: count(),
        verified: count(sql`case when ${user.emailVerified} then 1 end`),
        // gt() encodes the date through the column; a bare Date in sql`` reaches postgres-js unencoded and fails.
        newLast30Days: count(sql`case when ${gt(user.createdAt, since)} then 1 end`),
      })
      .from(user)
    const [active] = await db
      .select({ value: countDistinct(session.userId) })
      .from(session)
      .where(gt(session.updatedAt, since))
    const [plans] = await db.select({ value: count() }).from(plan)
    const presetId = presetField('id')
    const programmeName = presetField('programmeName')
    const universityName = presetField('universityName')
    const poVersion = presetField('poVersion')
    const byPreset = await db
      .select({ presetId, programmeName, universityName, poVersion, plans: count() })
      .from(plan)
      .groupBy(presetId, programmeName, universityName, poVersion)
      .orderBy(desc(count()), presetId)
    const [shares] = await db.select({ value: count() }).from(planShare).where(isNull(planShare.revokedAt))
    const [reminders] = await db
      .select({ value: count() })
      .from(notificationSetting)
      .where(eq(notificationSetting.examReminders, true))
    const [sent] = await db
      .select({ value: count() })
      .from(reminderDelivery)
      .where(gt(reminderDelivery.sentAt, since))

    c.header('Cache-Control', 'no-store')
    return c.json({
      users: {
        total: users?.total ?? 0,
        verified: users?.verified ?? 0,
        newLast30Days: users?.newLast30Days ?? 0,
        activeLast30Days: active?.value ?? 0,
      },
      plans: { total: plans?.value ?? 0, byPreset },
      shares: { active: shares?.value ?? 0 },
      reminders: { enabled: reminders?.value ?? 0, sentLast30Days: sent?.value ?? 0 },
    })
  })

  routes.get('/users', async (c) => {
    const query = (c.req.query('q') ?? '').trim().slice(0, 200)
    const adminsOnly = c.req.query('role') === 'admin'
    const rows = await db
      .select({
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        role: user.role,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(
        and(
          query ? ilike(user.email, likePattern(query)) : undefined,
          adminsOnly ? inArray(user.role, ['admin', 'superadmin']) : undefined,
        ),
      )
      .orderBy(desc(user.createdAt))
      .limit(USER_PAGE_SIZE)
    const ids = rows.map((row) => row.id)
    if (ids.length === 0) return c.json({ users: [] })

    const planCounts = await db
      .select({ userId: plan.userId, value: count() })
      .from(plan)
      .where(inArray(plan.userId, ids))
      .groupBy(plan.userId)
    const shareCounts = await db
      .select({ userId: plan.userId, value: count() })
      .from(planShare)
      .innerJoin(plan, eq(planShare.planId, plan.id))
      .where(and(inArray(plan.userId, ids), isNull(planShare.revokedAt)))
      .groupBy(plan.userId)
    const lastActive = await db
      .select({ userId: session.userId, value: max(session.updatedAt) })
      .from(session)
      .where(inArray(session.userId, ids))
      .groupBy(session.userId)
    const reminders = await db
      .select({ userId: notificationSetting.userId })
      .from(notificationSetting)
      .where(and(inArray(notificationSetting.userId, ids), eq(notificationSetting.examReminders, true)))

    const lookup = <T extends { userId: string }>(list: T[]) =>
      new Map(list.map((item) => [item.userId, item]))
    const planBy = lookup(planCounts)
    const shareBy = lookup(shareCounts)
    const activeBy = lookup(lastActive)
    const reminderUsers = new Set(reminders.map((item) => item.userId))

    c.header('Cache-Control', 'no-store')
    return c.json({
      users: rows.map((row) => ({
        ...row,
        lastActiveAt: activeBy.get(row.id)?.value ?? null,
        plans: planBy.get(row.id)?.value ?? 0,
        activeShares: shareBy.get(row.id)?.value ?? 0,
        reminders: reminderUsers.has(row.id),
      })),
    })
  })

  routes.post('/users/:id/verification-email', async (c) => {
    const { row, response } = await target(c)
    if (!row) return response
    if (row.emailVerified) return c.json({ error: 'already_verified' }, 409)
    await auth.api.sendVerificationEmail({ body: { email: row.email, callbackURL: VERIFIED_CALLBACK } })
    await audit(c, 'send_verification_email', row.id)
    return c.json({ sent: true })
  })

  routes.post('/users/:id/revoke-shares', async (c) => {
    const { row, response } = await target(c)
    if (!row) return response
    const revoked = await db
      .update(planShare)
      .set({ revokedAt: new Date() })
      .where(
        and(
          isNull(planShare.revokedAt),
          inArray(planShare.planId, db.select({ id: plan.id }).from(plan).where(eq(plan.userId, row.id))),
        ),
      )
      .returning({ id: planShare.id })
    await audit(c, 'revoke_shares', row.id)
    return c.json({ revoked: revoked.length })
  })

  routes.post('/users/:id/sign-out', async (c) => {
    const { row, response } = await target(c)
    if (!row) return response
    const sessions = await db.delete(session).where(eq(session.userId, row.id)).returning({ id: session.id })
    await audit(c, 'sign_out', row.id)
    return c.json({ sessions: sessions.length })
  })

  routes.delete('/users/:id', async (c) => {
    const { row, response } = await target(c)
    if (!row) return response
    // Sessions, plans, share links and reminder settings cascade with the user row.
    await db.delete(user).where(eq(user.id, row.id))
    await audit(c, 'delete_user', row.id)
    return c.body(null, 204)
  })

  routes.put('/users/:id/role', superadminOnly, async (c) => {
    const body = roleChangeSchema.safeParse(await readJson(c))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)
    const { row, response } = await target(c)
    if (!row) return response
    if (row.role === body.data.role) return c.json({ role: row.role })
    if (body.data.role === 'admin' && !row.emailVerified) return c.json({ error: 'not_verified' }, 409)
    await db.update(user).set({ role: body.data.role, updatedAt: new Date() }).where(eq(user.id, row.id))
    await audit(c, body.data.role === 'admin' ? 'grant_admin' : 'revoke_admin', row.id)
    return c.json({ role: body.data.role })
  })

  /** A new, already verified admin account. The superadmin hands over the password, which the admin can reset. */
  routes.post('/admins', superadminOnly, async (c) => {
    const body = createAdminSchema.safeParse(await readJson(c))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)
    const email = body.data.email.toLowerCase()
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, email))
    if (existing) return c.json({ error: 'user_exists' }, 409)
    const id = await createPasswordAccount(db, auth, {
      email,
      name: body.data.name ?? email.split('@')[0] ?? email,
      password: body.data.password,
      role: 'admin',
    })
    await audit(c, 'create_admin', id)
    return c.json({ id, email, role: 'admin' }, 201)
  })

  routes.get('/audit', async (c) => {
    const entries = await db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(50)
    return c.json({ entries })
  })

  return routes
}
