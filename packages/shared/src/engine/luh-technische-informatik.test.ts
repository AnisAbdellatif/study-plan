/**
 * Checks the LUH Technische Informatik B.Sc. preset against its sources:
 * the PO (Anlage 1, § 20) and the Studienverlaufsplan v8.7.2026.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeOverall } from '../engine/compute.ts'
import { graded } from '../engine/test-support.ts'
import { createPlanFromPreset } from '../plan/plan.ts'
import { summarizePlan } from '../plan/summary.ts'
import { presetSchema } from '../schema/preset.ts'

const preset = presetSchema.parse(
  JSON.parse(
    readFileSync(new URL('../../examples/luh-technische-informatik-bsc-2026.json', import.meta.url), 'utf8'),
  ),
)

const creditsOf = (codes: readonly string[]) =>
  codes.reduce((sum, code) => sum + (preset.modules.find((m) => m.code === code)?.credits ?? Number.NaN), 0)

const area = (id: string) => {
  const found = preset.areas.find((a) => a.id === id)
  if (!found) throw new Error(`missing area ${id}`)
  return found
}

describe('LUH Technische Informatik B.Sc. preset', () => {
  it('matches the required credits of each Kompetenzbereich in Anlage 1', () => {
    expect(creditsOf(area('grundlagen-informatik').moduleCodes)).toBe(50)
    expect(creditsOf(area('grundlagen-informationstechnik').moduleCodes)).toBe(52)
    expect(creditsOf(area('grundlagen-mathematik').moduleCodes)).toBe(22)
    expect(creditsOf(area('akademisches-arbeiten').moduleCodes)).toBe(10)
    expect(creditsOf(area('bachelorarbeit').moduleCodes)).toBe(15)
    expect(area('vertiefung-informatik')).toMatchObject({ minCredits: 10, maxCredits: 20 })
    expect(area('vertiefung-informationstechnik')).toMatchObject({ minCredits: 10, maxCredits: 20 })
  })

  it('marks exactly the modules Anlage 1 lists as unbenotet or Studienleistung-only as ungraded', () => {
    const ungraded = preset.modules.filter((m) => m.grading === 'pass_fail').map((m) => m.code)
    expect(ungraded.sort()).toEqual(
      ['AA-EINF', 'GI-DSA', 'GI-PROG1', 'GI-PROG2', 'GI-SWP', 'GIT-HWP', 'GIT-PP', 'SG-SG'].sort(),
    )
    expect(preset.modules.every((m) => m.countsTowardAverage === (m.grading === 'graded'))).toBe(true)
  })

  it('reproduces the Studienverlaufsplan semester totals, with electives left to choose', () => {
    const plan = createPlanFromPreset(preset, {
      id: 'luh',
      startTerm: { season: 'winter', year: 2026 },
      now: new Date('2026-09-13T10:00:00Z'),
    })
    const summary = summarizePlan(plan)
    // Plan: 28, 28, 31, 33 (with 6 LP Studium Generale), 30, 30. The preset uses 3 LP Studium Generale,
    // and the six Wahlpflicht slots in semesters 5 and 6 stay open for the student's choice.
    expect(summary.semesters.map((s) => s.credits)).toEqual([28, 28, 31, 30, 20, 15])
    expect(plan.backlog).toHaveLength(28)
    expect(summary.credits.planned + 28).toBe(preset.totalCredits)
  })

  it('keeps the offering cycles consistent with the typical semester for winter starters', () => {
    for (const module of preset.modules) {
      if (module.typicalSemester === undefined || module.offering === 'both') continue
      const expected = module.typicalSemester % 2 === 1 ? 'winter' : 'summer'
      expect({ code: module.code, offering: module.offering }).toEqual({
        code: module.code,
        offering: expected,
      })
    }
  })

  it('requires 120 LP before the Bachelorarbeit and models the Software-Projekt prerequisites', () => {
    expect(preset.modules.find((m) => m.code === 'BA-BA')?.requiresCredits).toBe(120)
    expect(preset.modules.find((m) => m.code === 'GI-SWP')?.prerequisites).toEqual([
      { anyOf: ['GI-PROG1', 'GI-PROG2', 'GIT-PP'] },
      { anyOf: ['GI-GSWT', 'VI-SWQ'] },
    ])
  })

  it('counts only the best 28 LP of Vertiefung modules, at least 10 LP per area (§ 20 Abs. 1-2)', () => {
    const vertiefungGrades: Record<string, number> = {
      'VI-AI1': 1.0,
      'VI-GTI': 1.3,
      'VI-SWQ': 2.0,
      'VI-ITSEC': 3.0,
      'VIT-EDA': 1.7,
      'VIT-RT1': 2.7,
      'VIT-QC': 4.0,
    }
    const records = preset.modules.flatMap((module) => {
      if (module.grading !== 'graded') return []
      const isVertiefung = module.code.startsWith('VI')
      const grade = isVertiefung ? vertiefungGrades[module.code] : 2.0
      return grade === undefined ? [] : [graded(module.code, module.credits, grade)]
    })

    const result = computeOverall(preset.gradeRules, records)
    // Graded required modules: 109 LP at 2.0 = 218. Kept electives: AI1, GTI (Informatik minimum),
    // EDA, RT1 (Informationstechnik minimum), then SWQ and ITSEC, where ITSEC crosses the 28 LP limit.
    // (218 + 5 * (1.0 + 1.3 + 2.0 + 3.0 + 1.7 + 2.7)) / 139 = 276.5 / 139 = 1.989...
    expect(result.countedCredits).toBe(139)
    expect(result.value).toBe('1.9')
    const vertiefung = result.trace.groups.find((g) => g.id === 'vertiefung')
    expect(vertiefung?.modules.filter((m) => m.status === 'surplus').map((m) => m.code)).toEqual(['VIT-QC'])

    // Without the best-of rule, the 4.0 would count: 296.5 / 144 = 2.059...
    const withoutBestOf = structuredClone(preset.gradeRules)
    const group = withoutBestOf.aggregation.children.find(
      (c) => c.kind === 'group' && c.node.id === 'vertiefung',
    )
    if (group?.kind === 'group') delete group.node.keepBest
    expect(computeOverall(withoutBestOf, records).value).toBe('2.0')
  })

  it('accepts composite module grades such as 1.2 and still truncates the result', () => {
    const records = [graded('BA-BA', 15, 1.2), graded('GIT-HLE', 7, 1.7)]
    // (1.2 * 15 + 1.7 * 7) / 22 = 29.9 / 22 = 1.359...
    expect(computeOverall(preset.gradeRules, records).value).toBe('1.3')
  })
})
