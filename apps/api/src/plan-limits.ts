import { count, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Database } from './db/connection.ts'
import { appSetting, plan, user } from './db/schema.ts'

/** How many plans an account may keep unless an admin changes it. */
export const DEFAULT_PLAN_LIMIT = 4
/** Bounds for admin input; the upper one keeps a single account from filling the database. */
export const PLAN_LIMIT_MIN = 1
export const PLAN_LIMIT_MAX = 50

export const planLimitSchema = z.number().int().min(PLAN_LIMIT_MIN).max(PLAN_LIMIT_MAX)

const GLOBAL_KEY = 'maxPlansPerUser'

/** The limit for accounts without their own value. */
export async function globalPlanLimit(db: Database): Promise<number> {
  const [row] = await db
    .select({ value: appSetting.value })
    .from(appSetting)
    .where(eq(appSetting.key, GLOBAL_KEY))
  const parsed = planLimitSchema.safeParse(row?.value)
  return parsed.success ? parsed.data : DEFAULT_PLAN_LIMIT
}

export async function setGlobalPlanLimit(db: Database, limit: number): Promise<void> {
  await db
    .insert(appSetting)
    .values({ key: GLOBAL_KEY, value: limit })
    .onConflictDoUpdate({ target: appSetting.key, set: { value: limit, updatedAt: new Date() } })
}

/**
 * How many plans the account has, and how many it may keep: null for admins, who have no limit; otherwise the
 * account's own limit if an admin set one, or the global value.
 */
export async function planUsage(
  db: Database,
  userId: string,
): Promise<{ limit: number | null; count: number }> {
  const [row] = await db
    .select({ planLimit: user.planLimit, role: user.role })
    .from(user)
    .where(eq(user.id, userId))
  const [counted] = await db.select({ value: count() }).from(plan).where(eq(plan.userId, userId))
  const unlimited = row?.role === 'admin' || row?.role === 'superadmin'
  return {
    limit: unlimited ? null : (row?.planLimit ?? (await globalPlanLimit(db))),
    count: counted?.value ?? 0,
  }
}
