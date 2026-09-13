/**
 * Exact rational arithmetic on bigint.
 *
 * Grade averages are computed with these helpers so that no binary float ever
 * touches a value that ends up on a transcript. `Math.round` and `toFixed` are
 * deliberately not used anywhere in the engine.
 */
export interface Rational {
  readonly num: bigint
  readonly den: bigint
}

export type ScaleMode = 'truncate' | 'round_half_up'

const abs = (x: bigint): bigint => (x < 0n ? -x : x)

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a)
  let y = abs(b)
  while (y !== 0n) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

/** Floor division that is also correct for negative operands. */
function floorDiv(n: bigint, d: bigint): bigint {
  const q = n / d
  return n % d !== 0n && n < 0n !== d < 0n ? q - 1n : q
}

export function rational(num: bigint, den = 1n): Rational {
  if (den === 0n) throw new RangeError('Rational with zero denominator')
  const sign = den < 0n ? -1n : 1n
  const g = gcd(num, den) || 1n
  return { num: (sign * num) / g, den: (sign * den) / g }
}

export const ZERO: Rational = rational(0n)

export const add = (a: Rational, b: Rational): Rational =>
  rational(a.num * b.den + b.num * a.den, a.den * b.den)

export const subtract = (a: Rational, b: Rational): Rational =>
  rational(a.num * b.den - b.num * a.den, a.den * b.den)

export const multiply = (a: Rational, b: Rational): Rational => rational(a.num * b.num, a.den * b.den)

export function divide(a: Rational, b: Rational): Rational {
  if (b.num === 0n) throw new RangeError('Division by zero')
  return rational(a.num * b.den, a.den * b.num)
}

export function compare(a: Rational, b: Rational): -1 | 0 | 1 {
  const left = a.num * b.den
  const right = b.num * a.den
  return left < right ? -1 : left > right ? 1 : 0
}

export const absolute = (a: Rational): Rational => rational(abs(a.num), a.den)

/**
 * Returns the value scaled by 10^precision as an integer.
 * `truncate` drops digits (German "abschneiden"); `round_half_up` rounds .5 away from zero
 * for the non-negative values grades always are.
 */
export function toScaledInteger(value: Rational, precision: number, mode: ScaleMode): bigint {
  const scale = 10n ** BigInt(precision)
  if (mode === 'truncate') return floorDiv(value.num * scale, value.den)
  return floorDiv(2n * value.num * scale + value.den, 2n * value.den)
}

/** Formats an integer that is scaled by 10^precision, e.g. (17n, 1) -> "1.7". */
export function formatScaled(scaled: bigint, precision: number): string {
  const scale = 10n ** BigInt(precision)
  const sign = scaled < 0n ? '-' : ''
  const magnitude = abs(scaled)
  const whole = (magnitude / scale).toString()
  if (precision === 0) return `${sign}${whole}`
  const fraction = (magnitude % scale).toString().padStart(precision, '0')
  return `${sign}${whole}.${fraction}`
}

/** Formats a rational by truncating to `precision` decimals. Display only. */
export const formatTruncated = (value: Rational, precision: number): string =>
  formatScaled(toScaledInteger(value, precision, 'truncate'), precision)
