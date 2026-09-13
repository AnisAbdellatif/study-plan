import { computeOverall, type OverallResult } from '../engine/compute.ts'
import { isModulePassed } from '../engine/progress.ts'
import { toHalves } from '../engine/units.ts'
import type { Plan } from './plan.ts'
import { addTerms, formatTerm, type Term } from './terms.ts'

/** Default per-semester load warning bounds in credits. Presets will be able to override them. */
export const LOAD_THRESHOLDS = { low: 20, high: 36 } as const

export type SemesterLoad = 'empty' | 'low' | 'ok' | 'high'

export interface SemesterSummary {
  id: string
  number: number
  term: Term
  label: string
  credits: number
  load: SemesterLoad
}

export interface AreaSummary {
  id: string
  name: string
  minCredits: number
  maxCredits?: number
  earnedCredits: number
  plannedCredits: number
}

export interface PlanSummary {
  overall: OverallResult
  credits: { earned: number; planned: number; required: number }
  semesters: SemesterSummary[]
  areas: AreaSummary[]
}

const loadFor = (credits: number): SemesterLoad => {
  if (credits === 0) return 'empty'
  if (credits < LOAD_THRESHOLDS.low) return 'low'
  if (credits > LOAD_THRESHOLDS.high) return 'high'
  return 'ok'
}

export function summarizePlan(plan: Plan): PlanSummary {
  const creditHalves = new Map(plan.modules.map((m) => [m.code, toHalves(m.credits)]))
  const passed = new Set(plan.modules.filter((m) => isModulePassed(m, plan.rules)).map((m) => m.code))
  const placed = new Set(plan.semesters.flatMap((s) => s.moduleCodes))
  const sum = (codes: Iterable<string>) => {
    let halves = 0
    for (const code of codes) halves += creditHalves.get(code) ?? 0
    return halves / 2
  }

  return {
    overall: computeOverall(plan.rules, plan.modules),
    credits: { earned: sum(passed), planned: sum(placed), required: plan.preset.totalCredits },
    semesters: plan.semesters.map((semester, index) => {
      const term = addTerms(plan.startTerm, index)
      const credits = sum(semester.moduleCodes)
      return {
        id: semester.id,
        number: index + 1,
        term,
        label: formatTerm(term),
        credits,
        load: loadFor(credits),
      }
    }),
    areas: plan.areas.map((area) => ({
      id: area.id,
      name: area.name,
      minCredits: area.minCredits,
      maxCredits: area.maxCredits,
      earnedCredits: sum(area.moduleCodes.filter((code) => passed.has(code))),
      plannedCredits: sum(area.moduleCodes.filter((code) => placed.has(code))),
    })),
  }
}
