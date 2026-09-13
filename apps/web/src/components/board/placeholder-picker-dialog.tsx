import { choiceAreas, formatTerm, type Plan, type PlanModule, type PlanSummary } from '@study-plan/shared'
import { Search } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLocale } from '../../i18n/index.ts'
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
  const visible = options.filter((module) => moduleMatchesQuery(module, query, showCode))

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
          {options.length === 0 ? t('picker.noneLeft') : t('picker.noMatch', { query: query.trim() })}
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
