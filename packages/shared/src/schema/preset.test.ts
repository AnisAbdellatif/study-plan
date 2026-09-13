import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeOverall } from '../engine/compute.ts'
import { graded } from '../engine/test-support.ts'
import { type Preset, presetSchema } from './preset.ts'

const example: Preset = JSON.parse(
  readFileSync(new URL('../../../../presets/example/informatik-bsc-example.json', import.meta.url), 'utf8'),
)

const clone = (): Preset => structuredClone(example)

const issues = (data: unknown): string[] => {
  const result = presetSchema.safeParse(data)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe('presetSchema', () => {
  it('accepts the example preset', () => {
    expect(issues(example)).toEqual([])
  })

  it('rejects duplicate module codes', () => {
    const preset = clone()
    const first = preset.modules[0]
    if (first) preset.modules.push({ ...first })
    expect(issues(preset)).toContain(`Duplicate module code "${first?.code}"`)
  })

  it('rejects an aggregation that references an unknown module', () => {
    const preset = clone()
    preset.gradeRules.aggregation.children.push({ kind: 'module', code: 'NOPE' })
    expect(issues(preset)).toContain('Aggregation references unknown module "NOPE"')
  })

  it('rejects aggregating a module that does not count toward the average', () => {
    const preset = clone()
    preset.gradeRules.aggregation.children.push({ kind: 'module', code: 'SQ-101' })
    expect(issues(preset)).toContain(
      'Module "SQ-101" is aggregated but is ungraded or excluded from the average',
    )
  })

  it('requires integer weights in fixed mode', () => {
    const preset = clone()
    preset.gradeRules.aggregation.weightMode = 'fixed'
    expect(issues(preset).some((m) => m.includes('uses fixed weights'))).toBe(true)
  })

  it('requires the pass threshold to be an allowed value', () => {
    const preset = clone()
    preset.gradeRules.passThreshold = 4.3
    expect(issues(preset)).toContain('The pass threshold must be one of the allowed values')
  })

  it('rejects grades with more than one decimal and odd credit steps', () => {
    const preset = clone()
    preset.gradeRules.allowedValues.push(1.25)
    const module = preset.modules[0]
    if (module) module.credits = 7.3
    const messages = issues(preset)
    expect(messages).toContain('Grades have at most one decimal place')
    expect(messages).toContain('Credits must be whole or half numbers')
  })
})

describe('example preset end to end', () => {
  it('computes truncated groups, the Streichregel and a double-weighted thesis together', () => {
    const preset = presetSchema.parse(example)
    const records = [
      graded('INF-101', 8, 1.3),
      graded('INF-102', 8, 2.0),
      graded('MAT-101', 9, 2.7),
      graded('MAT-102', 9, 2.3),
      graded('INF-201', 6, 1.7),
      graded('INF-202', 8, 2.0),
      graded('WP-401', 6, 3.7),
      graded('WP-402', 6, 1.3),
      graded('BA-601', 12, 1.0),
    ]
    const result = computeOverall(preset.gradeRules, records)

    const [grundlagen, vertiefung] = result.trace.groups
    // Grundlagen: 71.4 / 34 = 2.1
    expect(grundlagen?.rounded).toBe('2.1')
    // Vertiefung: WP-401 (3.7, 6 credits) is dropped; 34 / 20 = 1.7
    expect(vertiefung?.value).toBe('1.7000')
    expect(vertiefung?.modules.find((m) => m.code === 'WP-401')?.status).toBe('dropped')
    // Root: (2.1*34 + 1.7*20 + 1.0*12*2) / 78 = 1.658...
    expect(result.value).toBe('1.6')
    expect(result.countedCredits).toBe(66)
  })
})
