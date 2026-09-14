import { type GradeSecrets, gradeSecretsSchema, type SealedGrades } from '@study-plan/shared'

/** OWASP's recommendation for PBKDF2-HMAC-SHA256; about a second on a phone, once per sign-in. */
export const PBKDF2_ITERATIONS = 600_000

/** This device has no key for the account's grades yet; the password unlocks them. */
export class GradesLockedError extends Error {
  override readonly name = 'GradesLockedError'
}

/** The grades were encrypted with a key this device doesn't have, e.g. from before a password reset. */
export class GradesUnreadableError extends Error {
  override readonly name = 'GradesUnreadableError'
}

const encoder = new TextEncoder()

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/**
 * The AES key for a student's grades, derived from the account password in the browser. Neither the key nor the
 * derivation input is stored on the server: it keeps only a scrypt hash of the password with its own salt. The
 * server does receive the password at sign-in, so this protects against reading the database and its backups,
 * not against a server changed to capture passwords.
 */
export async function deriveGradeKey(
  password: string,
  userId: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(`study-plan/grades/v1/${userId}`), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    // Not extractable: script on the page can use the key but never read it out.
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function sealGrades(key: CryptoKey, secrets: GradeSecrets): Promise<SealedGrades> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(secrets)),
  )
  return { v: 1, iv: toBase64(iv), data: toBase64(new Uint8Array(data)) }
}

/** Throws `GradesUnreadableError` for a wrong key or tampered data; AES-GCM detects both. */
export async function openGrades(key: CryptoKey, sealed: SealedGrades): Promise<GradeSecrets> {
  let json: unknown
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(sealed.iv) },
      key,
      fromBase64(sealed.data),
    )
    json = JSON.parse(new TextDecoder().decode(plain))
  } catch {
    throw new GradesUnreadableError('The grades could not be decrypted with this key')
  }
  const parsed = gradeSecretsSchema.safeParse(json)
  if (!parsed.success) throw new GradesUnreadableError('The decrypted grades have an unexpected shape')
  return parsed.data
}
