import { type CustomPresetResult, parseCustomPreset } from '@study-plan/shared'
import { FileJson } from 'lucide-react'
import { type ChangeEvent, type ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { newId } from '../../lib/format.ts'
import { Button } from '../ui/button.tsx'
import { FailureReport } from './answer-panel.tsx'
import { PresetPreview } from './preset-preview.tsx'
import { hintClass, Section } from './section.tsx'

export interface ProgrammeFileImportProps {
  result: CustomPresetResult | null
  onResult: (result: CustomPresetResult | null) => void
  /** Rendered below the preview when the file is valid, usually the form that creates the plan. */
  children?: ReactNode
}

/**
 * Shortcut past the prompt steps: a programme file (programme.json) that already exists, e.g. from an earlier
 * LLM run or a fellow student. University and programme come from the file.
 */
export function ProgrammeFileImport({ result, onResult, children }: ProgrammeFileImportProps) {
  const { t } = useTranslation('start')
  const fileRef = useRef<HTMLInputElement>(null)
  const [idSuffix] = useState(() => newId().replace(/-/g, '').slice(0, 8))
  const [fileName, setFileName] = useState<string | null>(null)
  const [readError, setReadError] = useState(false)

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      setReadError(false)
      setFileName(file.name)
      onResult(parseCustomPreset(text, null, idSuffix))
    } catch {
      setReadError(true)
      setFileName(null)
      onResult(null)
    }
  }

  return (
    <Section heading={t('programmeFile.heading')}>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('programmeFile.intro')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => fileRef.current?.click()}>
          <FileJson aria-hidden className="size-4" />
          {t('programmeFile.choose')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json,text/plain"
          className="hidden"
          aria-label={t('programmeFile.fileInput')}
          onChange={onFile}
        />
        {fileName ? (
          <span className="text-sm text-zinc-600 break-all dark:text-zinc-400">
            {t('programmeFile.loaded', { name: fileName })}
          </span>
        ) : null}
      </div>
      <p className={hintClass}>{t('programmeFile.notABackup')}</p>
      {readError ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {t('programmeFile.readError')}
        </p>
      ) : null}
      {result && !result.success ? <FailureReport failure={result} /> : null}
      {result?.success ? (
        <>
          <PresetPreview preset={result.preset} warnings={result.warnings} />
          {children}
        </>
      ) : null}
    </Section>
  )
}
