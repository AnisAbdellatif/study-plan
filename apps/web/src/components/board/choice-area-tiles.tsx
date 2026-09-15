import type { ChoiceArea, Plan } from '@study-plan/shared'
import { EllipsisVertical } from 'lucide-react'
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

interface TileProps {
  choice: ChoiceArea
  creditLabel: string
  /** Semesters only. */
  destinations: readonly Destination[]
  actions: BoardActions
  /** The plan's areas, for the tile colour. */
  areas: Plan['areas']
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

function ChoiceAreaTile({ choice, creditLabel, destinations, actions, areas }: TileProps) {
  const { t } = useTranslation('board')
  const tone = areaTone({ areas }, choice.area.id)
  const ref = useRef<HTMLLIElement>(null)
  const { isDragging } = useDraggableAreaSlot(ref, choice.area.id)
  const progress = useProgressText(choice, creditLabel)
  const available = choice.available.length

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
          <h3 className="flex items-center gap-1.5 text-sm leading-snug font-medium">
            <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', tone.dot)} />
            {choice.area.name}
          </h3>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{progress}</p>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {available > 0 ? t('choices.available', { count: available }) : t('choices.availableNone')}
          </p>
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
          </MenuContent>
        </MenuRoot>
      </div>
    </li>
  )
}

export interface ChoiceAreaTilesProps {
  choices: readonly ChoiceArea[]
  creditLabel: string
  destinations: readonly Destination[]
  actions: BoardActions
  areas: Plan['areas']
}

/** Tiles for the backlog: one per area with modules to choose from. Drag one onto a semester to plan a slot. */
export function ChoiceAreaTiles({
  choices,
  creditLabel,
  destinations,
  actions,
  areas,
}: ChoiceAreaTilesProps) {
  const { t } = useTranslation('board')
  const headingId = useId()
  return (
    // The column is only as tall as its content (capped at the screen), so a percentage max-height never applies
    // here. A screen-based cap keeps many areas from pushing the module list out of the column; phones scroll the page.
    <div className="shrink-0 px-1 pb-2 sm:max-h-[40dvh] sm:overflow-y-auto print:hidden">
      <p id={headingId} className="px-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {t('choices.title')}
      </p>
      <p className="px-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{t('choices.hint')}</p>
      <ul aria-labelledby={headingId} className="mt-1.5 flex flex-col gap-2">
        {choices.map((choice) => (
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
    </div>
  )
}
