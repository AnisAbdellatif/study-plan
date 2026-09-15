import type { AreaChoiceStatus, ChoiceArea, Plan, PresetArea } from '@study-plan/shared'
import { Check, EllipsisVertical } from 'lucide-react'
import { useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { areaTone } from '../../lib/area-colors.ts'
import { cn } from '../../lib/cn.ts'
import { useDraggableAreaSlot } from '../../lib/dnd.ts'
import { formatCredits } from '../../lib/format.ts'
import { Button } from '../ui/button.tsx'
import {
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from '../ui/menu.tsx'
import type { BoardActions } from './board-actions.ts'
import type { Destination } from './module-card.tsx'

/** For an area of an area choice: whether it is the picked one. */
interface Pick {
  status: AreaChoiceStatus
  picked: boolean
}

interface TileProps {
  choice: ChoiceArea
  creditLabel: string
  /** Semesters only. */
  destinations: readonly Destination[]
  actions: BoardActions
  /** The plan's areas, for the tile colour. */
  areas: Plan['areas']
  pick?: Pick
}

/** "5 LP gewählt · 2 Platzhalter (≈10 LP) · Ziel 10–20 LP", with only the parts that apply. */
function useProgressText(choice: ChoiceArea, label: string): string {
  const { t } = useTranslation('board')
  const { area } = choice
  const parts: string[] = []
  if (choice.chosenCredits > 0)
    parts.push(t('choices.chosen', { credits: formatCredits(choice.chosenCredits), label }))
  const count = choice.placeholders.length
  if (count > 0) {
    parts.push(
      t('choices.placeholders', {
        count,
        credits: formatCredits(count * choice.placeholderCredits),
        label,
      }),
    )
  }
  const min = formatCredits(area.minCredits)
  if (area.maxCredits === undefined || area.maxCredits === area.minCredits) {
    if (area.minCredits > 0) parts.push(t('choices.targetMin', { min, label }))
  } else if (area.minCredits > 0) {
    parts.push(t('choices.targetRange', { min, max: formatCredits(area.maxCredits), label }))
  } else {
    parts.push(t('choices.targetMax', { max: formatCredits(area.maxCredits), label }))
  }
  return parts.join(' · ')
}

function PickedBadge() {
  const { t } = useTranslation('board')
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] leading-none font-medium text-white">
      <Check aria-hidden className="size-3" />
      {t('areaChoice.picked')}
    </span>
  )
}

function AreaHeading({ area, areas, picked }: { area: PresetArea; areas: Plan['areas']; picked: boolean }) {
  const tone = areaTone({ areas }, area.id)
  return (
    <h3 className="flex flex-wrap items-center gap-1.5 text-sm leading-snug font-medium">
      <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', tone.dot)} />
      {area.name}
      {picked ? <PickedBadge /> : null}
    </h3>
  )
}

function ChoiceAreaTile({ choice, creditLabel, destinations, actions, areas, pick }: TileProps) {
  const { t } = useTranslation('board')
  const tone = areaTone({ areas }, choice.area.id)
  const ref = useRef<HTMLLIElement>(null)
  const { isDragging } = useDraggableAreaSlot(ref, choice.area.id)
  const progress = useProgressText(choice, creditLabel)
  const available = choice.available.length
  const choose = (areaId: string | null) => pick && actions.onChooseArea(pick.status.choice.id, areaId)

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users open the options from the tile menu
    <li
      ref={ref}
      data-testid="choice-area-tile"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a, input, [role="menu"], [role="menuitem"]'))
          return
        actions.onBrowseArea(choice.area.id)
      }}
      className={cn(
        'relative cursor-grab rounded-lg border-l-4 p-2.5 ring-1 ring-zinc-900/10 active:cursor-grabbing dark:ring-white/10',
        tone.stripe,
        tone.soft,
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <AreaHeading area={choice.area} areas={areas} picked={pick?.picked === true} />
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{progress}</p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {available > 0 ? t('choices.available', { count: available }) : t('choices.availableNone')}
          </p>
          {pick && !pick.picked ? (
            <Button
              size="sm"
              className="mt-2"
              aria-label={t('areaChoice.pickLabel', {
                area: choice.area.name,
                choice: pick.status.choice.name,
              })}
              onClick={() => choose(choice.area.id)}
            >
              {t('areaChoice.pick')}
            </Button>
          ) : null}
        </div>
        <MenuRoot>
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="-mt-1 -mr-1 print:hidden"
                aria-label={t('choices.actionsFor', { area: choice.area.name })}
              />
            }
          >
            <EllipsisVertical aria-hidden className="size-4" />
          </MenuTrigger>
          <MenuContent>
            <MenuGroup>
              <MenuGroupLabel>{t('choices.placeIn')}</MenuGroupLabel>
              {destinations.map(({ id, title }) =>
                id === null ? null : (
                  <MenuItem key={id} onClick={() => actions.onPlaceArea(choice.area.id, id)}>
                    {title}
                  </MenuItem>
                ),
              )}
            </MenuGroup>
            <MenuSeparator />
            <MenuItem onClick={() => actions.onBrowseArea(choice.area.id)}>{t('choices.browse')}</MenuItem>
            {pick ? (
              <MenuItem onClick={() => choose(pick.picked ? null : choice.area.id)}>
                {pick.picked ? t('areaChoice.clear') : t('areaChoice.pickMenu')}
              </MenuItem>
            ) : null}
          </MenuContent>
        </MenuRoot>
      </div>
    </li>
  )
}

/** The picked area when all of its modules are compulsory, so there is nothing to choose or drag. */
function PickedAreaTile({
  area,
  status,
  actions,
  areas,
}: {
  area: PresetArea
  status: AreaChoiceStatus
  actions: BoardActions
  areas: Plan['areas']
}) {
  const { t } = useTranslation('board')
  const tone = areaTone({ areas }, area.id)
  return (
    <li
      data-testid="choice-area-tile"
      className={cn(
        'rounded-lg border-l-4 p-2.5 ring-1 ring-zinc-900/10 dark:ring-white/10',
        tone.stripe,
        tone.soft,
      )}
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <AreaHeading area={area} areas={areas} picked />
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{t('areaChoice.noOptions')}</p>
        </div>
        <MenuRoot>
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="-mt-1 -mr-1 print:hidden"
                aria-label={t('choices.actionsFor', { area: area.name })}
              />
            }
          >
            <EllipsisVertical aria-hidden className="size-4" />
          </MenuTrigger>
          <MenuContent>
            <MenuItem onClick={() => actions.onChooseArea(status.choice.id, null)}>
              {t('areaChoice.clear')}
            </MenuItem>
          </MenuContent>
        </MenuRoot>
      </div>
    </li>
  )
}

interface GroupProps {
  status: AreaChoiceStatus
  byArea: ReadonlyMap<string, ChoiceArea>
  creditLabel: string
  destinations: readonly Destination[]
  actions: BoardActions
  areas: Plan['areas']
}

/** One area choice such as the Nebenfach: every area to pick from, or only the picked one. */
function AreaChoiceGroup({ status, byArea, creditLabel, destinations, actions, areas }: GroupProps) {
  const { t } = useTranslation('board')
  const headingId = useId()
  const { choice, chosenAreaId } = status
  // Once picked, the other areas no longer apply, so only the picked one stays.
  const shown = chosenAreaId === null ? choice.areaIds : [chosenAreaId]
  return (
    <section aria-labelledby={headingId} className="mt-3">
      <p id={headingId} className="px-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {choice.name}
      </p>
      <p className="px-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        {chosenAreaId === null ? t('areaChoice.hint') : t('areaChoice.pickedHint')}
      </p>
      <ul aria-labelledby={headingId} className="mt-1.5 flex flex-col gap-2">
        {shown.map((areaId) => {
          const picked = areaId === chosenAreaId
          const option = byArea.get(areaId)
          if (option) {
            return (
              <ChoiceAreaTile
                key={areaId}
                choice={option}
                creditLabel={creditLabel}
                destinations={destinations}
                actions={actions}
                areas={areas}
                pick={{ status, picked }}
              />
            )
          }
          const area = picked ? areas.find((item) => item.id === areaId) : undefined
          return area ? (
            <PickedAreaTile key={areaId} area={area} status={status} actions={actions} areas={areas} />
          ) : null
        })}
      </ul>
    </section>
  )
}

export interface ChoiceAreaTilesProps {
  choices: readonly ChoiceArea[]
  /** Area choices such as the Nebenfach; their areas are grouped under the choice instead of listed on their own. */
  areaChoices: readonly AreaChoiceStatus[]
  creditLabel: string
  destinations: readonly Destination[]
  actions: BoardActions
  areas: Plan['areas']
}

/** Tiles for the backlog: one per area with modules to choose from. Drag one onto a semester to plan a slot. */
export function ChoiceAreaTiles({
  choices,
  areaChoices,
  creditLabel,
  destinations,
  actions,
  areas,
}: ChoiceAreaTilesProps) {
  const { t } = useTranslation('board')
  const headingId = useId()
  const grouped = new Set(areaChoices.flatMap((status) => status.choice.areaIds))
  const standalone = choices.filter((choice) => !grouped.has(choice.area.id))
  const byArea = new Map(choices.map((choice) => [choice.area.id, choice]))
  return (
    // The column is only as tall as its content (capped at the screen), so a percentage max-height never applies
    // here. A screen-based cap keeps many areas from pushing the module list out of the column; phones scroll the page.
    <div className="shrink-0 px-1 pb-2 sm:max-h-[40dvh] sm:overflow-y-auto print:hidden">
      <p id={headingId} className="px-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {t('choices.title')}
      </p>
      <p className="px-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{t('choices.hint')}</p>
      {standalone.length > 0 ? (
        <ul aria-labelledby={headingId} className="mt-1.5 flex flex-col gap-2">
          {standalone.map((choice) => (
            <ChoiceAreaTile
              key={choice.area.id}
              choice={choice}
              creditLabel={creditLabel}
              destinations={destinations}
              actions={actions}
              areas={areas}
            />
          ))}
        </ul>
      ) : null}
      {areaChoices.map((status) => (
        <AreaChoiceGroup
          key={status.choice.id}
          status={status}
          byArea={byArea}
          creditLabel={creditLabel}
          destinations={destinations}
          actions={actions}
          areas={areas}
        />
      ))}
    </div>
  )
}
