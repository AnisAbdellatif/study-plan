import { extractGrades, type GuestDocument, mergeGrades, type Plan, planHasGrades } from '@study-plan/shared'
import { GradesLockedError, GradesUnreadableError, openGrades, sealGrades } from './grade-crypto.ts'
import type { GradeKeyring } from './grade-keys.ts'

export interface OpenedDocument {
  plan: Plan
  /** The account copy should be saved again: it still had readable grades, or used the previous key. */
  needsReseal: boolean
}

/** Encrypts grades on the way to the account and decrypts them on the way back. */
export interface GradeSealer {
  /** The document for the server: no readable grades. Throws `GradesLockedError` when grades need a missing key. */
  seal(userId: string, document: GuestDocument): Promise<GuestDocument>
  /** The plan with its grades. Throws `GradesLockedError` or `GradesUnreadableError`. */
  open(userId: string, document: GuestDocument): Promise<OpenedDocument>
}

export function createGradeSealer(keyring: GradeKeyring): GradeSealer {
  return {
    async seal(userId, document) {
      const { encryptedGrades: _previous, ...rest } = document
      const { plan, secrets } = extractGrades(document.plan)
      // A plan without grades needs no key, so saving works before the device is unlocked.
      if (!secrets) return { ...rest, plan }
      const keys = await keyring.keys(userId)
      if (!keys) throw new GradesLockedError('This device has no grade key for the account')
      return { ...rest, plan, encryptedGrades: await sealGrades(keys.current, secrets) }
    },

    async open(userId, document) {
      const { encryptedGrades, ...rest } = document
      // Saved before grades were encrypted: readable as it is, and encrypted with the next save.
      if (!encryptedGrades) return { plan: document.plan, needsReseal: planHasGrades(document.plan) }
      const keys = await keyring.keys(userId)
      if (!keys) throw new GradesLockedError('This device has no grade key for the account')
      try {
        return {
          plan: mergeGrades(rest.plan, await openGrades(keys.current, encryptedGrades)),
          needsReseal: false,
        }
      } catch (error) {
        if (!(error instanceof GradesUnreadableError) || !keys.previous) throw error
      }
      return {
        plan: mergeGrades(rest.plan, await openGrades(keys.previous, encryptedGrades)),
        needsReseal: true,
      }
    },
  }
}
