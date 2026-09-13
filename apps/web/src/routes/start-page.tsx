import {
  type CustomPresetResult,
  createPlanFromPreset,
  type Plan,
  type Preset,
  type Term,
  termAt,
} from '@study-plan/shared'
import { Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountSync } from '../components/account-sync.tsx'
import { BrandMark } from '../components/brand-logo.tsx'
import { ImportPlanButton } from '../components/import-plan-button.tsx'
import { AnswerPanel } from '../components/programme-extraction/answer-panel.tsx'
import { DescribeForm } from '../components/programme-extraction/describe-form.tsx'
import { emptyDraft, loadDraft, useProgrammeExtraction } from '../components/programme-extraction/draft.ts'
import { PresetPreview } from '../components/programme-extraction/preset-preview.tsx'
import { ProgrammeFileImport } from '../components/programme-extraction/programme-file-import.tsx'
import { PromptPanel } from '../components/programme-extraction/prompt-panel.tsx'
import { hintClass, Section } from '../components/programme-extraction/section.tsx'
import { StartTermFields } from '../components/start-term-fields.tsx'
import { Button } from '../components/ui/button.tsx'
import { ConfirmDialog } from '../components/ui/dialog.tsx'
import { demoPreset } from '../demo.ts'
import { newId } from '../lib/format.ts'
import { useGuestState, useGuestStore } from '../store/guest-store.ts'

export const DRAFT_KEY = 'study-plan:custom-preset-draft'

const linkClass = 'font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300'

/** Where the new plan comes from: the LLM steps, a programme file, or the example. */
type Pending = 'programme' | 'file' | 'example'

function CreatePlanForm({
  preset,
  startTerm,
  onStartTermChange,
  onSubmit,
}: {
  preset: Preset
  startTerm: Term
  onStartTermChange: (term: Term) => void
  onSubmit: () => void
}) {
  const { t } = useTranslation('customPreset')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <StartTermFields
        value={startTerm}
        onChange={onStartTermChange}
        standardSemesters={preset.standardSemesters}
      />
      <Button type="submit" variant="primary" className="w-full">
        {t('create.submit')}
      </Button>
    </form>
  )
}

export function StartPage() {
  const { t } = useTranslation(['start', 'customPreset', 'common'])
  const store = useGuestStore()
  const { plan, loadError } = useGuestState()
  const { user, sessionPending } = useAccountSync()
  const navigate = useNavigate()
  const extraction = useProgrammeExtraction({
    draftKey: DRAFT_KEY,
    initialDraft: () => loadDraft(DRAFT_KEY) ?? emptyDraft,
  })
  const { draft, result } = extraction
  const [fileResult, setFileResult] = useState<CustomPresetResult | null>(null)
  const [startTerm, setStartTerm] = useState<Term>(() => termAt(new Date()))
  const [pending, setPending] = useState<Pending | null>(null)

  const open = (next: Plan) => {
    store.replacePlan(next)
    // Best effort: ask the browser not to evict guest data under storage pressure.
    void navigator.storage?.persist?.().catch(() => false)
    void navigate({ to: '/' })
  }

  const run = (action: Pending) => {
    const now = new Date()
    if (action === 'example') {
      open(createPlanFromPreset(demoPreset, { id: newId(), startTerm: termAt(now), now }))
      return
    }
    if (action === 'file') {
      if (fileResult?.success) open(createPlanFromPreset(fileResult.preset, { id: newId(), startTerm, now }))
      return
    }
    if (!result?.success) return
    extraction.finish()
    open(createPlanFromPreset(result.preset, { id: newId(), startTerm, now }))
  }

  const request = (action: Pending) => {
    if (plan) setPending(action)
    else run(action)
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <BrandMark size="lg" className="mb-4" />
      <h1 className="mt-1 text-2xl font-semibold">{t('title')}</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t('intro')}</p>

      {loadError ? (
        <div
          role="alert"
          className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900"
        >
          {t('loadError')}
          <button type="button" className="ml-2 underline" onClick={() => store.dismissLoadError()}>
            {t('dismiss')}
          </button>
        </div>
      ) : null}

      <div className="mt-4 space-y-3 text-sm">
        <div>
          <Button onClick={() => request('example')}>{t('tryExample')}</Button>
          <p className={`mt-1 ${hintClass}`}>{t('exampleNote')}</p>
        </div>
        <div>
          <ImportPlanButton label={t('import')} variant="ghost" className="-ml-3" />
          <p className={hintClass}>{t('importNote')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* Hidden while the session loads too, so signed-in students never see it flash. */}
          {user || sessionPending ? null : (
            <Link to="/sign-in" className={linkClass}>
              {t('haveAccount')}
            </Link>
          )}
          {plan ? (
            <Link to="/" className={linkClass}>
              {t('backToPlan')}
            </Link>
          ) : null}
        </div>
      </div>

      <ProgrammeFileImport result={fileResult} onResult={setFileResult}>
        {fileResult?.success ? (
          <CreatePlanForm
            preset={fileResult.preset}
            startTerm={startTerm}
            onStartTermChange={setStartTerm}
            onSubmit={() => request('file')}
          />
        ) : null}
      </ProgrammeFileImport>

      <p className="mt-8 text-sm font-medium text-zinc-600 dark:text-zinc-400">{t('orSteps')}</p>

      <DescribeForm draft={draft} onChange={extraction.update} onGenerate={extraction.generate} />

      {draft.promptFor ? (
        <>
          <PromptPanel prompt={extraction.prompt} promptFor={draft.promptFor} />
          <AnswerPanel
            answer={draft.answer}
            onAnswerChange={extraction.setAnswer}
            onCheck={extraction.check}
            result={result}
          >
            {result?.success ? <PresetPreview preset={result.preset} warnings={result.warnings} /> : null}
          </AnswerPanel>
        </>
      ) : null}

      {draft.promptFor && result?.success ? (
        <Section heading={t('customPreset:create.heading')}>
          <CreatePlanForm
            preset={result.preset}
            startTerm={startTerm}
            onStartTermChange={setStartTerm}
            onSubmit={() => request('programme')}
          />
        </Section>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) setPending(null)
        }}
        title={t('replace.title')}
        description={t('replace.description')}
        confirmLabel={t('replace.confirm')}
        destructive
        onConfirm={() => {
          if (pending) run(pending)
        }}
      />
    </main>
  )
}
