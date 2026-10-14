import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

/**
 * Secrets of the calendar feeds. Both derive from the auth secret, so there is nothing new to configure; changing
 * that secret makes stored calendar links unreadable (students paste theirs again) and changes every feed URL.
 */

const deriveKey = (secret: string, purpose: string): Buffer =>
  Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), `study-plan:${purpose}`, 32))

const VERSION = 'v1'

/**
 * Encrypts a student's upstream calendar link (AES-256-GCM): it carries their personal Stud.IP key, which reads their
 * whole timetable. Only the sync and the student's own requests decrypt it.
 */
export function encryptSourceUrl(secret: string, url: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, 'calendar-source-url'), iv)
  const data = Buffer.concat([cipher.update(url, 'utf8'), cipher.final(), cipher.getAuthTag()])
  return `${VERSION}.${iv.toString('base64url')}.${data.toString('base64url')}`
}

/** Null when the value was encrypted with another secret or was changed. */
export function decryptSourceUrl(secret: string, sealed: string): string | null {
  const [version, iv, data] = sealed.split('.')
  if (version !== VERSION || !iv || !data) return null
  try {
    const bytes = Buffer.from(data, 'base64url')
    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveKey(secret, 'calendar-source-url'),
      Buffer.from(iv, 'base64url'),
    )
    decipher.setAuthTag(bytes.subarray(bytes.length - 16))
    return Buffer.concat([decipher.update(bytes.subarray(0, bytes.length - 16)), decipher.final()]).toString(
      'utf8',
    )
  } catch {
    return null
  }
}

/**
 * The secret part of a feed URL. It is computed, not stored: the owner can always see the URL again, and raising
 * `version` makes every earlier URL of the feed stop working.
 */
export function feedToken(secret: string, feedId: string, version: number): string {
  return createHmac('sha256', deriveKey(secret, 'calendar-feed'))
    .update(`${feedId}:${version}`)
    .digest()
    .subarray(0, 16)
    .toString('base64url')
}

export function isFeedToken(secret: string, feedId: string, version: number, token: string): boolean {
  const expected = Buffer.from(feedToken(secret, feedId, version))
  const given = Buffer.from(token)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
