import { type CustomPresetFailure, type CustomPresetResult, describeIssuesForLlm } from '@study-plan/shared'
import { Copy, Upload } from 'lucide-react'
import { type ChangeEvent, type ReactNode, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button.tsx'
import { Section, useCopy } from './section.tsx'

const MAX_ISSUES = 30

const ERROR_KEYS = {
  empty: 'errors.empty',
  no_json: 'errors.no_json',
  invalid_json: 'errors.invalid_json',
  invalid_preset: 'errors.invalid_preset',
} as const satisfies Record<CustomPresetFailure['reason'], string>

export interface AnswerPanelProps {
  answer: string
  onAnswerChange: (answer: string) => void
  onCheck: () => void
  result: CustomPresetResult | null
  /** Rendered below the field when the answer is valid, usually the preview. */
  children?: ReactNode
}

/** Step 3: paste or load the LLM answer, check it and report problems back to the LLM. */
export function AnswerPanel({ answer, onAnswerChange, onCheck, result, children }: AnswerPanelProps) {
  const { t } = useTranslation('customPreset')
  const answerId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState(false)

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      onAnswerChange(await file.text())
      setFileError(false)
    } catch {
      setFileError(true)
    }
  }

  return (
    <Section heading={t('answer.heading')}>
      <div>
        <label htmlFor={answerId} className="block text-sm font-medium">
          {t('answer.label')}
        </label>
        <textarea
          id={answerId}
          value={answer}
          onChange={(event) => onAnswerChange(event.target.value)}
          rows={8}
          spellCheck={false}
          className="mt-1 w-full resize-y rounded-lg bg-white p-3 font-mono text-xs ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={onCheck}>
          {t('answer.check')}
        </Button>
        <Button onClick={() => fileRef.current?.click()}>
          <Upload aria-hidden className="size-4" />
          {t('answer.loadFile')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.txt,.md,application/json,text/plain,text/markdown"
          className="hidden"
          aria-label={t('answer.fileInput')}
          onChange={onFile}
        />
      </div>
      {fileError ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {t('answer.fileError')}
        </p>
      ) : null}
      {result && !result.success ? <FailureReport failure={result} /> : null}
      {result?.success ? children : null}
    </Section>
  )
}

function FailureReport({ failure }: { failure: CustomPresetFailure }) {
  const { t } = useTranslation('customPreset')
  const { ok, copy } = useCopy()
  return (
    <div
      role="alert"
      className="space-y-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900"
    >
      <p className="font-semibold">{t('errors.title')}</p>
      <p>{t(ERROR_KEYS[failure.reason])}</p>
      {failure.issues.length > 0 ? (
        <ul className="max-h-64 list-disc space-y-0.5 overflow-auto pl-5 font-mono text-xs break-words">
          {failure.issues.slice(0, MAX_ISSUES).map((issue, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: issues can repeat and never reorder
            <li key={index}>
              {issue.path ? `${issue.path}: ` : ''}
              {issue.message}
            </li>
          ))}
          {failure.issues.length > MAX_ISSUES ? (
            <li className="list-none font-sans">
              {t('errors.more', { count: failure.issues.length - MAX_ISSUES })}
            </li>
          ) : null}
        </ul>
      ) : null}
      {failure.reason !== 'empty' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void copy(describeIssuesForLlm(failure))}>
              <Copy aria-hidden className="size-4" />
              {t('errors.copyReport')}
            </Button>
            <span role="status">{ok === null ? '' : ok ? t('copied') : t('copyFailed')}</span>
          </div>
          <p className="text-xs">{t('errors.reportHint')}</p>
        </>
      ) : null}
    </div>
  )
}
