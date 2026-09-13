import { describe, expect, it } from 'vitest'
import type { GradeRules } from '../schema/rules.ts'
import { computeOverall, effectiveGradeTenths } from './compute.ts'
import { GradeRuleError } from './errors.ts'
import { computeCreditProgress } from './progress.ts'
import { rational } from './rational.ts'
import { flatRules, graded } from './test-support.ts'

describe('computeOverall: credit-weighted mean', () => {
  const records = [graded('A', 5, 1.3), graded('B', 10, 2.7)]

  it('weights by credits and truncates by default', () => {
    // (1.3*5 + 2.7*10) / 15 = 2.2333...
    const result = computeOverall(flatRules(['A', 'B']), records)
    expect(result.exact).toEqual(rational(67n, 30n))
    expect(result.value).toBe('2.2')
    expect(result.countedCredits).toBe(15)
  })

  it('supports two decimal places', () => {
    const result = computeOverall(flatRules(['A', 'B'], { mode: 'truncate', precision: 2 }), records)
    expect(result.value).toBe('2.23')
  })

  it('returns null before any graded module has passed', () => {
    const result = computeOverall(flatRules(['A']), [graded('A', 5, 5.0)])
    expect(result.value).toBeNull()
    expect(result.exact).toBeNull()
    expect(result.countedCredits).toBe(0)
  })
})

describe('computeOverall: rounding modes differ on 1.85', () => {
  const records = [graded('A', 5, 1.7), graded('B', 5, 2.0)]

  it.each([
    ['truncate', '1.8'],
    ['round_half_up', '1.9'],
    ['round_to_nearest_allowed_ties_better', '1.7'],
  ] as const)('%s gives %s', (mode, expected) => {
    expect(computeOverall(flatRules(['A', 'B'], { mode, precision: 1 }), records).value).toBe(expected)
  })
})

describe('computeOverall: what does and does not count', () => {
  it('excludes pass/fail, flagged, failed and missing modules and says why', () => {
    const records = [
      graded('A', 5, 2.0),
      {
        code: 'P',
        credits: 5,
        grading: 'pass_fail' as const,
        countsTowardAverage: false,
        attempts: [{ attemptNo: 1, result: 'passed' as const }],
      },
      { ...graded('X', 5, 1.0), countsTowardAverage: false },
      graded('F', 5, 5.0),
    ]
    const result = computeOverall(flatRules(['A', 'P', 'X', 'F', 'MISSING']), records)
    expect(result.value).toBe('2.0')
    expect(result.countedCredits).toBe(5)
    expect(result.trace.modules.map((m) => [m.code, m.status])).toEqual([
      ['A', 'counted'],
      ['P', 'pass_fail'],
      ['X', 'excluded'],
      ['F', 'not_passed'],
      ['MISSING', 'missing'],
    ])
  })

  it('picks the best or the latest passing attempt', () => {
    const improvement = graded('M', 5, 2.0, 2.7)
    const best = computeOverall(flatRules(['M']), [improvement])
    const latest = computeOverall(flatRules(['M'], undefined, { attemptSelection: 'latest' }), [improvement])
    expect(best.value).toBe('2.0')
    expect(latest.value).toBe('2.7')
  })

  it('ignores a failed first attempt', () => {
    const rules = flatRules(['M'])
    expect(effectiveGradeTenths(graded('M', 5, 5.0, 3.3), rules)).toBe(33)
  })

  it('rejects grades outside the allowed set and duplicate records', () => {
    expect(() => computeOverall(flatRules(['A']), [graded('A', 5, 1.5)])).toThrow(GradeRuleError)
    expect(() => computeOverall(flatRules(['A']), [graded('A', 5, 1.0), graded('A', 5, 2.0)])).toThrow(
      GradeRuleError,
    )
  })
})

describe('computeOverall: weights', () => {
  it('applies a factor, e.g. a double-weighted thesis', () => {
    const rules = flatRules([])
    rules.aggregation.children = [
      { kind: 'module', code: 'A' },
      { kind: 'module', code: 'T', factor: 2 },
    ]
    // (2.0*10 + 1.0*12*2) / (10 + 24) = 1.294...
    const result = computeOverall(rules, [graded('A', 10, 2.0), graded('T', 12, 1.0)])
    expect(result.exact).toEqual(rational(22n, 17n))
    expect(result.value).toBe('1.2')
    expect(result.countedCredits).toBe(22)
  })

  it('truncates group results before the parent uses them', () => {
    const group = (id: string, codes: string[], truncate: boolean): GradeRules['aggregation'] => ({
      id,
      weightMode: 'credits',
      ...(truncate ? { roundResult: { mode: 'truncate' as const, precision: 1 as const } } : {}),
      children: codes.map((code) => ({ kind: 'module' as const, code })),
    })
    const records = [graded('A', 5, 1.3), graded('B', 5, 1.7), graded('C', 5, 2.3), graded('D', 4, 2.0)]
    const rulesWith = (truncate: boolean): GradeRules => ({
      ...flatRules([]),
      aggregation: {
        id: 'root',
        weightMode: 'credits',
        children: [
          { kind: 'group', node: group('X', ['A', 'B'], truncate) },
          { kind: 'group', node: group('Y', ['C', 'D'], truncate) },
        ],
      },
    })

    // X = 1.5, Y = 2.1666 -> 2.1; (1.5*10 + 2.1*9) / 19 = 1.784
    const truncated = computeOverall(rulesWith(true), records)
    expect(truncated.value).toBe('1.7')
    expect(truncated.trace.groups.map((g) => [g.id, g.rounded, g.weight])).toEqual([
      ['X', '1.5', '10'],
      ['Y', '2.1', '9'],
    ])
    // Without group truncation: 34.5 / 19 = 1.815
    expect(computeOverall(rulesWith(false), records).value).toBe('1.8')
  })

  it('uses fixed proportions and renormalises when a group is still empty', () => {
    const rules: GradeRules = {
      ...flatRules([]),
      aggregation: {
        id: 'root',
        weightMode: 'fixed',
        children: [
          {
            kind: 'group',
            weight: 1,
            node: { id: 'G1', weightMode: 'credits', children: [{ kind: 'module', code: 'A' }] },
          },
          {
            kind: 'group',
            weight: 3,
            node: { id: 'G2', weightMode: 'credits', children: [{ kind: 'module', code: 'B' }] },
          },
        ],
      },
    }
    // (1.0*1 + 2.0*3) / 4 = 1.75
    expect(computeOverall(rules, [graded('A', 5, 1.0), graded('B', 5, 2.0)]).value).toBe('1.7')
    expect(computeOverall(rules, [graded('A', 5, 1.0)]).value).toBe('1.0')
  })

  it('lets a group carry a fixed credit weight', () => {
    const rules: GradeRules = {
      ...flatRules([]),
      aggregation: {
        id: 'root',
        weightMode: 'credits',
        children: [
          {
            kind: 'group',
            weight: 30,
            node: { id: 'G', weightMode: 'credits', children: [{ kind: 'module', code: 'A' }] },
          },
          { kind: 'module', code: 'B' },
        ],
      },
    }
    // (1.0*30 + 2.0*10) / 40 = 1.25
    expect(computeOverall(rules, [graded('A', 5, 1.0), graded('B', 10, 2.0)]).value).toBe('1.2')
  })
})

describe('computeOverall: dropWorst (Streichregel)', () => {
  const rulesWithBudget = (maxCredits: number): GradeRules => {
    const rules = flatRules(['A', 'B', 'C'])
    rules.aggregation.dropWorst = { maxCredits }
    return rules
  }

  it('drops the worst module when it fits the budget', () => {
    const result = computeOverall(rulesWithBudget(5), [
      graded('A', 5, 1.0),
      graded('B', 5, 1.0),
      graded('C', 5, 4.0),
    ])
    expect(result.value).toBe('1.0')
    expect(result.trace.modules.find((m) => m.code === 'C')?.status).toBe('dropped')
    expect(result.countedCredits).toBe(10)
  })

  it('keeps it when the budget is too small', () => {
    const result = computeOverall(rulesWithBudget(4), [
      graded('A', 5, 1.0),
      graded('B', 5, 1.0),
      graded('C', 5, 4.0),
    ])
    expect(result.value).toBe('2.0')
  })

  it('never drops a module that would not improve the average', () => {
    const result = computeOverall(rulesWithBudget(10), [
      graded('A', 5, 2.0),
      graded('B', 5, 2.0),
      graded('C', 5, 2.0),
    ])
    expect(result.trace.modules.every((m) => m.status === 'counted')).toBe(true)
  })
})

describe('computeCreditProgress', () => {
  it('counts passed graded and pass/fail modules', () => {
    const records = [
      graded('A', 5, 1.3),
      graded('F', 5, 5.0),
      {
        code: 'P',
        credits: 2.5,
        grading: 'pass_fail' as const,
        countsTowardAverage: false,
        attempts: [{ attemptNo: 1, result: 'passed' as const }],
      },
    ]
    expect(computeCreditProgress(records, flatRules([]), 180)).toEqual({
      earnedCredits: 7.5,
      gradedCredits: 5,
      requiredCredits: 180,
    })
  })
})
