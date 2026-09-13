import { describe, expect, it } from 'vitest'
import { clientKey, createRateLimiter } from './rate-limit.ts'

describe('createRateLimiter', () => {
  it('allows the limit per window and resets afterwards', () => {
    let time = 0
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => time })
    expect([limiter.allow('a'), limiter.allow('a'), limiter.allow('a')]).toEqual([true, true, false])
    expect(limiter.allow('b')).toBe(true)
    time = 1000
    expect(limiter.allow('a')).toBe(true)
  })

  it('reads the first address from a trusted proxy header only when configured', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })
    expect(clientKey(headers, ['x-forwarded-for'])).toBe('203.0.113.7')
    expect(clientKey(headers, undefined)).toBe('unknown')
  })
})
