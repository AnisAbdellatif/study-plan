import { choiceAreas, formatTerm, type Plan, type PlanModule, type PlanSummary } from '@study-plan/shared'
import { Search } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLocale } from '../../i18n/index.ts'
import { examKindLabels } from '../../lib/exam-kinds.ts'
import { formatCredits } from '../../lib/format.ts'
import { moduleMatchesQuery } from '../../lib/module-search.ts'
import { Button } from '../ui/button.tsx'
import { Dialog } from '../ui/dialog.tsx'

export type PickerTarget = { mode: 'choose'; placeholderId: string } | { mode: 'browse'; areaId: string }

export interface PlaceholderPickerDialogProps {
  plan: Plan
  summary: PlanSummary
  target: PickerTarget | null
  onChoose: (placeholderId: string, code: string) => void
  onClose: () => void
}

function OptionFacts({
  module,
  creditLabel,
  season,
}: {
  module: PlanModule
  creditLabel: string
  /** Season of the placeholder's semester; null when browsing. */
  season: 'winter' | 'summer' | null
}) {
  const { t } = useTranslation('board')
  const onlyIn = module.offering === 'winter' || module.offering === 'summer' ? module.offering : null
  // When choosing, only a season that does not match the placeholder's semester is worth a warning.
  const warn = season !== null && onlyIn !== null && onlyIn !== season
  return (
    <>
      <span className="block text-sm leading-snug font-medium">{module.name}</span>
      {module.details?.englishName ? (
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">{module.details.englishName}</span>
      ) : null}
      <span className="mt-0.5 flex flex-wrap gap-x-1.5 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="tabular-nums">
          {formatCredits(module.credits)} {creditLabel}
        </span>
        {examKindLabels(module).length > 0 ? <span>· {examKindLabels(module).join(' / ')}</span> : null}
        {warn && onlyIn !== null ? (
          <span className="font-medium text-amber-700 dark:text-amber-400">
            · {t(`picker.offeredOnly.${onlyIn}`)}
          </span>
        ) : season === null && onlyIn !== null ? (
          <span>· {t(`picker.offeredOnly.${onlyIn}`)}</span>
        ) : module.offering === 'irregular' ? (
          <span>· {t('picker.irregular')}</span>
        ) : null}
      </span>
    </>
  )
}

const SEASON_FILTERS = ['all', 'summer', 'winter'] as const
type SeasonFilter = (typeof SEASON_FILTERS)[number]

/** A module can be taken in a season when it is offered only then or every semester. */
const offeredIn = (module: PlanModule, filter: SeasonFilter): boolean =>
  filter === 'all' || module.offering === filter || module.offering === 'both'

function PickerBody({
  options,
  creditLabel,
  showCode,
  season,
  onPick,
  onClose,
}: {
  options: readonly PlanModule[]
  creditLabel: string
  showCode: boolean
  season: 'winter' | 'summer' | null
  /** Null in browse mode. */
  onPick: ((code: string) => void) | null
  onClose: () => void
}) {
  const { t } = useTranslation(['board', 'common'])
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>('all')
  const filterName = useId()
  const matching = options.filter((module) => moduleMatchesQuery(module, query, showCode))
  const visible = matching.filter((module) => offeredIn(module, seasonFilter))

  return (
    <div>
      {options.length > 0 ? (
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            {t('picker.searchLabel')}
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-500"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            placeholder={t('picker.searchPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 w-full rounded-lg bg-white pr-3 pl-8 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700"
          />
        </div>
      ) : null}
      {options.length > 0 ? (
        // Native radios: arrow keys move between the filters; the label is the visible chip.
        <fieldset className="mt-2">
          <legend className="sr-only">{t('picker.offeringFilter')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {SEASON_FILTERS.map((filter) => {
              const count = matching.filter((module) => offeredIn(module, filter)).length
              return (
                <label
                  key={filter}
                  className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white px-3 text-sm ring-1 ring-zinc-300 ring-inset has-[:checked]:bg-indigo-600 has-[:checked]:text-white has-[:checked]:ring-indigo-600 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-indigo-500 sm:h-8 dark:bg-zinc-950 dark:ring-zinc-700 dark:has-[:checked]:bg-indigo-500 dark:has-[:checked]:ring-indigo-500"
                >
                  <input
                    type="radio"
                    name={filterName}
                    value={filter}
                    checked={seasonFilter === filter}
                    onChange={() => setSeasonFilter(filter)}
                    className="sr-only"
                  />
                  {t(`picker.filters.${filter}`)}
                  <span className="text-xs tabular-nums opacity-80">{count}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : null}
      {visible.length > 0 ? (
        <ul aria-label={t('picker.options')} className="mt-3 max-h-[50dvh] space-y-1.5 overflow-y-auto p-0.5">
          {visible.map((module) => (
            <li key={module.code}>
              {onPick ? (
                <button
                  type="button"
                  onClick={() => onPick(module.code)}
                  className="w-full rounded-lg bg-white px-3 py-2 text-left ring-1 ring-zinc-200 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-800 dark:hover:bg-indigo-950/40"
                >
                  <OptionFacts module={module} creditLabel={creditLabel} season={season} />
                </button>
              ) : (
                <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
                  <OptionFacts module={module} creditLabel={creditLabel} season={null} />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-lg border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
          {options.length === 0
            ? t('picker.noneLeft')
            : seasonFilter !== 'all' && matching.length > 0
              ? t('picker.noSeasonMatch', { season: t(`picker.filters.${seasonFilter}`) })
              : t('picker.noMatch', { query: query.trim() })}
        </p>
      )}
      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          {t('common:actions.close')}
        </Button>
      </div>
    </div>
  )
}

/** Lists the modules still available in an area, to replace a placeholder or just to look. */
export function PlaceholderPickerDialog({
  plan,
  summary,
  target,
  onChoose,
  onClose,
}: PlaceholderPickerDialogProps) {
  const { t } = useTranslation('board')
  const locale = currentLocale()
  const choices = useMemo(() => choiceAreas(plan), [plan])
  const label = plan.preset.creditLabel

  const placeholderId = target?.mode === 'choose' ? target.placeholderId : null
  const areaId =
    target?.mode === 'browse'
      ? target.areaId
      : plan.placeholders?.find((placeholder) => placeholder.id === placeholderId)?.areaId
  const choice = areaId === undefined ? undefined : choices.find((item) => item.area.id === areaId)
  const semesterIndex =
    placeholderId === null
      ? -1
      : plan.semesters.findIndex((semester) => semester.moduleCodes.includes(placeholderId))
  const term = summary.semesters[semesterIndex]?.term
  const open = choice !== undefined && (target?.mode === 'browse' || term !== undefined)

  let title = ''
  let description: string | undefined
  if (choice) {
    if (placeholderId !== null && term) {
      title = t('picker.title', { area: choice.area.name })
      description = t('picker.forSemester', {
        number: semesterIndex + 1,
        term: formatTerm(term, locale),
        credits: formatCredits(choice.placeholderCredits),
        label,
      })
    } else {
      title = t('picker.browseTitle', { area: choice.area.name })
      description = t('picker.browseDescription', { count: choice.available.length })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={title}
      description={description}
    >
      {choice ? (
        <PickerBody
          key={placeholderId ?? choice.area.id}
          options={choice.available}
          creditLabel={label}
          showCode={plan.preset.codesAreOfficial ?? true}
          season={term?.season ?? null}
          onPick={placeholderId === null ? null : (code) => onChoose(placeholderId, code)}
          onClose={onClose}
        />
      ) : null}
    </Dialog>
  )
}
