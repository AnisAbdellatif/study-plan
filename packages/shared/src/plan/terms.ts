import { z } from 'zod'

export const termSchema = z.object({
  season: z.enum(['winter', 'summer']),
  year: z.number().int().min(1990).max(2100),
})
export type Term = z.infer<typeof termSchema>

/** Summer of year y comes before winter of year y (WS y/y+1 starts in October of y). */
const toIndex = (term: Term): number => term.year * 2 + (term.season === 'winter' ? 1 : 0)

const fromIndex = (index: number): Term => ({
  year: Math.floor(index / 2),
  season: ((index % 2) + 2) % 2 === 1 ? 'winter' : 'summer',
})

/** The term `offset` semesters after `start`. */
export const addTerms = (start: Term, offset: number): Term => fromIndex(toIndex(start) + offset)

/** German "WS 2026/27" and "SS 2027", English "Winter 2026/27" and "Summer 2027". */
export function formatTerm(term: Term, locale: 'de' | 'en' = 'de'): string {
  const winter = `${term.year}/${String((term.year + 1) % 100).padStart(2, '0')}`
  if (locale === 'en') return term.season === 'summer' ? `Summer ${term.year}` : `Winter ${winter}`
  return term.season === 'summer' ? `SS ${term.year}` : `WS ${winter}`
}

/**
 * The term a calendar date falls into, using the university convention:
 * winter term October to March, summer term April to September.
 * Fachhochschulen often shift this by a month; plans only use it to highlight the current semester.
 */
export function termAt(date: Date): Term {
  const month = date.getMonth()
  const year = date.getFullYear()
  if (month >= 9) return { season: 'winter', year }
  if (month >= 3) return { season: 'summer', year }
  return { season: 'winter', year: year - 1 }
}

/** Zero-based semester index of `date` for a plan starting at `start`. Negative before the start. */
export const semesterIndexAt = (start: Term, date: Date): number => toIndex(termAt(date)) - toIndex(start)
