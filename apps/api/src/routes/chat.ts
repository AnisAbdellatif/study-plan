import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { programmeForChat } from '../chat/programme.ts'
import { runChat } from '../chat/run-chat.ts'
import { chatMessagesToday, chatSettings, claimChatMessage, refundChatMessage } from '../chat/settings.ts'
import type { Database } from '../db/connection.ts'
import { plan } from '../db/schema.ts'
import { type LlmClient, LlmError } from '../llm/types.ts'
import type { AppEnv } from '../types.ts'

const MAX_MESSAGES = 20
const MAX_MESSAGE_LENGTH = 4000

const bodySchema = z
  .object({
    planId: z.uuid(),
    locale: z.enum(['de', 'en']).default('de'),
    messages: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
        }),
      )
      .min(1)
      .max(MAX_MESSAGES),
  })
  .refine((body) => body.messages.at(-1)?.role === 'user', {
    message: 'The last message must be the question',
  })

/**
 * The study assistant. The browser keeps the conversation and sends it with every question; the server stores
 * none of it. Only the programme data of one of the account's plans reaches the language model, see
 * chat/programme.ts. Without an LLM client (no API key) or when an admin switched it off, the chat is unavailable.
 */
export function chatRoutes(db: Database, llm: LlmClient | undefined) {
  const routes = new Hono<AppEnv>()

  routes.get('/status', async (c) => {
    const settings = await chatSettings(db)
    const used = await chatMessagesToday(db, c.get('user').id)
    c.header('Cache-Control', 'no-store')
    return c.json({
      available: llm !== undefined && settings.enabled,
      dailyLimit: settings.dailyLimit,
      remaining: Math.max(0, settings.dailyLimit - used),
    })
  })

  routes.post('/', async (c) => {
    const settings = await chatSettings(db)
    if (!llm || !settings.enabled) return c.json({ error: 'chat_unavailable' }, 503)

    const body = bodySchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)

    const userId = c.get('user').id
    const [row] = await db
      .select({ document: plan.document })
      .from(plan)
      .where(and(eq(plan.id, body.data.planId), eq(plan.userId, userId)))
    if (!row) return c.json({ error: 'not_found' }, 404)

    const used = await claimChatMessage(db, userId, settings.dailyLimit)
    if (used === null) return c.json({ error: 'chat_quota_exceeded', dailyLimit: settings.dailyLimit }, 429)

    const programme = programmeForChat(row.document.plan)
    try {
      const answer = await runChat({
        llm,
        programme,
        history: body.data.messages,
        locale: body.data.locale,
        signal: c.req.raw.signal,
      })
      const names = new Map(programme.modules.map((module) => [module.code, module.name]))
      c.header('Cache-Control', 'no-store')
      return c.json({
        reply: answer.reply,
        modules: answer.moduleCodes.map((code) => ({ code, name: names.get(code) ?? code })),
        remaining: Math.max(0, settings.dailyLimit - used),
      })
    } catch (error) {
      await refundChatMessage(db, userId)
      if (!(error instanceof LlmError)) throw error
      // Kind and status only: questions and answers never go to the logs.
      console.warn(`[chat] model request failed: ${error.kind}${error.status ? ` (${error.status})` : ''}`)
      return c.json({ error: 'chat_failed', reason: error.kind }, 502)
    }
  })

  return routes
}
