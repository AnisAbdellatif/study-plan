import { Hono } from 'hono'
import { z } from 'zod'
import type { Config } from '../config.ts'
import { contactMail, type Mailer } from '../mail.ts'
import { clientKey, createRateLimiter } from '../rate-limit.ts'
import type { AppEnv } from '../types.ts'

export const CONTACT_MESSAGE_MIN = 10
export const CONTACT_MESSAGE_MAX = 5000

const bodySchema = z.object({
  // No line breaks: the name ends up in the mail subject.
  name: z
    .string()
    .trim()
    .max(100)
    .regex(/^[^\r\n]*$/)
    .optional()
    .transform((value) => value || undefined),
  email: z.email().max(254),
  // The mail subject is built from it, so no line breaks either.
  subject: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .regex(/^[^\r\n]*$/),
  message: z.string().trim().min(CONTACT_MESSAGE_MIN).max(CONTACT_MESSAGE_MAX),
  locale: z.enum(['de', 'en']).default('de'),
  /** A field people never see. Whoever fills it gets the normal answer, and nothing is sent. */
  website: z.string().max(500).optional(),
})

/**
 * The contact form. The message is mailed to CONTACT_EMAIL and not stored anywhere in the app. Senders are limited
 * per client with counters that only live in memory.
 */
export function contactRoutes(config: Config, mailer: Mailer) {
  const routes = new Hono<AppEnv>()
  const limiter = createRateLimiter({ limit: 5, windowMs: 10 * 60_000 })

  routes.post('/', async (c) => {
    const body = bodySchema.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ error: 'invalid_request' }, 400)
    if (!limiter.allow(clientKey(c.req.raw.headers, config.ipAddressHeaders))) {
      return c.json({ error: 'too_many_requests' }, 429)
    }
    if (body.data.website) return c.json({ sent: true }, 202)
    try {
      await mailer.send(contactMail(config.contactEmail, body.data, config.publicUrl))
    } catch {
      return c.json({ error: 'contact_failed' }, 502)
    }
    return c.json({ sent: true }, 202)
  })

  return routes
}
