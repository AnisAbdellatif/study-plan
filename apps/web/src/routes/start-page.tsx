import { Tabs } from '@base-ui/react/tabs'
import {
  type CustomPresetResult,
  createPlanFromPreset,
  type Plan,
  type Preset,
  type Term,
  termAt,
} from '@study-plan/shared'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { Bot, Check, FileJson, LayoutList, LogIn, Sparkles, Upload } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountSync } from '../components/account-sync.tsx'
import { BrandMark } from '../components/brand-logo.tsx'
import { ImportPlanButton } from '../components/import-plan-button.tsx'
import { PresetPicker } from '../components/presets/preset-picker.tsx'
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
import { createExamplePlan } from '../demo.ts'
import { cn } from '../lib/cn.ts'
import { newId } from '../lib/format.ts'
import { useGuestState, useGuestStore } from '../store/guest-store.ts'
import { isStartMethod, START_METHODS, type StartMethod } from './start-methods.ts'

export const DRAFT_KEY = 'study-plan:custom-preset-draft'

const linkClass = 'font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300'

const signInClass =
  'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-medium text-white shadow-sm shadow-indigo-600/30 hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:shadow-indigo-950/60'

// A segmented control: the three ways sit side by side even on phones, icon above the label there.
const methodTabClass =
  'flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-center text-xs font-medium text-zinc-600 outline-none transition-colors hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-indigo-500 aria-selected:bg-white aria-selected:text-indigo-700 aria-selected:shadow-sm sm:min-h-11 sm:flex-row sm:gap-2 sm:text-sm dark:text-zinc-400 dark:hover:text-zinc-100 dark:aria-selected:bg-zinc-800 dark:aria-selected:text-indigo-300'
const panelClass =
  'rounded-xl outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500'
const optionCardClass =
  'flex flex-col gap-2 rounded-xl bg-white/70 p-4 text-sm ring-1 ring-zinc-200 dark:bg-zinc-900/70 dark:ring-zinc-800'

const METHOD_ICONS = { template: LayoutList, file: FileJson, llm: Bot } as const

/** Where the new plan comes from: an admin preset, the LLM steps, a programme file, or the example. */
type Pending = 'preset' | 'programme' | 'file' | 'example'

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

type LlmStep = 'describe' | 'prompt' | 'answer' | 'create'

/** Where the student is in the four language model steps, so the long form never feels like a dead end. */
function LlmProgress({ done }: { done: Record<LlmStep, boolean> }) {
  const { t } = useTranslation('start')
  const steps: LlmStep[] = ['describe', 'prompt', 'answer', 'create']
  return (
    <ol aria-label={t('llm.progress')} className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {steps.map((step, index) => (
        <li
          key={step}
          className={cn(
            'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ring-1 ring-inset',
            done[step]
              ? 'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900'
              : 'bg-white/60 text-zinc-700 ring-zinc-200 dark:bg-zinc-900/60 dark:text-zinc-300 dark:ring-zinc-800',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]',
              done[step]
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
            )}
          >
            {done[step] ? <Check className="size-3" /> : index + 1}
          </span>
          <span>{t(`llm.steps.${step}`)}</span>
          {done[step] ? <span className="sr-only">{t('llm.done')}</span> : null}
        </li>
      ))}
    </ol>
  )
}

export function StartPage() {
  const { t } = useTranslation(['start', 'customPreset', 'common'])
  const store = useGuestStore()
  const { plan, loadError } = useGuestState()
  const { user, sessionPending } = useAccountSync()
  const navigate = useNavigate()
  const search = useSearch({ from: '/start' })
  const otherId = useId()
  const extraction = useProgrammeExtraction({
    draftKey: DRAFT_KEY,
    initialDraft: () => loadDraft(DRAFT_KEY) ?? emptyDraft,
  })
  const { draft, result } = extraction
  const [chosenPreset, setChosenPreset] = useState<Preset | null>(null)
  const [fileResult, setFileResult] = useState<CustomPresetResult | null>(null)
  const [startTerm, setStartTerm] = useState<Term>(() => termAt(new Date()))
  const [pending, setPending] = useState<Pending | null>(null)

  // A started language model draft reopens its tab; otherwise the templates come first.
  const method: StartMethod = search.method ?? (draft.promptFor ? 'llm' : 'template')
  const selectMethod = (value: unknown) => {
    if (isStartMethod(value)) void navigate({ to: '/start', search: { method: value }, replace: true })
  }

  const open = (next: Plan) => {
    store.replacePlan(next)
    // Best effort: ask the browser not to evict guest data under storage pressure.
    void navigator.storage?.persist?.().catch(() => false)
    void navigate({ to: '/' })
  }

  const run = (action: Pending) => {
    const now = new Date()
    if (action === 'example') {
      open(createExamplePlan(newId(), now))
      return
    }
    if (action === 'preset') {
      if (chosenPreset) open(createPlanFromPreset(chosenPreset, { id: newId(), startTerm, now }))
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
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-12 sm:pt-10">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/"
          className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          <BrandMark size="lg" />
        </Link>
        {/* Hidden while the session loads too, so signed-in students never see it flash. */}
        {user || sessionPending ? null : (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-zinc-600 sm:inline dark:text-zinc-400">
              {t('haveAccount')}
            </span>
            <Link to="/sign-in" className={signInClass}>
              <LogIn aria-hidden className="size-4" />
              {t('signIn')}
            </Link>
          </div>
        )}
      </div>

      <header className="mt-8 sm:mt-10">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t('title')}</h1>
        <p className="mt-3 max-w-2xl text-base text-zinc-600 dark:text-zinc-400">{t('intro')}</p>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-700 dark:text-zinc-300">
          {(['noAccount', 'local', 'editable'] as const).map((key) => (
            <li key={key} className="flex items-center gap-1.5">
              <Check aria-hidden className="size-4 text-emerald-600 dark:text-emerald-400" />
              {t(`highlights.${key}`)}
            </li>
          ))}
        </ul>
        {plan ? (
          <p className="mt-4 text-sm">
            <Link to="/" className={linkClass}>
              {t('backToPlan')}
            </Link>
          </p>
        ) : null}
      </header>

      {loadError ? (
        <div
          role="alert"
          className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900"
        >
          {t('loadError')}
          <button type="button" className="ml-2 underline" onClick={() => store.dismissLoadError()}>
            {t('dismiss')}
          </button>
        </div>
      ) : null}

      {/* One way at a time. The tab is in the URL, so reloading or going back keeps it. */}
      <Tabs.Root value={method} onValueChange={selectMethod} className="mt-8">
        <Tabs.List
          aria-label={t('methods.label')}
          className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-200/70 p-1 ring-1 ring-zinc-200 ring-inset dark:bg-zinc-900 dark:ring-zinc-800"
        >
          {START_METHODS.map((value) => {
            const Icon = METHOD_ICONS[value]
            return (
              <Tabs.Tab key={value} value={value} className={methodTabClass}>
                <Icon aria-hidden className="size-5 sm:size-4" />
                {t(`methods.${value}`)}
              </Tabs.Tab>
            )
          })}
        </Tabs.List>

        <Tabs.Panel value="template" className={panelClass}>
          <PresetPicker preset={chosenPreset} onPresetChange={setChosenPreset}>
            {chosenPreset ? (
              <CreatePlanForm
                preset={chosenPreset}
                startTerm={startTerm}
                onStartTermChange={setStartTerm}
                onSubmit={() => request('preset')}
              />
            ) : null}
          </PresetPicker>
        </Tabs.Panel>

        <Tabs.Panel value="file" className={panelClass}>
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
        </Tabs.Panel>

        <Tabs.Panel value="llm" className={panelClass}>
          <p className="mt-6 text-sm text-zinc-700 dark:text-zinc-300">{t('orSteps')}</p>
          <LlmProgress
            done={{
              describe: draft.promptFor !== null,
              prompt: draft.promptFor !== null && draft.answer.trim() !== '',
              answer: result?.success === true,
              create: false,
            }}
          />

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
        </Tabs.Panel>
      </Tabs.Root>

      <section aria-labelledby={otherId} className="mt-12">
        <h2 id={otherId} className="text-base font-semibold">
          {t('other.heading')}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className={optionCardClass}>
            <p className="flex items-center gap-2 font-medium">
              <Sparkles aria-hidden className="size-4 text-indigo-600 dark:text-indigo-400" />
              {t('other.exampleTitle')}
            </p>
            <p className={hintClass}>{t('exampleNote')}</p>
            <Button className="mt-auto w-fit" onClick={() => request('example')}>
              {t('tryExample')}
            </Button>
          </div>
          <div className={optionCardClass}>
            <p className="flex items-center gap-2 font-medium">
              <Upload aria-hidden className="size-4 text-indigo-600 dark:text-indigo-400" />
              {t('other.importTitle')}
            </p>
            <p className={hintClass}>{t('importNote')}</p>
            <ImportPlanButton label={t('import')} className="mt-auto w-fit" />
          </div>
        </div>
      </section>

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
