/**
 * A small fixed-window limiter kept in memory. It protects public endpoints such as share links that Better Auth's
 * rate limiter does not cover. Counters vanish on restart, which is fine for abuse protection.
 */
export interface RateLimiter {
  allow(key: string): boolean
}

export interface RateLimiterOptions {
  limit: number
  windowMs: number
  now?: () => number
  /** Upper bound on tracked clients, so the map cannot grow without limit. */
  maxKeys?: number
}

export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
  maxKeys = 10_000,
}: RateLimiterOptions): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>()
  return {
    allow(key) {
      const time = now()
      const current = windows.get(key)
      if (!current || time - current.start >= windowMs) {
        if (!current && windows.size >= maxKeys) windows.clear()
        windows.set(key, { start: time, count: 1 })
        return true
      }
      current.count += 1
      return current.count <= limit
    },
  }
}

/** The client IP from the trusted proxy header, or one shared bucket when no header is configured. */
export function clientKey(headers: Headers, ipAddressHeaders: readonly string[] | undefined): string {
  for (const name of ipAddressHeaders ?? []) {
    const value = headers.get(name)?.split(',')[0]?.trim()
    if (value) return value
  }
  return 'unknown'
}
