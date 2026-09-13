import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeOverall } from './compute.ts'
import { add, compare, rational } from './rational.ts'
import { flatRules, graded } from './test-support.ts'

const PASSING_TENTHS = [10, 13, 17, 20, 23, 27, 30, 33, 37, 40]

const modulesArb = fc.array(
  fc.record({
    tenths: fc.constantFrom(...PASSING_TENTHS),
    creditHalves: fc.integer({ min: 1, max: 60 }),
  }),
  { minLength: 1, maxLength: 15 },
)

type Generated = { tenths: number; creditHalves: number }

const toRecords = (modules: readonly Generated[]) =>
  modules.map((m, i) => graded(`M${i}`, m.creditHalves / 2, m.tenths / 10))

function run(modules: readonly Generated[]) {
  const records = toRecords(modules)
  return computeOverall(flatRules(records.map((r) => r.code)), records)
}

describe('computeOverall properties', () => {
  it('matches an independent integer oracle', () => {
    fc.assert(
      fc.property(modulesArb, (modules) => {
        const { exact } = run(modules)
        const num = modules.reduce((s, m) => s + BigInt(m.tenths * m.creditHalves), 0n)
        const den = modules.reduce((s, m) => s + BigInt(m.creditHalves * 10), 0n)
        expect(exact).not.toBeNull()
        expect((exact?.num ?? 0n) * den).toBe(num * (exact?.den ?? 1n))
      }),
    )
  })

  it('stays between the best and the worst counted grade', () => {
    fc.assert(
      fc.property(modulesArb, (modules) => {
        const { exact } = run(modules)
        if (!exact) throw new Error('expected a value')
        const tenths = modules.map((m) => m.tenths)
        expect(compare(exact, rational(BigInt(Math.min(...tenths)), 10n))).toBeGreaterThanOrEqual(0)
        expect(compare(exact, rational(BigInt(Math.max(...tenths)), 10n))).toBeLessThanOrEqual(0)
      }),
    )
  })

  it('does not depend on module order', () => {
    fc.assert(
      fc.property(modulesArb, (modules) => {
        const records = toRecords(modules)
        const codes = records.map((r) => r.code)
        const forward = computeOverall(flatRules(codes), records)
        const backward = computeOverall(flatRules([...codes].reverse()), [...records].reverse())
        expect(backward.exact).toEqual(forward.exact)
      }),
    )
  })

  it('never gets worse when one grade improves', () => {
    fc.assert(
      fc.property(modulesArb, fc.nat(), (modules, pick) => {
        const index = pick % modules.length
        const target = modules[index]
        if (!target) return
        const step = PASSING_TENTHS.indexOf(target.tenths)
        if (step === 0) return
        const improved = modules.map((m, i) =>
          i === index ? { ...m, tenths: PASSING_TENTHS[step - 1] ?? m.tenths } : m,
        )
        const before = run(modules).exact
        const after = run(improved).exact
        if (!before || !after) throw new Error('expected values')
        expect(compare(after, before)).toBeLessThanOrEqual(0)
      }),
    )
  })

  it('returns the grade itself when all grades are equal', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PASSING_TENTHS),
        fc.array(fc.integer({ min: 1, max: 60 }), { minLength: 1, maxLength: 10 }),
        (tenths, credits) => {
          const result = run(credits.map((creditHalves) => ({ tenths, creditHalves })))
          expect(result.value).toBe((tenths / 10).toFixed(1))
        },
      ),
    )
  })

  it('truncation lands in [value, value + 0.1)', () => {
    fc.assert(
      fc.property(modulesArb, (modules) => {
        const { exact, value } = run(modules)
        if (!exact || !value) throw new Error('expected values')
        const truncated = rational(BigInt(value.replace('.', '')), 10n)
        expect(compare(truncated, exact)).toBeLessThanOrEqual(0)
        expect(compare(exact, add(truncated, rational(1n, 10n)))).toBe(-1)
      }),
    )
  })
})
