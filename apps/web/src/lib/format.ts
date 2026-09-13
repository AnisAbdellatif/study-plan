import type { RoundingSpec } from '@study-plan/shared'

const creditFormat = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

export const formatCredits = (credits: number): string => creditFormat.format(credits)

/** Engine results are exact decimal strings like "1.6"; this only swaps in the German decimal comma. */
export const formatGradeString = (value: string): string => value.replace('.', ',')

/** Allowed grade values always have one decimal, so toFixed(1) is exact here. */
export const formatGrade = (grade: number): string => formatGradeString(grade.toFixed(1))

export const DEGREE_LABEL = { bsc: 'B.Sc.', msc: 'M.Sc.' } as const

export function describeRounding(spec: RoundingSpec): string {
  switch (spec.mode) {
    case 'truncate':
      return spec.precision === 1
        ? 'nach der ersten Nachkommastelle abgeschnitten'
        : 'nach zwei Nachkommastellen abgeschnitten'
    case 'round_half_up':
      return spec.precision === 1 ? 'auf eine Nachkommastelle gerundet' : 'auf zwei Nachkommastellen gerundet'
    case 'round_to_nearest_allowed_ties_better':
      return 'auf die nächste zulässige Note gerundet'
  }
}

export const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
