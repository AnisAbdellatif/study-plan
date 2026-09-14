import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isModulePassed } from '../engine/progress.ts'
import { toHalves } from '../engine/units.ts'
import { presetSchema } from '../schema/preset.ts'
import { dependentModules } from './dependencies.ts'
import { graduationForecast } from './forecast.ts'
import { moveModule, PlanError, setModuleResult, setSemesterKind, setStartTerm } from './operations.ts'
import { createPlanFromPreset, type Plan, planSchema } from './plan.ts'
import { applyPresetUpdate } from './preset-update.ts'
import { setRecognition } from './recognition.ts'
import { toSharedPlan } from './share.ts'
import { suggestPlan } from './suggest.ts'
import { summarizePlan } from './summary.ts'
import { addTerms } from './terms.ts'
import { validatePlan } from './validation.ts'

const load = (file: string) =>
  presetSchema.parse(JSON.parse(readFileSync(new URL(`../../examples/${file}`, import.meta.url), 'utf8')))
const example = load('informatik-bsc-example.json')
const luh = load('luh-technische-informatik-bsc-2026.json')

const planFor = (preset = example): Plan =>
  createPlanFromPreset(preset, {
    id: 'plan',
    startTerm: { season: 'winter', year: 2026 },
    now: new Date('2026-09-13T10:00:00Z'),
  })

const kinds = (plan: Plan) => validatePlan(plan).map((issue) => issue.kind)

/** Passes every module in the semester at `index`, graded ones with a 2.0. */
const passSemester = (plan: Plan, index: number): Plan =>
  (plan.semesters[index]?.moduleCodes ?? []).reduce((next, code) => {
    const module = next.modules.find((item) => item.code === code)
    if (!module) return next
    return setModuleResult(
      next,
      code,
      module.grading === 'graded' ? { kind: 'graded', grade: 2.0 } : { kind: 'passed' },
    )
  }, plan)

describe('start term', () => {
  it('moves every semester to new terms and keeps the modules where they are', () => {
    const plan = planFor()
    const moved = setStartTerm(plan, { season: 'summer', year: 2027 })
    expect(moved.startTerm).toEqual({ season: 'summer', year: 2027 })
    expect(moved.semesters).toEqual(plan.semesters)
    expect(summarizePlan(moved).semesters[0]?.term).toEqual({ season: 'summer', year: 2027 })
    expect(planSchema.safeParse(moved).success).toBe(true)
    // Winter-only modules of semester 1 are now in a summer term.
    expect(kinds(moved)).toContain('wrong_term')
    expect(setStartTerm(plan, { season: 'winter', year: 2026 })).toBe(plan)
    expect(() => setStartTerm(plan, { season: 'winter', year: 1800 })).toThrow(PlanError)
  })
})

describe('semester kinds', () => {
  it('marks semesters and notes open modules in a leave semester', () => {
    const plan = setSemesterKind(planFor(), 's2', 'leave')
    expect(plan.semesters[1]?.kind).toBe('leave')
    expect(planSchema.safeParse(plan).success).toBe(true)
    expect(validatePlan(plan)).toContainEqual(
      expect.objectContaining({ kind: 'leave_semester_modules', semesterId: 's2' }),
    )
    expect(() => setSemesterKind(plan, 'nope', 'abroad')).toThrow(PlanError)
  })

  it('halves the load thresholds of a part-time semester', () => {
    const plan = planFor(luh)
    const credits = summarizePlan(plan).semesters[0]?.credits ?? 0
    expect(credits).toBeGreaterThan(18)
    expect(summarizePlan(plan).semesters[0]?.load).toBe('ok')
    expect(summarizePlan(setSemesterKind(plan, 's1', 'part_time')).semesters[0]).toMatchObject({
      kind: 'part_time',
      load: 'high',
    })
  })
})

describe('recognition', () => {
  const code = 'INF-101'

  it('stores cleaned details and explains what is still missing', () => {
    let plan = setRecognition(planFor(), code, {
      status: 'requested',
      institution: '  Universidad de Granada ',
      originalTitle: '',
      originalCredits: 6,
    })
    expect(plan.modules.find((module) => module.code === code)?.recognition).toEqual({
      status: 'requested',
      institution: 'Universidad de Granada',
      originalCredits: 6,
    })
    expect(planSchema.safeParse(plan).success).toBe(true)
    expect(validatePlan(plan)).toContainEqual({
      kind: 'recognition_pending',
      severity: 'info',
      code,
      status: 'requested',
    })

    plan = setRecognition(plan, code, { status: 'approved' })
    expect(validatePlan(plan)).toContainEqual({
      kind: 'recognition_without_result',
      severity: 'warning',
      code,
    })
    plan = setModuleResult(plan, code, { kind: 'graded', grade: 1.7 })
    expect(kinds(plan)).not.toContain('recognition_without_result')

    const rejected = setRecognition(planFor(), code, { status: 'rejected' })
    expect(validatePlan(rejected)).toContainEqual({ kind: 'recognition_rejected', severity: 'warning', code })

    expect(
      setRecognition(plan, code, null).modules.find((module) => module.code === code),
    ).not.toHaveProperty('recognition')
    expect(() => setRecognition(plan, code, { status: 'approved', originalCredits: 0.3 })).toThrow(PlanError)
  })

  it('survives a programme update and never leaves the plan through a share link', () => {
    const plan = setRecognition(planFor(), code, { status: 'approved', institution: 'TU Wien' })
    expect(
      applyPresetUpdate(plan, example).modules.find((module) => module.code === code)?.recognition,
    ).toEqual({
      status: 'approved',
      institution: 'TU Wien',
    })
    expect(JSON.stringify(toSharedPlan(plan))).not.toContain('TU Wien')
  })
})

describe('dependent modules', () => {
  it('lists the modules that need a module as a prerequisite', () => {
    const plan = planFor()
    expect(dependentModules(plan, 'INF-101').map((module) => module.code)).toContain('INF-102')
    expect(dependentModules(plan, 'INF-102').map((module) => module.code)).not.toContain('INF-101')
  })
})

describe('graduation forecast', () => {
  it('ends with the last planned semester and counts leave semesters out', () => {
    const plan = planFor(luh)
    const forecast = graduationForecast(plan)
    const last = plan.semesters.findLastIndex((semester) => semester.moduleCodes.length > 0)
    expect(forecast.planned).toMatchObject({
      index: last,
      term: addTerms(plan.startTerm, last),
      subjectSemesters: last + 1,
      overStandard: Math.max(0, last + 1 - plan.preset.standardSemesters),
    })
    expect(forecast.requiredCredits).toBe(plan.preset.totalCredits)
    expect(forecast.missingCredits).toBe(
      Math.max(0, forecast.requiredCredits - forecast.earnedCredits - forecast.plannedCredits),
    )

    const withLeave = setSemesterKind(plan, 's1', 'leave')
    expect(graduationForecast(withLeave).planned?.subjectSemesters).toBe(last)
    const partTime = setSemesterKind(plan, 's2', 'part_time')
    expect(graduationForecast(partTime).planned?.partTimeSemesters).toBe(1)
  })

  it('extrapolates the pace of the semesters so far', () => {
    const plan = passSemester(planFor(luh), 0)
    const earned = summarizePlan(plan).credits.earned
    expect(earned).toBeGreaterThan(0)

    expect(graduationForecast(plan).atPace).toBeNull()
    const forecast = graduationForecast(plan, { currentSemesterIndex: 2 })
    // One semester passed in two: half the credits per semester.
    expect(forecast.atPace?.creditsPerSemester).toBe(earned / 2)
    const needed = Math.ceil((plan.preset.totalCredits - earned) / (earned / 2))
    expect(forecast.atPace?.index).toBe(2 + needed - 1)
  })
})

describe('plan suggestion', () => {
  const capacity = 30

  const checkSuggestion = (before: Plan, after: Plan, from: number, target = capacity) => {
    expect(planSchema.safeParse(after).success).toBe(true)
    // Nothing the suggestion itself decides breaks a planning rule.
    const introduced = validatePlan(after).filter(
      (issue) =>
        ['wrong_term', 'missing_prerequisite', 'not_enough_credits'].includes(issue.kind) &&
        !validatePlan(before).some((old) => JSON.stringify(old) === JSON.stringify(issue)),
    )
    expect(introduced).toEqual([])
    after.semesters.forEach((semester, index) => {
      expect(semester).toEqual(index < from ? before.semesters[index] : expect.anything())
      // Passed modules carry no workload any more.
      const modules = semester.moduleCodes
        .map((code) => after.modules.find((module) => module.code === code))
        .filter((module) => module !== undefined && !isModulePassed(module, after.rules))
      const halves = modules.reduce((sum, module) => sum + toHalves(module?.credits ?? 0), 0)
      if (index >= from && modules.length > 1) expect(halves / 2).toBeLessThanOrEqual(target)
    })
  }

  it('spreads a real programme within the credit target and keeps every rule', () => {
    const plan = planFor(luh)
    const { plan: suggested, unplaced } = suggestPlan(plan, { fromSemesterIndex: 0, includeUnplanned: true })
    checkSuggestion(plan, suggested, 0)
    expect(unplaced).toEqual([])
    // Required modules without a recommended semester are placed; electives and choices stay unplanned.
    expect(suggested.backlog.length).toBeLessThanOrEqual(plan.backlog.length)
  })

  it('needs more semesters with a lower target and leaves earlier semesters and passed modules alone', () => {
    // Semester 1 is over; semester 3 was passed early, so its modules must stay where they are.
    const plan = passSemester(passSemester(planFor(luh), 0), 2)
    const passedEarly = plan.semesters[2]?.moduleCodes ?? []
    const { plan: suggested } = suggestPlan(plan, { fromSemesterIndex: 1, creditsPerSemester: 15 })
    checkSuggestion(plan, suggested, 1, 15)
    expect(suggested.semesters.length).toBeGreaterThan(plan.semesters.length)
    expect(suggested.semesters[0]).toEqual(plan.semesters[0])
    expect(suggested.semesters[2]?.moduleCodes).toEqual(expect.arrayContaining(passedEarly))
  })

  it('places a module after its prerequisite, wherever that one is', () => {
    let plan = planFor()
    plan = moveModule(plan, 'INF-101', 's3')
    plan = moveModule(plan, 'INF-102', 's1')
    const { plan: suggested, moved } = suggestPlan(plan, { fromSemesterIndex: 0 })
    const indexOf = (code: string) =>
      suggested.semesters.findIndex((semester) => semester.moduleCodes.includes(code))
    expect(indexOf('INF-102')).toBeGreaterThan(indexOf('INF-101'))
    expect(moved).toContain('INF-102')
    checkSuggestion(plan, suggested, 0)
  })

  it('keeps leave semesters empty and fills part-time semesters halfway', () => {
    let plan = planFor(luh)
    plan = setSemesterKind(plan, 's2', 'leave')
    plan = setSemesterKind(plan, 's3', 'part_time')
    const { plan: suggested } = suggestPlan(plan, { fromSemesterIndex: 0 })
    expect(suggested.semesters[1]?.moduleCodes).toEqual([])
    const partTime = suggested.semesters[2]?.moduleCodes ?? []
    const halves = partTime.reduce(
      (sum, code) => sum + toHalves(suggested.modules.find((module) => module.code === code)?.credits ?? 0),
      0,
    )
    if (partTime.length > 1) expect(halves / 2).toBeLessThanOrEqual(15)
  })
})
