import { gte, lt, sql } from 'drizzle-orm'
import type { Database } from '../db/connection.ts'
import { chatModelUsage } from '../db/schema.ts'
import type { LlmClient } from '../llm/types.ts'
import { berlinDate } from '../reminders.ts'

const DAY_MS = 24 * 60 * 60 * 1000
/** Daily totals hold no personal data; a bit over a year lets admins compare months. */
const RETENTION_DAYS = 400
export const USAGE_REPORT_DAYS = 30

export interface ModelCalls {
  model: string
  calls: number
  promptTokens: number
  completionTokens: number
  cost: number
}

export interface UsageTotals {
  questions: number
  failed: number
  calls: number
  promptTokens: number
  completionTokens: number
  cost: number
}

export interface UsageReport {
  /** Each of the last 30 Berlin dates, oldest first; days without questions are zeros. */
  days: (UsageTotals & { day: string })[]
  models: (UsageTotals & { model: string })[]
  totals: { today: UsageTotals; last7Days: UsageTotals; last30Days: UsageTotals }
}

const emptyTotals = (): UsageTotals => ({
  questions: 0,
  failed: 0,
  calls: 0,
  promptTokens: 0,
  completionTokens: 0,
  cost: 0,
})

/**
 * Wraps a client so every model call of one question is counted, also when the question fails after some calls.
 * Calls are grouped by the model that actually answered, since providers may route to a fallback.
 */
export function meterLlm(llm: LlmClient): { client: LlmClient; calls: () => ModelCalls[] } {
  const byModel = new Map<string, ModelCalls>()
  const client: LlmClient = {
    model: llm.model,
    async complete(request) {
      const response = await llm.complete(request)
      const entry = byModel.get(response.model) ?? {
        model: response.model,
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        cost: 0,
      }
      entry.calls += 1
      entry.promptTokens += response.usage?.promptTokens ?? 0
      entry.completionTokens += response.usage?.completionTokens ?? 0
      entry.cost += response.usage?.cost ?? 0
      byModel.set(response.model, entry)
      return response
    },
  }
  return { client, calls: () => [...byModel.values()] }
}

/**
 * Adds one question to today's totals. The question itself is counted once, under the first model that answered,
 * or under the configured model when none did.
 */
export async function recordChatUsage(
  db: Database,
  {
    model,
    calls,
    outcome,
    now = new Date(),
  }: { model: string; calls: ModelCalls[]; outcome: 'answered' | 'failed'; now?: Date },
): Promise<void> {
  const day = berlinDate(now)
  await db
    .delete(chatModelUsage)
    .where(lt(chatModelUsage.day, berlinDate(new Date(now.getTime() - RETENTION_DAYS * DAY_MS))))

  const entries =
    calls.length > 0 ? calls : [{ model, calls: 0, promptTokens: 0, completionTokens: 0, cost: 0 }]
  for (const [index, entry] of entries.entries()) {
    const row = {
      day,
      model: entry.model,
      questions: index === 0 ? 1 : 0,
      failed: index === 0 && outcome === 'failed' ? 1 : 0,
      calls: entry.calls,
      promptTokens: entry.promptTokens,
      completionTokens: entry.completionTokens,
      cost: entry.cost,
    }
    await db
      .insert(chatModelUsage)
      .values(row)
      .onConflictDoUpdate({
        target: [chatModelUsage.day, chatModelUsage.model],
        set: {
          questions: sql`${chatModelUsage.questions} + ${row.questions}`,
          failed: sql`${chatModelUsage.failed} + ${row.failed}`,
          calls: sql`${chatModelUsage.calls} + ${row.calls}`,
          promptTokens: sql`${chatModelUsage.promptTokens} + ${row.promptTokens}`,
          completionTokens: sql`${chatModelUsage.completionTokens} + ${row.completionTokens}`,
          cost: sql`${chatModelUsage.cost} + ${row.cost}`,
        },
      })
  }
}

/** The Berlin date `days` days before today's. Works on the date itself, so DST changes can't skip or repeat a day. */
function daysBefore(today: string, days: number): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10)
}

/** Totals of the last 30 days (Berlin time) per day and per model, for the admin dashboard. */
export async function chatUsageReport(db: Database, now = new Date()): Promise<UsageReport> {
  const today = berlinDate(now)
  const since = (days: number) => daysBefore(today, days - 1)
  const sums = {
    questions: sql<number>`coalesce(sum(${chatModelUsage.questions}), 0)`.mapWith(Number),
    failed: sql<number>`coalesce(sum(${chatModelUsage.failed}), 0)`.mapWith(Number),
    calls: sql<number>`coalesce(sum(${chatModelUsage.calls}), 0)`.mapWith(Number),
    promptTokens: sql<number>`coalesce(sum(${chatModelUsage.promptTokens}), 0)`.mapWith(Number),
    completionTokens: sql<number>`coalesce(sum(${chatModelUsage.completionTokens}), 0)`.mapWith(Number),
    cost: sql<number>`coalesce(sum(${chatModelUsage.cost}), 0)`.mapWith(Number),
  }
  const inReport = gte(chatModelUsage.day, since(USAGE_REPORT_DAYS))

  const recorded = await db
    .select({ day: chatModelUsage.day, ...sums })
    .from(chatModelUsage)
    .where(inReport)
    .groupBy(chatModelUsage.day)
    .orderBy(chatModelUsage.day)
  const models = await db
    .select({ model: chatModelUsage.model, ...sums })
    .from(chatModelUsage)
    .where(inReport)
    .groupBy(chatModelUsage.model)
    .orderBy(sql`sum(${chatModelUsage.cost}) desc`, chatModelUsage.model)

  // Every day of the report, days without questions as zeros, so the dashboard can draw them as they are.
  const byDay = new Map(recorded.map((row) => [row.day, row]))
  const days = Array.from({ length: USAGE_REPORT_DAYS }, (_, index) => {
    const day = daysBefore(today, USAGE_REPORT_DAYS - 1 - index)
    return byDay.get(day) ?? { day, ...emptyTotals() }
  })

  const total = (from: string) => {
    const result = emptyTotals()
    for (const row of days) {
      if (row.day < from) continue
      for (const key of Object.keys(result) as (keyof UsageTotals)[]) result[key] += row[key]
    }
    return result
  }
  return {
    days,
    models,
    totals: {
      today: total(since(1)),
      last7Days: total(since(7)),
      last30Days: total(since(USAGE_REPORT_DAYS)),
    },
  }
}
