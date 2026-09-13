import { z } from 'zod'
import { type Plan, planSchema } from './plan.ts'

export const GUEST_DOCUMENT_FORMAT = 'study-plan.guest'
export const GUEST_DOCUMENT_VERSION = 1

/** The unit stored in the browser and written to export files. */
export const guestDocumentSchema = z.object({
  format: z.literal(GUEST_DOCUMENT_FORMAT),
  schemaVersion: z.literal(GUEST_DOCUMENT_VERSION),
  plan: planSchema,
})
export type GuestDocument = z.infer<typeof guestDocumentSchema>

export type ParseFailure = {
  success: false
  reason: 'not_a_plan' | 'newer_version' | 'invalid'
  details: string
}
export type ParseResult = { success: true; document: GuestDocument } | ParseFailure

/**
 * Migrations from version n to n+1, keyed by n. Add one whenever GUEST_DOCUMENT_VERSION goes up,
 * and keep old ones so any exported file stays importable.
 */
const migrations: Record<number, (input: Record<string, unknown>) => Record<string, unknown>> = {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function parseGuestDocument(input: unknown): ParseResult {
  if (!isRecord(input) || input.format !== GUEST_DOCUMENT_FORMAT) {
    return { success: false, reason: 'not_a_plan', details: 'Missing study-plan.guest format marker' }
  }

  let data = input
  let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : Number.NaN
  if (!Number.isInteger(version) || version < 1) {
    return { success: false, reason: 'invalid', details: 'Missing or invalid schemaVersion' }
  }
  if (version > GUEST_DOCUMENT_VERSION) {
    return {
      success: false,
      reason: 'newer_version',
      details: `File has schemaVersion ${version}, this app supports up to ${GUEST_DOCUMENT_VERSION}`,
    }
  }
  while (version < GUEST_DOCUMENT_VERSION) {
    const migrate = migrations[version]
    if (!migrate)
      return { success: false, reason: 'invalid', details: `No migration from version ${version}` }
    data = migrate(data)
    version += 1
  }

  const result = guestDocumentSchema.safeParse(data)
  if (!result.success) return { success: false, reason: 'invalid', details: z.prettifyError(result.error) }
  return { success: true, document: result.data }
}

export const createGuestDocument = (plan: Plan): GuestDocument => ({
  format: GUEST_DOCUMENT_FORMAT,
  schemaVersion: GUEST_DOCUMENT_VERSION,
  plan,
})
