import type { CustomProgrammeInput } from '@study-plan/shared'
import { type FormEvent, type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { DEGREE_LABEL } from '../../lib/format.ts'
import { fieldClass } from '../start-term-fields.tsx'
import { Button } from '../ui/button.tsx'
import { type ExtractionDraft, toInput } from './draft.ts'
import { hintClass, Section } from './section.tsx'

export interface DescribeFormProps {
  draft: ExtractionDraft
  onChange: (changes: Partial<ExtractionDraft>) => void
  onGenerate: (input: CustomProgrammeInput) => void
  /** Shown above the fields, e.g. where prefilled values come from. */
  intro?: ReactNode
  poVersionHint?: string
}

/** Step 1: university, programme, degree and PO version, then the prompt is generated. */
export function DescribeForm({ draft, onChange, onGenerate, intro, poVersionHint }: DescribeFormProps) {
  const { t } = useTranslation('customPreset')
  const ids = {
    university: useId(),
    programme: useId(),
    degree: useId(),
    poVersion: useId(),
    poHint: useId(),
  }

  const input = toInput(draft.universityName, draft.programmeName, draft.degree, draft.poVersion)
  const complete = input.universityName !== '' && input.programmeName !== ''
  const stale = draft.promptFor !== null && JSON.stringify(draft.promptFor) !== JSON.stringify(input)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (complete) onGenerate(input)
  }

  return (
    <Section heading={t('describe.heading')}>
      {intro ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{intro}</p> : null}
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor={ids.university} className="block text-sm font-medium">
            {t('describe.university')}
          </label>
          <input
            id={ids.university}
            value={draft.universityName}
            onChange={(event) => onChange({ universityName: event.target.value })}
            required
            autoComplete="organization"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor={ids.programme} className="block text-sm font-medium">
            {t('describe.programme')}
          </label>
          <input
            id={ids.programme}
            value={draft.programmeName}
            onChange={(event) => onChange({ programmeName: event.target.value })}
            required
            className={fieldClass}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <div>
            <label htmlFor={ids.degree} className="block text-sm font-medium">
              {t('describe.degree')}
            </label>
            <select
              id={ids.degree}
              value={draft.degree}
              onChange={(event) => onChange({ degree: event.target.value === 'msc' ? 'msc' : 'bsc' })}
              className={fieldClass}
            >
              {(['bsc', 'msc'] as const).map((degree) => (
                <option key={degree} value={degree}>
                  {DEGREE_LABEL[degree]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={ids.poVersion} className="block text-sm font-medium">
              {t('describe.poVersion')}
            </label>
            <input
              id={ids.poVersion}
              value={draft.poVersion}
              onChange={(event) => onChange({ poVersion: event.target.value })}
              aria-describedby={ids.poHint}
              className={fieldClass}
            />
            <p id={ids.poHint} className={`mt-1 ${hintClass}`}>
              {poVersionHint ?? t('describe.poVersionHint')}
            </p>
          </div>
        </div>
        {stale ? <p className="text-sm text-amber-800 dark:text-amber-300">{t('describe.changed')}</p> : null}
        <Button type="submit" variant="primary" disabled={!complete}>
          {draft.promptFor ? t('describe.regenerate') : t('describe.generate')}
        </Button>
      </form>
    </Section>
  )
}
