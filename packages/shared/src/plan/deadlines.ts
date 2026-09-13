import { isModulePassed } from '../engine/progress.ts'
import type { Plan } from './plan.ts'

export type DeadlineKind = 'withdrawal' | 'exam'

export interface DeadlineEvent {
  kind: DeadlineKind
  code: string
  moduleName: string
  /** ISO calendar date, YYYY-MM-DD. */
  date: string
}

const DAY_MS = 24 * 60 * 60 * 1000

function parseIsoDate(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new RangeError(`Invalid ISO date "${date}"`)
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

/** Calendar arithmetic in UTC, so time zones and daylight saving never shift a date. */
export const addDays = (date: string, days: number): string =>
  new Date(parseIsoDate(date) + days * DAY_MS).toISOString().slice(0, 10)

export const daysBetween = (from: string, to: string): number =>
  Math.round((parseIsoDate(to) - parseIsoDate(from)) / DAY_MS)

/** The local calendar date of `date` as YYYY-MM-DD. */
export const localIsoDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const KIND_ORDER: Record<DeadlineKind, number> = { withdrawal: 0, exam: 1 }

/**
 * Exam dates the student entered, plus the last day to withdraw when the preset defines a withdrawal period.
 * Passed modules have no deadlines left.
 */
export function planDeadlines(plan: Plan): DeadlineEvent[] {
  const withdrawalDays = plan.preset.withdrawalDaysBeforeExam
  const events: DeadlineEvent[] = []
  for (const module of plan.modules) {
    if (!module.examDate || isModulePassed(module, plan.rules)) continue
    const base = { code: module.code, moduleName: module.name }
    if (withdrawalDays !== undefined) {
      events.push({ ...base, kind: 'withdrawal', date: addDays(module.examDate, -withdrawalDays) })
    }
    events.push({ ...base, kind: 'exam', date: module.examDate })
  }
  return events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.moduleName.localeCompare(b.moduleName),
  )
}

/** Deadlines from `today` up to and including `today + horizonDays`. */
export function upcomingDeadlines(plan: Plan, today: string, horizonDays: number): DeadlineEvent[] {
  const end = addDays(today, horizonDays)
  return planDeadlines(plan).filter((event) => event.date >= today && event.date <= end)
}
