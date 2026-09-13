import type { RoundingSpec } from '@study-plan/shared'
import i18n, { currentIntlLocale, currentLocale } from '../i18n/index.ts'

const formatters = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>()

function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat>(
  name: string,
  create: (locale: string) => T,
): T {
  const locale = currentIntlLocale()
  const key = `${locale}|${name}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = create(locale)
    formatters.set(key, formatter)
  }
  return formatter as T
}

export const formatCredits = (credits: number): string =>
  cached('credits', (locale) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })).format(credits)

/** Engine results are exact decimal strings like "1.6"; German uses a decimal comma. */
export const formatGradeString = (value: string): string =>
  currentLocale() === 'de' ? value.replace('.', ',') : value

/** Allowed grade values always have one decimal, so toFixed(1) is exact here. */
export const formatGrade = (grade: number): string => formatGradeString(grade.toFixed(1))

export const DEGREE_LABEL = { bsc: 'B.Sc.', msc: 'M.Sc.' } as const

export function describeRounding(spec: RoundingSpec): string {
  switch (spec.mode) {
    case 'truncate':
      return i18n.t(spec.precision === 1 ? 'rounding.truncateOne' : 'rounding.truncateTwo')
    case 'round_half_up':
      return i18n.t(spec.precision === 1 ? 'rounding.roundHalfUpOne' : 'rounding.roundHalfUpTwo')
    case 'round_to_nearest_allowed_ties_better':
      return i18n.t('rounding.nearestAllowed')
  }
}

export const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const calendarDate = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`)

/** "2027-02-15" -> "15.02." or "15 Feb". Calendar dates are formatted in UTC so the day never shifts. */
export const formatShortDate = (isoDate: string): string =>
  cached('shortDate', (locale) =>
    locale === 'de-DE'
      ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
      : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  ).format(calendarDate(isoDate))

/** "2027-02-15" -> "Mo., 15.02.2027" or "Mon 15 Feb 2027" */
export const formatLongDate = (isoDate: string): string =>
  cached('longDate', (locale) =>
    locale === 'de-DE'
      ? new Intl.DateTimeFormat(locale, {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          timeZone: 'UTC',
        })
      : new Intl.DateTimeFormat(locale, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }),
  ).format(calendarDate(isoDate))

export const formatRelativeDays = (days: number): string => {
  if (days === 0) return i18n.t('relativeDays.today')
  if (days === 1) return i18n.t('relativeDays.tomorrow')
  return i18n.t('relativeDays.inDays', { count: days })
}
