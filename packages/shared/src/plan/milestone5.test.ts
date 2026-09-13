import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type Preset, presetSchema } from '../schema/preset.ts'
import { mergeImportResults, parseGradeImport } from './grade-import.ts'
import { moveModule, setExamDate, setModuleResult, setTargetGrade } from './operations.ts'
import { createPlanFromPreset, type Plan, planSchema } from './plan.ts'
import { applyPresetUpdate, diffPresetUpdate, hasPresetChanges } from './preset-update.ts'
import { forkPlan, toSharedPlan } from './share.ts'

const loadPreset = (path: string) =>
  presetSchema.parse(JSON.parse(readFileSync(new URL(`../../examples/${path}`, import.meta.url), 'utf8')))

const luh = loadPreset('luh-technische-informatik-bsc-2026.json')
const example = loadPreset('informatik-bsc-example.json')

const planFor = (preset: Preset): Plan =>
  createPlanFromPreset(preset, {
    id: 'plan',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })

describe('sharing', () => {
  const privatePlan = () => {
    let plan = setModuleResult(planFor(example), 'INF-101', { kind: 'graded', grade: 1.3 })
    plan = setExamDate(plan, 'INF-102', '2027-07-20')
    return setTargetGrade(moveModule(plan, 'BA-601', null), 1.7)
  }

  it('reveals the structure but no results, exam dates or target grade', () => {
    const shared = toSharedPlan(privatePlan())
    expect(shared.modules.every((module) => module.attempts.length === 0)).toBe(true)
    expect(shared.modules.some((module) => 'examDate' in module)).toBe(false)
    expect('targetGrade' in shared).toBe(false)
    expect(shared.backlog).toEqual(['BA-601'])
    expect(shared.id).toBe('shared')
    expect(planSchema.safeParse(shared).success).toBe(true)
    expect(JSON.stringify(shared)).not.toContain('2027-07-20')
  })

  it('forks into an independent plan with its own identity', () => {
    const fork = forkPlan(toSharedPlan(privatePlan()), { id: 'mine', now: new Date('2026-10-01T08:00:00Z') })
    expect(fork).toMatchObject({
      id: 'mine',
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-01T08:00:00.000Z',
    })
    expect(fork.backlog).toEqual(['BA-601'])
    expect(planSchema.safeParse(fork).success).toBe(true)
  })
})

describe('parseGradeImport', () => {
  const notenspiegel = [
    'Prüfungsnummer\tModul\tNote\tStatus\tLP',
    '1001\tProgrammieren I\t\tBE\t5',
    '1002\tGrundlagen digitaler Systeme\t2,3\tBE\t5',
    '1003\tMathematik für die Ingenieurwissenschaften I\t5,0\tNB\t8',
    '1003\tMathematik für die Ingenieurwissenschaften I\t3,7\tBE\t8',
    '1004\tMathematik für die Ingenieurwissenschaften II\t1,7\tBE\t8,0',
    '1005\tRechnernetze 5,0 LP\t1.5\tBE',
    '1006\tUnbekanntes Modul\t2,0\tBE\t5',
    '',
    'Mathematik für die Ingenieurwissenschaften 2,0',
    'Datum 15.02.2027 Rechnerarchitektur',
  ].join('\n')

  const rows = () => parseGradeImport(notenspiegel, planFor(luh))
  const byLine = (line: number) => rows().find((row) => row.line === line)

  it('matches module names, including Roman numerals, and reads grades and pass markers', () => {
    expect(byLine(1)).toMatchObject({ status: 'no_result' })
    expect(byLine(2)).toMatchObject({ status: 'matched', moduleCode: 'GI-PROG1', result: { kind: 'passed' } })
    expect(byLine(3)).toMatchObject({
      status: 'matched',
      moduleCode: 'GI-GDS',
      result: { kind: 'graded', grade: 2.3 },
    })
    expect(byLine(4)).toMatchObject({
      status: 'matched',
      moduleCode: 'GM-MATHE1',
      result: { kind: 'graded', grade: 5 },
    })
    expect(byLine(6)).toMatchObject({
      status: 'matched',
      moduleCode: 'GM-MATHE2',
      result: { kind: 'graded', grade: 1.7 },
    })
  })

  it('skips credit values next to grades', () => {
    expect(byLine(7)).toMatchObject({
      status: 'matched',
      moduleCode: 'GI-RN',
      result: { kind: 'graded', grade: 1.5 },
    })
  })

  it('reports lines it cannot place', () => {
    expect(byLine(8)).toMatchObject({ status: 'unmatched', result: { kind: 'graded', grade: 2 } })
    const ambiguous = byLine(10)
    expect(ambiguous?.status).toBe('ambiguous')
    expect(ambiguous?.candidates).toEqual(expect.arrayContaining(['GM-MATHE1', 'GM-MATHE2']))
    expect(byLine(11)).toMatchObject({ status: 'no_result' })
    expect(byLine(9)).toBeUndefined()
  })

  it('flags results that do not fit the module or the grade scale', () => {
    const plan = planFor(example)
    const [notAllowed, passForGraded] = parseGradeImport(
      'Grundlagen der Programmierung 1,5\nAnalysis I bestanden',
      plan,
    )
    expect(notAllowed).toMatchObject({ status: 'invalid', moduleCode: 'INF-101' })
    expect(passForGraded).toMatchObject({ status: 'invalid', moduleCode: 'MAT-102' })
  })

  it('keeps the best of several attempts', () => {
    const plan = planFor(luh)
    const matched = rows().flatMap((row) =>
      row.status === 'matched' && row.moduleCode && row.result
        ? [{ moduleCode: row.moduleCode, result: row.result }]
        : [],
    )
    const merged = mergeImportResults(matched, plan)
    expect(merged.get('GM-MATHE1')).toEqual({ kind: 'graded', grade: 3.7 })
    expect(merged.get('GI-PROG1')).toEqual({ kind: 'passed' })
    expect(
      mergeImportResults(
        [
          { moduleCode: 'GI-GDS', result: { kind: 'graded', grade: 2.0 } },
          { moduleCode: 'GI-GDS', result: { kind: 'graded', grade: 1.3 } },
          { moduleCode: 'GI-GDS', result: { kind: 'graded', grade: 5.0 } },
        ],
        plan,
      ).get('GI-GDS'),
    ).toEqual({ kind: 'graded', grade: 1.3 })
  })
})

describe('preset updates', () => {
  const planWithHistory = () => {
    let plan = planFor(example)
    plan = setModuleResult(plan, 'INF-101', { kind: 'graded', grade: 1.3 })
    plan = setModuleResult(plan, 'INF-201', { kind: 'graded', grade: 2.0 })
    plan = setModuleResult(plan, 'SQ-101', { kind: 'passed' })
    plan = setExamDate(plan, 'INF-202', '2027-07-15')
    return moveModule(plan, 'INF-202', 's5')
  }

  const newerPreset = (): Preset => {
    const next = structuredClone(example)
    next.poVersion = 'PO 2027 (fiktiv)'
    const rename = next.modules.find((m) => m.code === 'INF-202')
    if (rename) rename.name = 'Theoretische Informatik I'
    const regrade = next.modules.find((m) => m.code === 'INF-201')
    if (regrade) {
      regrade.grading = 'pass_fail'
      regrade.countsTowardAverage = false
    }
    next.modules = next.modules.filter((m) => m.code !== 'WP-401' && m.code !== 'SQ-101')
    next.modules.push({
      code: 'WP-403',
      name: 'Maschinelles Lernen',
      credits: 6,
      grading: 'graded',
      countsTowardAverage: true,
      category: 'Wahlpflicht',
      offering: 'summer',
    })
    return next
  }

  it('finds nothing to do when the preset is unchanged', () => {
    expect(hasPresetChanges(diffPresetUpdate(planWithHistory(), example))).toBe(false)
  })

  it('describes added, removed and changed modules, and results that no longer fit', () => {
    const diff = diffPresetUpdate(planWithHistory(), newerPreset())
    expect(diff.added.map((m) => m.code)).toEqual(['WP-403'])
    expect(diff.removed).toEqual([
      { code: 'SQ-101', name: 'Schlüsselqualifikation: Wissenschaftliches Arbeiten', kept: true },
      { code: 'WP-401', name: 'Datenbanksysteme', kept: false },
    ])
    expect(diff.changed).toEqual([
      {
        code: 'INF-201',
        name: 'Rechnerarchitektur',
        fields: ['grading', 'countsTowardAverage'],
        resultCleared: true,
      },
      { code: 'INF-202', name: 'Theoretische Informatik I', fields: ['name'], resultCleared: false },
    ])
    expect(diff.info).toEqual(['poVersion'])
    expect(hasPresetChanges(diff)).toBe(true)
  })

  it('applies the update while keeping placements, results and exam dates that still fit', () => {
    const plan = applyPresetUpdate(planWithHistory(), newerPreset())
    expect(planSchema.safeParse(plan).success).toBe(true)
    const module = (code: string) => plan.modules.find((m) => m.code === code)

    expect(module('INF-101')?.attempts).toEqual([{ attemptNo: 1, result: 'passed', grade: 1.3 }])
    expect(module('INF-202')).toMatchObject({ name: 'Theoretische Informatik I', examDate: '2027-07-15' })
    expect(plan.semesters[4]?.moduleCodes).toContain('INF-202')
    expect(module('INF-201')).toMatchObject({ grading: 'pass_fail', attempts: [] })
    expect(module('WP-401')).toBeUndefined()
    expect(plan.semesters.flatMap((s) => s.moduleCodes)).not.toContain('WP-401')
    expect(module('SQ-101')?.attempts).toHaveLength(1)
    expect(module('SQ-101')?.retired).toBe(true)
    expect(plan.backlog).toContain('WP-403')
    expect(plan.preset.poVersion).toBe('PO 2027 (fiktiv)')
    expect(hasPresetChanges(diffPresetUpdate(plan, newerPreset()))).toBe(false)
  })

  it('clears grades and a target grade that the new grade scale no longer allows', () => {
    const next = structuredClone(example)
    next.gradeRules.allowedValues = next.gradeRules.allowedValues.filter(
      (grade) => grade !== 1.3 && grade !== 1.7,
    )
    const plan = setTargetGrade(planWithHistory(), 1.7)
    const diff = diffPresetUpdate(plan, next)
    expect(diff.rulesChanged).toBe(true)
    expect(diff.targetGradeCleared).toBe(true)
    expect(diff.changed).toContainEqual({
      code: 'INF-101',
      name: 'Grundlagen der Programmierung',
      fields: [],
      resultCleared: true,
    })

    const updated = applyPresetUpdate(plan, next)
    expect(updated.modules.find((m) => m.code === 'INF-101')?.attempts).toEqual([])
    expect(updated.targetGrade).toBeUndefined()
    expect(planSchema.safeParse(updated).success).toBe(true)
  })
})
