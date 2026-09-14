import { and, eq, inArray, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Database } from '../db/connection.ts'
import { appSetting, chatUsage } from '../db/schema.ts'
import { berlinDate } from '../reminders.ts'

/** Messages per account per day unless an admin changes it. */
export const CHAT_DEFAULT_DAILY_LIMIT = 20
export const chatDailyLimitSchema = z.number().int().min(1).max(500)
/** An OpenRouter model id: author/slug, optionally with a variant such as :free. Nothing else reaches a URL. */
export const chatModelIdSchema = z
  .string()
  .trim()
  .max(200)
  .regex(/^[\w.-]+\/[\w.-]+(?::[\w.-]+)?$/)

export interface ChatSettings {
  /** Admins can switch the chat off without removing the API key. */
  enabled: boolean
  dailyLimit: number
  /** A model an admin chose on the dashboard; null uses OPENROUTER_MODEL. */
  model: string | null
}

const KEYS = { enabled: 'chatEnabled', dailyLimit: 'chatDailyLimit', model: 'chatModel' } as const
/** Usage rows are only needed for today; a week of history is kept for the admin to look at if needed. */
const USAGE_RETENTION_DAYS = 7

export async function chatSettings(db: Database): Promise<ChatSettings> {
  const rows = await db
    .select({ key: appSetting.key, value: appSetting.value })
    .from(appSetting)
    .where(inArray(appSetting.key, Object.values(KEYS)))
  const value = (key: string) => rows.find((row) => row.key === key)?.value
  const enabled = z.boolean().safeParse(value(KEYS.enabled))
  const dailyLimit = chatDailyLimitSchema.safeParse(value(KEYS.dailyLimit))
  const model = chatModelIdSchema.safeParse(value(KEYS.model))
  return {
    enabled: enabled.success ? enabled.data : true,
    dailyLimit: dailyLimit.success ? dailyLimit.data : CHAT_DEFAULT_DAILY_LIMIT,
    model: model.success ? model.data : null,
  }
}

export async function updateChatSettings(db: Database, settings: ChatSettings): Promise<void> {
  for (const [field, key] of Object.entries(KEYS) as [keyof ChatSettings, string][]) {
    const value = settings[field]
    if (value === null) {
      await db.delete(appSetting).where(eq(appSetting.key, key))
      continue
    }
    await db
      .insert(appSetting)
      .values({ key, value })
      .onConflictDoUpdate({ target: appSetting.key, set: { value, updatedAt: new Date() } })
  }
}

/** Messages the account sent today (Berlin time). */
export async function chatMessagesToday(db: Database, userId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ count: chatUsage.count })
    .from(chatUsage)
    .where(and(eq(chatUsage.userId, userId), eq(chatUsage.day, berlinDate(now))))
  return row?.count ?? 0
}

/**
 * Counts one message if the account is still below the limit, in one statement so parallel requests can't both
 * take the last message. Returns the new count, or null when the limit is reached.
 */
export async function claimChatMessage(
  db: Database,
  userId: string,
  limit: number,
  now = new Date(),
): Promise<number | null> {
  const day = berlinDate(now)
  const cutoff = berlinDate(new Date(now.getTime() - USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000))
  await db.delete(chatUsage).where(and(eq(chatUsage.userId, userId), lt(chatUsage.day, cutoff)))
  const [row] = await db
    .insert(chatUsage)
    .values({ userId, day, count: 1 })
    .onConflictDoUpdate({
      target: [chatUsage.userId, chatUsage.day],
      set: { count: sql`${chatUsage.count} + 1` },
      setWhere: sql`${chatUsage.count} < ${limit}`,
    })
    .returning({ count: chatUsage.count })
  return row?.count ?? null
}

/** Gives a message back when the model could not answer, so failures don't eat into the quota. */
export async function refundChatMessage(db: Database, userId: string, now = new Date()): Promise<void> {
  await db
    .update(chatUsage)
    .set({ count: sql`greatest(${chatUsage.count} - 1, 0)` })
    .where(and(eq(chatUsage.userId, userId), eq(chatUsage.day, berlinDate(now))))
}
