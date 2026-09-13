import { Check, Search } from 'lucide-react'
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PresetSummary } from '../../lib/api.ts'
import { cn } from '../../lib/cn.ts'
import { filterPresets, presetLabel, presetTitle } from './preset-search.ts'

export interface PresetComboboxProps {
  presets: PresetSummary[]
  selectedId: string | null
  onSelect: (preset: PresetSummary) => void
}

/**
 * A searchable preset list following the ARIA combobox pattern with a listbox popup: focus stays in the input,
 * the arrow keys move the active option (aria-activedescendant), Enter picks it and Escape closes the list.
 */
export function PresetCombobox({ presets, selectedId, onSelect }: PresetComboboxProps) {
  const { t } = useTranslation('start')
  const inputId = useId()
  const listId = useId()
  const hintId = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const selected = presets.find((preset) => preset.id === selectedId) ?? null
  // After a choice the input shows its label; opening the list again then offers every preset, not just that one.
  const showsSelection = selected !== null && query === presetLabel(selected)
  const matches = useMemo(
    () => filterPresets(presets, showsSelection ? '' : query),
    [presets, query, showsSelection],
  )
  const active = open && activeIndex < matches.length ? activeIndex : -1
  const optionId = (index: number) => `${listId}-option-${index}`

  useEffect(() => {
    if (active < 0) return
    const option = listRef.current?.children[active]
    // jsdom has no scrollIntoView.
    if (option instanceof HTMLElement) option.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  const choose = (preset: PresetSummary) => {
    setQuery(presetLabel(preset))
    setOpen(false)
    setActiveIndex(-1)
    onSelect(preset)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const last = matches.length - 1
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setOpen(true)
        setActiveIndex(last < 0 ? -1 : !open || active < 0 || active >= last ? 0 : active + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        setOpen(true)
        setActiveIndex(last < 0 ? -1 : !open || active <= 0 ? last : active - 1)
        break
      case 'Enter': {
        const match = active >= 0 ? matches[active] : undefined
        if (match) {
          event.preventDefault()
          choose(match)
        }
        break
      }
      case 'Escape':
        if (open) {
          event.preventDefault()
          setOpen(false)
          setActiveIndex(-1)
        } else if (query) {
          setQuery('')
        }
        break
    }
  }

  return (
    <div className="relative">
      <label htmlFor={inputId} className="block text-sm font-medium">
        {t('presets.label')}
      </label>
      <p id={hintId} className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
        {t('presets.hint')}
      </p>
      <div className="relative mt-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500"
        />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          aria-describedby={hintId}
          autoComplete="off"
          spellCheck={false}
          placeholder={t('presets.placeholder')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => {
            setOpen(false)
            setActiveIndex(-1)
          }}
          onKeyDown={onKeyDown}
          className="h-10 w-full rounded-lg bg-white pr-3 pl-9 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700"
        />
      </div>
      <div aria-live="polite" className="sr-only">
        {open && !showsSelection && query.trim() ? t('presets.results', { count: matches.length }) : ''}
      </div>
      <div
        hidden={!open}
        className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg bg-white p-1 shadow-lg ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700"
      >
        <div ref={listRef} id={listId} role="listbox" aria-label={t('presets.label')} className="text-sm">
          {matches.map((preset, index) => {
            const isSelected = preset.id === selectedId
            return (
              // biome-ignore lint/a11y/useKeyWithClickEvents: the combobox input handles the keyboard, focus never moves to options.
              <div
                key={preset.id}
                id={optionId(index)}
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                // Keeps focus in the input, so its blur does not close the list before the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => choose(preset)}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-md px-3 py-2',
                  index === active && 'bg-indigo-50 dark:bg-indigo-400/15',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{presetTitle(preset)}</span>
                  <span className="block text-xs text-zinc-600 dark:text-zinc-400">
                    {preset.universityName} · {preset.poVersion}
                  </span>
                </span>
                {isSelected ? (
                  <Check aria-hidden className="mt-0.5 size-4 text-indigo-600 dark:text-indigo-300" />
                ) : null}
              </div>
            )
          })}
        </div>
        {matches.length === 0 ? (
          <p className="px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400">{t('presets.noMatches')}</p>
        ) : null}
      </div>
    </div>
  )
}
