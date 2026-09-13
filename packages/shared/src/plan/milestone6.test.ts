import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { computeOverall } from '../engine/compute.ts'
import { type Preset, presetSchema } from '../schema/preset.ts'
import { attemptEntries, attemptStatus, setModuleAttempts } from './attempts.ts'
import { dueReminders } from './deadlines.ts'
import { creditRequirements } from './eligibility.ts'
import { mergeImportAttempts } from './grade-import.ts'
import { findModule, moveModule, PlanError, setExamDate, setModuleResult } from './operations.ts'
import { createPlanFromPreset, type Plan, planSchema } from './plan.ts'
import { diffPresetUpdate } from './preset-update.ts'
import { validatePlan } from './validation.ts'

const readPreset = (path: string) =>
  JSON.parse(readFileSync(new URL(`../../examples/${path}`, import.meta.url), 'utf8')) as Record<
    string,
    unknown
  >
const loadPreset = (path: string) => presetSchema.parse(readPreset(path))

const luh = loadPreset('luh-technische-informatik-bsc-2026.json')
const example = loadPreset('informatik-bsc-example.json')

const planFor = (preset: Preset): Plan =>
  createPlanFromPreset(preset, {
    id: 'plan',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })

const attemptIssues = (plan: Plan) =>
  validatePlan(plan).filter((issue) =>
    ['attempts_exhausted', 'last_attempt', 'retaken_after_pass'].includes(issue.kind),
  )

describe('attempts', () => {
  const graded = luh.modules.find((module) => module.grading === 'graded' && module.code !== 'BA-BA')
  if (!graded) throw new Error('expected a graded LUH module')
  const code = graded.code

  it('warns before the last of three attempts and mentions the Ergänzungsprüfung (§ 14)', () => {
    let plan = setModuleAttempts(planFor(luh), code, [{ kind: 'graded', grade: 5.0, date: '2027-02-10' }])
    expect(attemptIssues(plan)).toEqual([])
    expect(attemptStatus(findModule(plan, code), plan)).toMatchObject({
      used: 1,
      remaining: 2,
      maxAttempts: 3,
    })

    plan = setModuleAttempts(plan, code, [
      { kind: 'graded', grade: 5.0 },
      { kind: 'absent' },
      { kind: 'registered' },
    ])
    expect(attemptIssues(plan)).toEqual([
      { kind: 'last_attempt', severity: 'warning', code, maxAttempts: 3, supplementaryExam: true },
    ])
    expect(attemptStatus(findModule(plan, code), plan).pending).toBe(true)
  })

  it('does not count withdrawals and reports exhausted attempts', () => {
    let plan = setModuleAttempts(planFor(luh), code, [
      { kind: 'graded', grade: 5.0 },
      { kind: 'withdrawn' },
      { kind: 'graded', grade: 5.0 },
    ])
    expect(attemptIssues(plan).map((issue) => issue.kind)).toEqual(['last_attempt'])

    plan = setModuleAttempts(plan, code, [
      { kind: 'graded', grade: 5.0 },
      { kind: 'graded', grade: 5.0 },
      { kind: 'graded', grade: 5.0 },
    ])
    expect(attemptIssues(plan)).toEqual([
      { kind: 'attempts_exhausted', severity: 'warning', code, maxAttempts: 3 },
    ])
  })

  it('counts a pass in the last attempt and clears the warnings', () => {
    const plan = setModuleAttempts(planFor(luh), code, [
      { kind: 'graded', grade: 5.0 },
      { kind: 'graded', grade: 5.0 },
      { kind: 'graded', grade: 4.0 },
    ])
    expect(attemptIssues(plan)).toEqual([])
    const trace = computeOverall(plan.rules, plan.modules).trace
    const flat = JSON.stringify(trace)
    expect(flat).toContain(`"code":"${code}","status":"counted","grade":"4.0"`)
  })

  it('gives the Bachelorarbeit only two attempts', () => {
    const plan = setModuleAttempts(planFor(luh), 'BA-BA', [{ kind: 'graded', grade: 5.0 }])
    expect(attemptIssues(plan)).toMatchObject([{ kind: 'last_attempt', code: 'BA-BA', maxAttempts: 2 }])
  })

  it('flags retaking a passed exam when the PO does not allow it', () => {
    const plan = setModuleAttempts(planFor(luh), code, [
      { kind: 'graded', grade: 3.7 },
      { kind: 'graded', grade: 2.0 },
    ])
    expect(attemptIssues(plan)).toEqual([{ kind: 'retaken_after_pass', severity: 'warning', code }])
  })

  it('stays silent for presets without attempt rules', () => {
    const plan = setModuleAttempts(planFor(example), 'INF-101', [
      { kind: 'graded', grade: 5.0 },
      { kind: 'graded', grade: 5.0 },
      { kind: 'graded', grade: 5.0 },
      { kind: 'graded', grade: 5.0 },
    ])
    expect(attemptIssues(plan)).toEqual([])
    expect(attemptStatus(findModule(plan, 'INF-101'), plan).remaining).toBeNull()
  })

  it('round-trips entries and rejects results that do not fit the module', () => {
    const entries = [
      { kind: 'graded', grade: 5.0, date: '2027-02-10' },
      { kind: 'withdrawn' },
      { kind: 'graded', grade: 2.3, date: '2027-09-30' },
    ] as const
    const plan = setModuleAttempts(planFor(example), 'INF-101', entries)
    const module = findModule(plan, 'INF-101')
    expect(module.attempts.map((attempt) => attempt.attemptNo)).toEqual([1, 2, 3])
    expect(attemptEntries(module)).toEqual(entries)
    expect(planSchema.safeParse(plan).success).toBe(true)

    expect(() => setModuleAttempts(plan, 'INF-101', [{ kind: 'passed' }])).toThrow(PlanError)
    expect(() => setModuleAttempts(plan, 'SQ-101', [{ kind: 'graded', grade: 1.0 }])).toThrow(PlanError)
    expect(() => setModuleAttempts(plan, 'INF-101', [{ kind: 'graded', grade: 1.5 }])).toThrow(PlanError)
    expect(() => setModuleAttempts(plan, 'INF-101', [{ kind: 'absent', date: '2027-02-30' }])).toThrow(
      PlanError,
    )
  })

  it('rebuilds attempt histories from a grade import', () => {
    const plan = planFor(example)
    const merged = mergeImportAttempts(
      [
        { moduleCode: 'INF-101', result: { kind: 'graded', grade: 5.0 } },
        { moduleCode: 'INF-101', result: { kind: 'graded', grade: 3.0 } },
        { moduleCode: 'INF-101', result: { kind: 'graded', grade: 2.3 } },
        { moduleCode: 'SQ-101', result: { kind: 'failed' } },
      ],
      plan,
    )
    expect(merged.get('INF-101')).toEqual([
      { kind: 'graded', grade: 5.0 },
      { kind: 'graded', grade: 2.3 },
    ])
    expect(merged.get('SQ-101')).toEqual([{ kind: 'failed' }])
  })
})

describe('credit requirements', () => {
  const withRequirement = (credits: number) =>
    presetSchema.parse({
      ...readPreset('informatik-bsc-example.json'),
      modules: example.modules.map((module) =>
        module.code === 'BA-601' ? { ...module, requiresCredits: credits } : module,
      ),
    })
  const forecast = (plan: Plan) => {
    const [requirement] = creditRequirements(plan)
    if (!requirement) throw new Error('expected a requirement')
    return requirement
  }

  it('forecasts the first semester that starts with enough credits', () => {
    // Planned credits per semester: 17, 17, 11, 8, 12, then the thesis.
    expect(forecast(planFor(withRequirement(30)))).toMatchObject({
      requiredCredits: 30,
      earnedCredits: 0,
      eligibleNow: false,
      plannedIndex: 5,
      eligibleFromIndex: 2,
    })
    expect(forecast(planFor(withRequirement(60))).eligibleFromIndex).toBe(5)
    expect(forecast(planFor(withRequirement(100))).eligibleFromIndex).toBeNull()
  })

  it('counts passed modules wherever they are and ignores open ones in the backlog', () => {
    let plan = moveModule(planFor(withRequirement(8)), 'INF-101', null)
    // Lineare Algebra I (9) in the first semester is enough by the start of the second.
    expect(forecast(plan)).toMatchObject({ eligibleNow: false, eligibleFromIndex: 1 })
    plan = setModuleResult(plan, 'INF-101', { kind: 'graded', grade: 2.0 })
    expect(forecast(plan)).toMatchObject({ earnedCredits: 8, eligibleNow: true, eligibleFromIndex: 0 })
  })

  it('reports when only the complete plan reaches the requirement', () => {
    let plan = planFor(withRequirement(65))
    plan = moveModule(moveModule(plan, 'WP-401', 's6'), 'WP-402', 's6')
    expect(forecast(plan).eligibleFromIndex).toBe(6)
  })

  it('covers the LUH Bachelorarbeit', () => {
    const [requirement] = creditRequirements(planFor(luh))
    expect(requirement).toMatchObject({ code: 'BA-BA', requiredCredits: 120, plannedIndex: 5 })
  })
})

describe('reminders', () => {
  const plan = setExamDate(planFor(example), 'INF-101', '2027-02-15')

  it('reminds of the withdrawal deadline 3 days ahead and of the exam 7 days ahead', () => {
    expect(dueReminders(plan, '2027-02-04')).toEqual([])
    expect(dueReminders(plan, '2027-02-05').map((event) => [event.kind, event.date])).toEqual([
      ['withdrawal', '2027-02-08'],
    ])
    expect(dueReminders(plan, '2027-02-08').map((event) => event.kind)).toEqual(['withdrawal', 'exam'])
    expect(dueReminders(plan, '2027-02-15').map((event) => event.kind)).toEqual(['exam'])
    expect(dueReminders(plan, '2027-02-16')).toEqual([])
  })

  it('stops once the module is passed', () => {
    const passed = setModuleResult(plan, 'INF-101', { kind: 'graded', grade: 2.0 })
    expect(dueReminders(passed, '2027-02-08')).toEqual([])
  })
})

describe('module details in preset updates', () => {
  it('reports changed Modulkatalog details and takes them over', () => {
    const plan = planFor(example)
    const updated = presetSchema.parse({
      ...readPreset('informatik-bsc-example.json'),
      modules: example.modules.map((module) =>
        module.code === 'INF-101'
          ? { ...module, details: { lecturers: ['Prof. Dr. Ada Lovelace'] } }
          : module,
      ),
    })
    const diff = diffPresetUpdate(plan, updated)
    expect(diff.changed).toEqual([
      { code: 'INF-101', name: 'Grundlagen der Programmierung', fields: ['details'], resultCleared: false },
    ])
  })
})
