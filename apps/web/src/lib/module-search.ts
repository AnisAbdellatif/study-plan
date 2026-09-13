import type { PlanModule } from '@study-plan/shared'

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

/** Lower case, umlauts spelled out, accents removed: "Schlüssel" and "schluessel" compare equal. */
export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => UMLAUTS[char] ?? char)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
}

/**
 * True when every word of the query appears in the module's name, category, English title or, when codes are
 * shown, its code. Custom modules match their shown label (`customLabel`) instead of the internal category. An
 * empty query matches everything.
 */
export function moduleMatchesQuery(
  module: PlanModule,
  query: string,
  includeCode: boolean,
  customLabel = '',
): boolean {
  const words = normalizeSearchText(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const category = module.custom ? customLabel : module.category
  const haystack = normalizeSearchText(
    [
      module.name,
      category,
      module.details?.englishName ?? '',
      includeCode && !module.custom ? module.code : '',
    ].join(' '),
  )
  return words.every((word) => haystack.includes(word))
}
