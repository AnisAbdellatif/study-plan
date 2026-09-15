import { addTerms, formatTerm, type Term, termAt } from '@study-plan/shared'
import { useId, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLocale } from '../i18n/index.ts'

/** A form field without outer spacing, for fields that sit in a row next to other controls. */
const fieldBaseClass =
  'h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700'
/** A form field below its label. */
export const fieldClass = `mt-1 ${fieldBaseClass}`

export interface StartTermFieldsProps {
  value: Term
  onChange: (term: Term) => void
  /** When known, the hint also names the term of the last standard semester. */
  standardSemesters?: number
}

/** Season radio, year select and a hint naming the first (and last) semester. */
export function StartTermFields({ value, onChange, standardSemesters }: StartTermFieldsProps) {
  const { t } = useTranslation('start')
  const locale = currentLocale()
  const yearId = useId()
  const currentYear = useMemo(() => termAt(new Date()).year, [])
  // A plan that started earlier than the usual range keeps its year selectable.
  const years = [
    ...new Set([...Array.from({ length: 9 }, (_, index) => currentYear - 7 + index), value.year]),
  ].sort((a, b) => a - b)

  return (
    <fieldset>
      <legend className="text-sm font-medium">{t('startTerm')}</legend>
      {/* Phones stack the year under the seasons, so "Sommersemester" never wraps inside its segment. */}
      <div className="mt-1 grid gap-2 sm:grid-cols-[1fr_auto] sm:gap-3">
        <div className="flex rounded-lg p-1 ring-1 ring-zinc-300 ring-inset dark:ring-zinc-700">
          {(['winter', 'summer'] as const).map((season) => (
            <label
              key={season}
              className="flex h-8 flex-1 cursor-pointer items-center justify-center rounded-md px-2 text-sm whitespace-nowrap has-[:checked]:bg-indigo-600 has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-indigo-500"
            >
              <input
                type="radio"
                name="season"
                value={season}
                checked={value.season === season}
                onChange={() => onChange({ ...value, season })}
                className="sr-only"
              />
              {season === 'winter' ? t('winter') : t('summer')}
            </label>
          ))}
        </div>
        <div>
          <label htmlFor={yearId} className="sr-only">
            {t('year')}
          </label>
          <select
            id={yearId}
            value={value.year}
            onChange={(event) => onChange({ ...value, year: Number(event.target.value) })}
            // No top margin: a taller select would stretch the season toggle and leave a gap under its pill.
            className={fieldBaseClass}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
        {t('semesterTerm', { number: 1, term: formatTerm(value, locale) })}
        {standardSemesters
          ? ` · ${t('semesterTerm', {
              number: standardSemesters,
              term: formatTerm(addTerms(value, standardSemesters - 1), locale),
            })}`
          : ''}
      </p>
    </fieldset>
  )
}
