import { type Preset, presetSchema } from '@study-plan/shared'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type PresetSummary, presetApi } from '../../lib/api.ts'
import { PresetPreview } from '../programme-extraction/preset-preview.tsx'
import { hintClass, Section } from '../programme-extraction/section.tsx'
import { PresetCombobox } from './preset-combobox.tsx'

export interface PresetPickerProps {
  /** The loaded preset of the current choice, null while nothing is chosen or it is loading. */
  preset: Preset | null
  onPresetChange: (preset: Preset | null) => void
  /** Rendered below the preview once the preset is loaded, usually the form that creates the plan. */
  children?: ReactNode
}

/** Start page section: pick one of the presets admins maintain. Works without an account. */
export function PresetPicker({ preset, onPresetChange, children }: PresetPickerProps) {
  const { t } = useTranslation('start')
  const [presets, setPresets] = useState<PresetSummary[] | 'loading' | 'error'>('loading')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  // The latest choice; answers for an earlier one that arrive late are ignored.
  const requested = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    presetApi
      .list()
      .then((list) => {
        if (active) setPresets(list)
      })
      .catch(() => {
        if (active) setPresets('error')
      })
    return () => {
      active = false
    }
  }, [])

  const select = async (summary: PresetSummary) => {
    if (summary.id === selectedId && status !== 'error') return
    setSelectedId(summary.id)
    requested.current = summary.id
    onPresetChange(null)
    setStatus('loading')
    try {
      const loaded = presetSchema.parse(await presetApi.get(summary.id))
      if (requested.current !== summary.id) return
      onPresetChange(loaded)
      setStatus('idle')
    } catch {
      if (requested.current === summary.id) setStatus('error')
    }
  }

  return (
    <Section heading={t('presets.heading')}>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('presets.intro')}</p>
      {presets === 'loading' ? (
        <p role="status" className="text-sm">
          {t('presets.loading')}
        </p>
      ) : presets === 'error' ? (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{t('presets.loadError')}</p>
      ) : presets.length === 0 ? (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{t('presets.empty')}</p>
      ) : (
        <PresetCombobox presets={presets} selectedId={selectedId} onSelect={(next) => void select(next)} />
      )}
      {status === 'loading' ? (
        <p role="status" className="text-sm">
          {t('presets.loadingPreset')}
        </p>
      ) : status === 'error' ? (
        <p className="text-sm text-red-700 dark:text-red-300">{t('presets.presetError')}</p>
      ) : null}
      {preset && status === 'idle' ? (
        <>
          <PresetPreview preset={preset} warnings={[]} />
          {children}
        </>
      ) : null}
      <p className={hintClass}>{t('presets.alternatives')}</p>
    </Section>
  )
}
