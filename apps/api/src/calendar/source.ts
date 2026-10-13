import type { CalendarEvent, CalendarFetchError } from '@study-plan/shared'
import { parseCalendar } from './ics.ts'
import { toCalendarEvent } from './studip.ts'

/** Stud.IP's personal calendar export: /dispatch.php/ical/index/<key>. */
const STUDIP_PATH = /^\/dispatch\.php\/ical\/index\/([A-Za-z0-9]{4,64})\/?$/

const MB = 1024 * 1024
export const MAX_CALENDAR_BYTES = 4 * MB
const MAX_EVENTS = 5000
const TIMEOUT_MS = 20_000

export type SourceUrlResult =
  | { ok: true; url: string; host: string }
  | { ok: false; error: 'invalid_url' | 'host_not_allowed' }

/**
 * Checks a pasted calendar link and returns it in one canonical form. Only HTTPS links to the allowed Stud.IP hosts
 * and their export path pass, so the server never fetches anything a student points it to (no SSRF).
 */
export function parseSourceUrl(input: string, allowedHosts: readonly string[]): SourceUrlResult {
  let url: URL
  try {
    // Calendar apps hand out webcal:// links for the same address.
    url = new URL(input.trim().replace(/^webcals?:\/\//i, 'https://'))
  } catch {
    return { ok: false, error: 'invalid_url' }
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    return { ok: false, error: 'invalid_url' }
  }
  const host = url.hostname.toLowerCase()
  if (!allowedHosts.includes(host)) return { ok: false, error: 'host_not_allowed' }
  const match = STUDIP_PATH.exec(url.pathname)
  if (!match || url.search || url.hash) return { ok: false, error: 'invalid_url' }
  return { ok: true, url: `https://${host}/dispatch.php/ical/index/${match[1]}`, host }
}

export type FetchResult = { ok: true; events: CalendarEvent[] } | { ok: false; error: CalendarFetchError }

export type Fetcher = (input: string, init: RequestInit) => Promise<Response>

async function readLimited(response: Response): Promise<string | null> {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_CALENDAR_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/**
 * Fetches and reads a calendar link that passed parseSourceUrl. Redirects are not followed: they could lead
 * anywhere. Error messages never contain the link, which is a secret.
 */
export async function fetchSourceCalendar(url: string, fetcher: Fetcher = fetch): Promise<FetchResult> {
  let response: Response
  try {
    response = await fetcher(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        accept: 'text/calendar',
        'user-agent': 'study-plan.de calendar feeds (+https://study-plan.de/contact)',
      },
    })
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return { ok: false, error: timedOut ? 'timeout' : 'unreachable' }
  }
  // Stud.IP answers an unknown or revoked key with 400.
  if (
    response.status === 400 ||
    response.status === 403 ||
    response.status === 404 ||
    response.status === 410
  ) {
    return { ok: false, error: 'not_found' }
  }
  if (!response.ok)
    return { ok: false, error: response.status >= 300 && response.status < 400 ? 'rejected' : 'unreachable' }
  let text: string | null
  try {
    text = await readLimited(response)
  } catch {
    return { ok: false, error: 'unreachable' }
  }
  if (text === null) return { ok: false, error: 'too_large' }
  const calendar = parseCalendar(text)
  if (!calendar) return { ok: false, error: 'not_a_calendar' }
  return { ok: true, events: calendar.events.slice(0, MAX_EVENTS).map(toCalendarEvent) }
}
