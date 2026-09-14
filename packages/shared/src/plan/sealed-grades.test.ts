import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { presetSchema } from '../schema/preset.ts'
import { setModuleAttempts } from './attempts.ts'
import { createGuestDocument, parseGuestDocument } from './document.ts'
import { setModuleResult, setTargetGrade } from './operations.ts'
import { createPlanFromPreset, planSchema } from './plan.ts'
import { extractGrades, mergeGrades, planHasGrades } from './sealed-grades.ts'
import { summarizePlan } from './summary.ts'

const preset = presetSchema.parse(
  JSON.parse(readFileSync(new URL('../../examples/informatik-bsc-example.json', import.meta.url), 'utf8')),
)

const gradedPlan = () => {
  let plan = createPlanFromPreset(preset, {
    id: 'plan',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })
  plan = setModuleAttempts(plan, 'INF-101', [
    { kind: 'graded', grade: 5.0 },
    { kind: 'graded', grade: 2.3 },
  ])
  plan = setModuleResult(plan, 'INF-102', { kind: 'graded', grade: 1.7 })
  return setTargetGrade(plan, 2.0)
}

describe('grade extraction', () => {
  it('removes every grade value and the target, keeps results, and puts them back exactly', () => {
    const plan = gradedPlan()
    expect(planHasGrades(plan)).toBe(true)

    const { plan: withoutGrades, secrets } = extractGrades(plan)
    expect(planHasGrades(withoutGrades)).toBe(false)
    expect(JSON.stringify(withoutGrades)).not.toMatch(/"grade"|targetGrade/)
    expect(planSchema.safeParse(withoutGrades).success).toBe(true)
    // Results stay, so the server still knows what is passed; the average needs the grades.
    expect(withoutGrades.modules.find((module) => module.code === 'INF-101')?.attempts).toEqual([
      { attemptNo: 1, result: 'failed' },
      { attemptNo: 2, result: 'passed' },
    ])
    expect(summarizePlan(withoutGrades).overall.value).toBeNull()
    expect(secrets).toEqual({
      targetGrade: 2.0,
      grades: { 'INF-101': { 1: 5.0, 2: 2.3 }, 'INF-102': { 1: 1.7 } },
    })

    const restored = mergeGrades(withoutGrades, secrets ?? { grades: {} })
    expect(summarizePlan(restored).overall).toEqual(summarizePlan(plan).overall)
    expect(restored.targetGrade).toBe(2.0)
    expect(restored.modules.find((module) => module.code === 'INF-101')?.attempts).toEqual(
      plan.modules.find((module) => module.code === 'INF-101')?.attempts,
    )
  })

  it('leaves a plan without grades untouched and ignores grades of removed attempts', () => {
    const empty = createPlanFromPreset(preset, {
      id: 'plan',
      startTerm: { season: 'winter', year: 2026 },
      now: new Date('2026-09-13T10:00:00Z'),
    })
    expect(extractGrades(empty)).toEqual({ plan: empty, secrets: null })

    const merged = mergeGrades(empty, { grades: { 'INF-101': { 1: 1.0 }, 'NOPE-1': { 1: 1.0 } } })
    expect(planHasGrades(merged)).toBe(false)
  })

  it('carries the sealed grades in the document format', () => {
    const { plan } = extractGrades(gradedPlan())
    const document = { ...createGuestDocument(plan), encryptedGrades: { v: 1, iv: 'AAAA', data: 'QUJD' } }
    const parsed = parseGuestDocument(document)
    expect(parsed.success && parsed.document.encryptedGrades).toEqual({ v: 1, iv: 'AAAA', data: 'QUJD' })
    expect(
      parseGuestDocument({ ...document, encryptedGrades: { v: 1, iv: 'not base64!', data: 'x' } }).success,
    ).toBe(false)
  })
})
