import type { CustomProgrammeInput } from '@study-plan/shared'
import { Copy, Download } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { downloadFile, slugify } from '../../lib/files.ts'
import { Button } from '../ui/button.tsx'
import { hintClass, Section, useCopy } from './section.tsx'

export interface PromptPanelProps {
  prompt: string
  promptFor: CustomProgrammeInput
  /** An extra note below the steps, e.g. that the prompt lists the plan's modules. */
  note?: ReactNode
}

/** Step 2: how to use the prompt with an LLM, copy and download, and the privacy note. */
export function PromptPanel({ prompt, promptFor, note }: PromptPanelProps) {
  const { t } = useTranslation('customPreset')
  const promptId = useId()
  const { ok, copy } = useCopy()

  const download = () => {
    const name = slugify(`${promptFor.programmeName} ${promptFor.degree}`) || 'programme'
    downloadFile(`prompt-${name}.md`, prompt, 'text/markdown')
  }

  return (
    <Section heading={t('prompt.heading')}>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>{t('prompt.stepCopy')}</li>
        <li>{t('prompt.stepOpen')}</li>
        <li>{t('prompt.stepAttach')}</li>
        <li>{t('prompt.stepSend')}</li>
        <li>{t('prompt.stepAnswer')}</li>
      </ol>
      {note ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{note}</p> : null}
      <div>
        <label htmlFor={promptId} className="block text-sm font-medium">
          {t('prompt.label')}
        </label>
        <textarea
          id={promptId}
          value={prompt}
          readOnly
          rows={8}
          spellCheck={false}
          className="mt-1 w-full resize-y overflow-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => void copy(prompt)}>
          <Copy aria-hidden className="size-4" />
          {t('prompt.copy')}
        </Button>
        <Button onClick={download}>
          <Download aria-hidden className="size-4" />
          {t('prompt.download')}
        </Button>
        <span role="status" className="text-sm text-zinc-700 dark:text-zinc-300">
          {ok === null ? '' : ok ? t('copied') : t('copyFailed')}
        </span>
      </div>
      <p className={hintClass}>{t('prompt.english')}</p>
      <p className={hintClass}>{t('prompt.privacy')}</p>
    </Section>
  )
}
