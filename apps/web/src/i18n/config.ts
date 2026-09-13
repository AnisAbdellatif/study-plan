export const LOCALES = ['de', 'en'] as const
export type Locale = (typeof LOCALES)[number]

export const LOCALE_STORAGE_KEY = 'study-plan:locale'

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value)

/** The locale for Intl formatters. British English keeps day-month order and 24-hour times. */
export const intlLocale = (locale: Locale): string => (locale === 'de' ? 'de-DE' : 'en-GB')

/**
 * The saved choice first, then the browser's languages. German-speaking browsers get German,
 * everyone else English.
 */
export function detectLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (isLocale(saved)) return saved
  } catch {
    // Storage can be blocked; fall back to the browser languages.
  }
  const languages =
    typeof navigator === 'undefined'
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language]
  for (const language of languages) {
    const base = language?.toLowerCase().split('-')[0]
    if (isLocale(base)) return base
  }
  return 'en'
}
