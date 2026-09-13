import { describe, expect, it } from 'vitest'
import { compare, formatScaled, formatTruncated, rational, toScaledInteger } from './rational.ts'

describe('rational', () => {
  it('normalises sign and common factors', () => {
    expect(rational(6n, -4n)).toEqual({ num: -3n, den: 2n })
    expect(rational(0n, 5n)).toEqual({ num: 0n, den: 1n })
  })

  it('rejects a zero denominator', () => {
    expect(() => rational(1n, 0n)).toThrow(RangeError)
  })

  it('compares exactly where floats would not', () => {
    // 0.1 + 0.2 vs 0.3 is the classic float trap
    const sum = rational(3n, 10n)
    expect(compare(sum, rational(1n, 10n))).toBe(1)
    expect(compare(sum, rational(30n, 100n))).toBe(0)
  })

  it('truncates instead of rounding', () => {
    expect(formatTruncated(rational(199n, 100n), 1)).toBe('1.9')
    expect(formatTruncated(rational(67n, 30n), 2)).toBe('2.23')
  })

  it('rounds half up', () => {
    expect(formatScaled(toScaledInteger(rational(185n, 100n), 1, 'round_half_up'), 1)).toBe('1.9')
    expect(formatScaled(toScaledInteger(rational(184n, 100n), 1, 'round_half_up'), 1)).toBe('1.8')
  })

  it('formats scaled integers with padding', () => {
    expect(formatScaled(105n, 2)).toBe('1.05')
    expect(formatScaled(-7n, 1)).toBe('-0.7')
  })
})
