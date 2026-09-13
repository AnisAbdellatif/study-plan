import { EllipsisVertical } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn.ts'
import { useDraggableModule } from '../../lib/dnd.ts'
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

export interface PlaceholderCardProps {
  id: string
  areaName: string
  /** Estimated credits. */
  credits: number
  columnId: string | null
  index: number
  creditLabel: string
  /** Semesters only: moving a placeholder out of the semesters removes it, which has its own menu entry. */
  destinations: readonly Destination[]
  actions: BoardActions
}

/** A slot for a module still to be chosen from an area. Drags like a module card; dropping it on the backlog removes it. */
export function PlaceholderCard({
  id,
  areaName,
  credits,
  columnId,
  index,
  creditLabel,
  destinations,
  actions,
}: PlaceholderCardProps) {
  const { t } = useTranslation('board')
  const ref = useRef<HTMLLIElement>(null)
  const { isDragging, closestEdge } = useDraggableModule(ref, { code: id, columnId, index })

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users choose with the button on the card
    <li
      ref={ref}
      data-testid="placeholder-card"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a, input, [role="menu"], [role="menuitem"]'))
          return
        actions.onChoose(id)
      }}
      className={cn(
        'relative cursor-grab rounded-lg border-2 border-dashed border-zinc-400 bg-white/50 p-2.5 active:cursor-grabbing dark:border-zinc-600 dark:bg-zinc-950/40',
        isDragging && 'opacity-40',
      )}
    >
      {closestEdge ? (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-indigo-500',
            closestEdge === 'top' ? '-top-[5px]' : '-bottom-[5px]',
          )}
        />
      ) : null}
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{t('placeholder.label')}</p>
          <h3 className="text-sm leading-snug font-medium">{areaName}</h3>
          <p className="mt-1 text-xs text-zinc-600 tabular-nums dark:text-zinc-400">
            {t('placeholder.estimate', { credits: formatCredits(credits), label: creditLabel })}
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2 print:hidden"
            onClick={() => actions.onChoose(id)}
          >
            {t('placeholder.choose')}
          </Button>
        </div>
        <MenuRoot>
          <MenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="-mt-1 -mr-1 print:hidden"
                aria-label={t('placeholder.actionsFor', { area: areaName })}
              />
            }
          >
            <EllipsisVertical aria-hidden className="size-4" />
          </MenuTrigger>
          <MenuContent>
            <MenuItem onClick={() => actions.onChoose(id)}>{t('placeholder.choose')}</MenuItem>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>{t('card.moveTo')}</MenuGroupLabel>
              {destinations.map((destination) => (
                <MenuItem
                  key={destination.id ?? 'backlog'}
                  disabled={destination.id === columnId}
                  onClick={() => actions.onMove(id, destination.id)}
                >
                  {destination.title}
                </MenuItem>
              ))}
            </MenuGroup>
            <MenuSeparator />
            <MenuItem
              className="text-red-700 dark:text-red-400"
              onClick={() => actions.onRemovePlaceholder(id)}
            >
              {t('placeholder.remove')}
            </MenuItem>
          </MenuContent>
        </MenuRoot>
      </div>
    </li>
  )
}
