import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { flatRules } from '../engine/test-support.ts'
import { presetSchema } from '../schema/preset.ts'
import { addDays, daysBetween, planDeadlines, upcomingDeadlines } from './deadlines.ts'
import { createIcs } from './ics.ts'
import { moveModule, setExamDate, setModuleResult, setTargetGrade } from './operations.ts'
import { createPlanFromPreset, type Plan, planSchema } from './plan.ts'
import { validatePlan } from './validation.ts'
import { analyzeWhatIf } from './what-if.ts'

const loadPreset = (path: string) =>
  presetSchema.parse(
    JSON.parse(readFileSync(new URL(`../../../../presets/${path}`, import.meta.url), 'utf8')),
  )

const luh = loadPreset('luh/technische-informatik-bsc-2026.json')
const example = loadPreset('example/informatik-bsc-example.json')

const planFor = (preset: typeof luh, season: 'winter' | 'summer' = 'winter'): Plan =>
  createPlanFromPreset(preset, {
    id: 'p',
    startTerm: { season, year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })

const warnings = (plan: Plan) => validatePlan(plan).filter((issue) => issue.severity === 'warning')

describe('validatePlan', () => {
  it('finds nothing wrong with the LUH Studienverlaufsplan for winter starters, only open electives', () => {
    const issues = validatePlan(planFor(luh))
    expect(issues.filter((i) => i.severity === 'warning')).toEqual([])
    expect(issues).toEqual([
      {
        kind: 'area_below_minimum',
        severity: 'info',
        areaId: 'vertiefung-informatik',
        planned: 0,
        minCredits: 10,
      },
      {
        kind: 'area_below_minimum',
        severity: 'info',
        areaId: 'vertiefung-informationstechnik',
        planned: 0,
        minCredits: 10,
      },
    ])
  })

  it('flags winter-only modules in a summer start semester, but not modules offered every term', () => {
    const plan = planFor(luh, 'summer')
    const wrongTerm = warnings(plan).filter((i) => i.kind === 'wrong_term')
    expect(wrongTerm).toContainEqual({
      kind: 'wrong_term',
      severity: 'warning',
      code: 'GI-PROG1',
      semesterId: 's1',
      offering: 'winter',
      term: { season: 'summer', year: 2026 },
    })
    expect(wrongTerm.some((i) => i.code === 'GM-MATHE1')).toBe(false)
  })

  it('requires prerequisites in an earlier semester, not the same one', () => {
    const plan = moveModule(planFor(luh), 'GIT-HWP', 's2')
    expect(warnings(plan)).toContainEqual({
      kind: 'missing_prerequisite',
      severity: 'warning',
      code: 'GIT-HWP',
      semesterId: 's2',
      missing: ['GI-GRA'],
    })
  })

  it('accepts a passed prerequisite wherever it is placed', () => {
    let plan = moveModule(planFor(luh), 'GI-GRA', null)
    plan = setModuleResult(plan, 'GI-GRA', { kind: 'graded', grade: 2.0 })
    expect(warnings(plan).some((i) => i.kind === 'missing_prerequisite')).toBe(false)
  })

  it('satisfies an any-of prerequisite with any listed module', () => {
    let plan = moveModule(planFor(luh), 'GI-GSWT', null)
    expect(warnings(plan)).toContainEqual({
      kind: 'missing_prerequisite',
      severity: 'warning',
      code: 'GI-SWP',
      semesterId: 's5',
      missing: [{ anyOf: ['GI-GSWT', 'VI-SWQ'] }],
    })
    plan = moveModule(plan, 'VI-SWQ', 's4')
    expect(warnings(plan).some((i) => i.kind === 'missing_prerequisite')).toBe(false)
  })

  it('requires 120 LP before the Bachelorarbeit', () => {
    const plan = moveModule(planFor(luh), 'BA-BA', 's3')
    expect(warnings(plan)).toContainEqual({
      kind: 'not_enough_credits',
      severity: 'warning',
      code: 'BA-BA',
      semesterId: 's3',
      required: 120,
      available: 56,
    })
  })

  it('warns when an area is over its maximum and notes irregular offerings', () => {
    let plan = planFor(luh)
    for (const code of ['VI-GTI', 'VI-DS', 'VI-MCI', 'VI-ITSEC', 'VI-RS']) plan = moveModule(plan, code, 's5')
    plan = moveModule(plan, 'VI-EMHCC', 's5')
    const issues = validatePlan(plan)
    expect(issues).toContainEqual({
      kind: 'area_above_maximum',
      severity: 'warning',
      areaId: 'vertiefung-informatik',
      planned: 30,
      maxCredits: 20,
    })
    expect(issues).toContainEqual({
      kind: 'irregular_offering',
      severity: 'info',
      code: 'VI-EMHCC',
      semesterId: 's5',
    })
  })

  it('never flags a module that is already passed', () => {
    let plan = moveModule(planFor(luh, 'summer'), 'GI-PROG1', 's1')
    plan = setModuleResult(plan, 'GI-PROG1', { kind: 'passed' })
    expect(warnings(plan).some((i) => 'code' in i && i.code === 'GI-PROG1')).toBe(false)
  })
})

describe('analyzeWhatIf', () => {
  const gradedCodes = example.modules.filter((m) => m.grading === 'graded').map((m) => m.code)

  // Flat credit-weighted rules over the example modules keep the arithmetic easy to follow: 72 graded LP.
  const flatPlan = (): Plan => {
    let plan = { ...planFor(example), rules: flatRules(gradedCodes) }
    plan = setModuleResult(plan, 'INF-101', { kind: 'graded', grade: 1.0 })
    return setModuleResult(plan, 'INF-102', { kind: 'graded', grade: 1.0 })
  }

  it('reports the range between best and worst case over the open modules', () => {
    const analysis = analyzeWhatIf(flatPlan())
    expect(analysis.openCredits).toBe(56)
    expect(analysis.current).toBe('1.0')
    expect(analysis.bestCase).toBe('1.0')
    // (16 * 1.0 + 56 * 4.0) / 72 = 3.33
    expect(analysis.worstCase).toBe('3.3')
    expect(analysis.target).toBeNull()
  })

  it('finds the worst uniform grade that still reaches the target', () => {
    // 2.3 everywhere: 144.8 / 72 = 2.01 -> 2.0. 2.7 everywhere: 167.2 / 72 = 2.32 -> 2.3.
    expect(analyzeWhatIf(flatPlan(), 2.0).target).toEqual({ grade: 2.0, reachable: true, requiredGrade: 2.3 })
    // 1.3 everywhere: 88.8 / 72 = 1.23 -> 1.2, so only 1.0 reaches 1.0.
    expect(analyzeWhatIf(flatPlan(), 1.0).target).toEqual({ grade: 1.0, reachable: true, requiredGrade: 1.0 })
  })

  it('says when a target is out of reach', () => {
    let plan = { ...planFor(example), rules: flatRules(gradedCodes) }
    plan = setModuleResult(plan, 'INF-101', { kind: 'graded', grade: 4.0 })
    // Best case: (8 * 4.0 + 64 * 1.0) / 72 = 1.33 -> 1.3
    expect(analyzeWhatIf(plan, 1.0).target).toEqual({ grade: 1.0, reachable: false, requiredGrade: null })
  })

  it('ignores modules in the backlog and respects the preset rules such as best-of selection', () => {
    const plan = moveModule(flatPlan(), 'WP-401', null)
    expect(analyzeWhatIf(plan).openCredits).toBe(50)

    let luhPlan = planFor(luh)
    for (const code of ['VI-GTI', 'VI-DS', 'VI-MCI', 'VIT-EDA', 'VIT-QC', 'VIT-RT1', 'VI-RS']) {
      luhPlan = moveModule(luhPlan, code, 's6')
    }
    const analysis = analyzeWhatIf(luhPlan, 1.5)
    expect(analysis.openCredits).toBe(109 + 35)
    expect(analysis.target?.reachable).toBe(true)
  })

  it('answers from the current grade when nothing is open', () => {
    let plan = { ...planFor(example), rules: flatRules(gradedCodes) }
    for (const code of gradedCodes) plan = setModuleResult(plan, code, { kind: 'graded', grade: 2.0 })
    expect(analyzeWhatIf(plan, 2.0).target).toEqual({ grade: 2.0, reachable: true, requiredGrade: null })
    expect(analyzeWhatIf(plan, 1.7).target).toEqual({ grade: 1.7, reachable: false, requiredGrade: null })
  })
})

describe('deadlines', () => {
  const withExam = () => {
    const plan = planFor(luh)
    return setExamDate(setExamDate(plan, 'GI-GDS', '2027-02-15'), 'GM-MATHE1', '2027-02-03')
  }

  it('does calendar arithmetic across months and years', () => {
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04')
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28')
    expect(daysBetween('2027-02-08', '2027-02-15')).toBe(7)
  })

  it('lists exams and withdrawal deadlines in date order', () => {
    expect(planDeadlines(withExam())).toEqual([
      {
        kind: 'withdrawal',
        code: 'GM-MATHE1',
        moduleName: 'Mathematik für die Ingenieurwissenschaften I',
        date: '2027-01-27',
      },
      {
        kind: 'exam',
        code: 'GM-MATHE1',
        moduleName: 'Mathematik für die Ingenieurwissenschaften I',
        date: '2027-02-03',
      },
      { kind: 'withdrawal', code: 'GI-GDS', moduleName: 'Grundlagen digitaler Systeme', date: '2027-02-08' },
      { kind: 'exam', code: 'GI-GDS', moduleName: 'Grundlagen digitaler Systeme', date: '2027-02-15' },
    ])
  })

  it('limits upcoming deadlines to the horizon and drops passed modules', () => {
    let plan = withExam()
    expect(upcomingDeadlines(plan, '2027-02-01', 10).map((e) => `${e.kind}:${e.code}`)).toEqual([
      'exam:GM-MATHE1',
      'withdrawal:GI-GDS',
    ])
    plan = setModuleResult(plan, 'GM-MATHE1', { kind: 'graded', grade: 1.3 })
    expect(upcomingDeadlines(plan, '2027-02-01', 30).some((e) => e.code === 'GM-MATHE1')).toBe(false)
  })

  it('has no withdrawal deadlines when the preset defines no withdrawal period', () => {
    const plan = setExamDate(planFor(example), 'INF-101', '2027-02-15')
    expect(
      planDeadlines({ ...plan, preset: { ...plan.preset, withdrawalDaysBeforeExam: undefined } }),
    ).toEqual([
      { kind: 'exam', code: 'INF-101', moduleName: 'Grundlagen der Programmierung', date: '2027-02-15' },
    ])
  })

  it('stores exam dates and target grades on the plan and validates them', () => {
    let plan = setTargetGrade(withExam(), 1.7)
    expect(plan.targetGrade).toBe(1.7)
    expect(planSchema.safeParse(plan).success).toBe(true)
    plan = setTargetGrade(setExamDate(plan, 'GI-GDS', null), null)
    expect(plan.modules.find((m) => m.code === 'GI-GDS')?.examDate).toBeUndefined()
    expect(plan.targetGrade).toBeUndefined()
    expect(planSchema.safeParse({ ...plan, targetGrade: 1.25 }).success).toBe(false)
    expect(() => setExamDate(plan, 'GI-GDS', '15.02.2027')).toThrow()
  })
})

describe('createIcs', () => {
  const events = planDeadlines(setExamDate(planFor(luh), 'GIT-HLE', '2027-07-20'))
  const ics = createIcs(events, {
    calendarName: 'Technische Informatik, LUH; Prüfungen',
    now: new Date('2026-09-13T10:00:00Z'),
    summarize: (event) =>
      `${event.kind === 'exam' ? 'Prüfung' : 'Letzter Tag zur Abmeldung'}: ${event.moduleName} – mit einem sehr langen Zusatz, der gefaltet werden muss`,
  })

  it('writes a CRLF calendar with one all-day event per deadline', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics).toContain('DTSTART;VALUE=DATE:20270720\r\nDTEND;VALUE=DATE:20270721')
    expect(ics).toContain('DTSTART;VALUE=DATE:20270713')
    expect(ics).toContain('DTSTAMP:20260913T100000Z')
    expect(ics).toContain('UID:exam-GIT-HLE-20270720@study-plan')
  })

  it('escapes text and folds long lines at 75 octets without losing content', () => {
    const encoder = new TextEncoder()
    const lines = ics.split('\r\n').filter(Boolean)
    expect(lines.every((line) => encoder.encode(line).length <= 75)).toBe(true)
    const unfolded = ics.replace(/\r\n /g, '')
    expect(unfolded).toContain('X-WR-CALNAME:Technische Informatik\\, LUH\\; Prüfungen')
    expect(unfolded).toContain(
      'SUMMARY:Prüfung: Halbleiterelektronik – mit einem sehr langen Zusatz\\, der gefaltet werden muss',
    )
  })
})
