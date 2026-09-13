import {
  buildExtractionPrompt,
  type CustomPresetFailure,
  type CustomPresetResult,
  type CustomPresetWarning,
  type CustomProgrammeInput,
  createPlanFromPreset,
  describeIssuesForLlm,
  type Preset,
  parseCustomPreset,
  type Term,
  termAt,
} from '@study-plan/shared'
import { Link, useNavigate } from '@tanstack/react-router'
import { Copy, Download, Upload } from 'lucide-react'
import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { fieldClass, StartTermFields } from '../components/start-term-fields.tsx'
import { Button } from '../components/ui/button.tsx'
import { ConfirmDialog } from '../components/ui/dialog.tsx'
import { downloadFile, slugify } from '../lib/files.ts'
import { DEGREE_LABEL, describeRounding, formatCredits, newId } from '../lib/format.ts'
import { useGuestState, useGuestStore } from '../store/guest-store.ts'

export const DRAFT_KEY = 'study-plan:custom-preset-draft'

const cardClass = 'rounded-xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'
const hintClass = 'text-xs text-zinc-600 dark:text-zinc-400'
const MAX_ISSUES = 30
const MAX_CODES = 10

type Degree = CustomProgrammeInput['degree']

interface Draft {
  universityName: string
  programmeName: string
  degree: Degree
  poVersion: string
  answer: string
  /** The details the prompt was generated for. The answer is parsed with these. */
  promptFor: CustomProgrammeInput | null
}

const emptyDraft: Draft = {
  universityName: '',
  programmeName: '',
  degree: 'bsc',
  poVersion: '',
  answer: '',
  promptFor: null,
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): string => (typeof value === 'string' ? value : '')

function toInput(universityName: string, programmeName: string, degree: Degree, poVersion: string) {
  const input: CustomProgrammeInput = {
    universityName: universityName.trim(),
    programmeName: programmeName.trim(),
    degree,
  }
  if (poVersion.trim()) input.poVersion = poVersion.trim()
  return input
}

/** sessionStorage content is untrusted: every field is checked before use. */
function loadDraft(): Draft {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return emptyDraft
    const data: unknown = JSON.parse(raw)
    if (!isRecord(data)) return emptyDraft
    const saved = data.promptFor
    const promptFor =
      isRecord(saved) && text(saved.universityName).trim() && text(saved.programmeName).trim()
        ? toInput(
            text(saved.universityName),
            text(saved.programmeName),
            saved.degree === 'msc' ? 'msc' : 'bsc',
            text(saved.poVersion),
          )
        : null
    return {
      universityName: text(data.universityName),
      programmeName: text(data.programmeName),
      degree: data.degree === 'msc' ? 'msc' : 'bsc',
      poVersion: text(data.poVersion),
      answer: text(data.answer),
      promptFor,
    }
  } catch {
    return emptyDraft
  }
}

function saveDraft(draft: Draft) {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Without storage the draft lasts until the page is left.
  }
}

function clearDraft() {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // Nothing to clear.
  }
}

async function writeClipboard(value: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

type CopyTarget = 'prompt' | 'report'

const ERROR_KEYS = {
  empty: 'errors.empty',
  no_json: 'errors.no_json',
  invalid_json: 'errors.invalid_json',
  invalid_preset: 'errors.invalid_preset',
} as const satisfies Record<CustomPresetFailure['reason'], string>

const WARNING_KEYS = {
  modules_without_area: 'warnings.modules_without_area',
  modules_without_semester: 'warnings.modules_without_semester',
  modules_without_details: 'warnings.modules_without_details',
} as const satisfies Record<CustomPresetWarning['kind'], string>

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={`mt-6 space-y-4 ${cardClass}`}>
      <h2 id={id} className="text-lg font-semibold">
        {heading}
      </h2>
      {children}
    </section>
  )
}

export function CustomPresetPage() {
  const { t } = useTranslation(['customPreset', 'common', 'start'])
  const store = useGuestStore()
  const { plan } = useGuestState()
  const navigate = useNavigate()
  const ids = {
    university: useId(),
    programme: useId(),
    degree: useId(),
    poVersion: useId(),
    poHint: useId(),
    prompt: useId(),
    answer: useId(),
  }

  const [draft, setDraft] = useState<Draft>(loadDraft)
  const [result, setResult] = useState<CustomPresetResult | null>(null)
  const [idSuffix] = useState(() => newId().replace(/-/g, '').slice(0, 8))
  const [copyStatus, setCopyStatus] = useState<{ target: CopyTarget; ok: boolean } | null>(null)
  const [fileError, setFileError] = useState(false)
  const [startTerm, setStartTerm] = useState<Term>(() => termAt(new Date()))
  const [confirmReplace, setConfirmReplace] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const created = useRef(false)

  useEffect(() => {
    if (!created.current) saveDraft(draft)
  }, [draft])

  useEffect(() => {
    if (!copyStatus?.ok) return
    const timer = setTimeout(() => setCopyStatus(null), 4000)
    return () => clearTimeout(timer)
  }, [copyStatus])

  const update = (changes: Partial<Draft>) => setDraft((current) => ({ ...current, ...changes }))

  const input = toInput(draft.universityName, draft.programmeName, draft.degree, draft.poVersion)
  const complete = input.universityName !== '' && input.programmeName !== ''
  const promptFor = draft.promptFor
  const stale = promptFor !== null && JSON.stringify(promptFor) !== JSON.stringify(input)
  const prompt = useMemo(() => (promptFor ? buildExtractionPrompt(promptFor) : ''), [promptFor])

  const generate = (event: FormEvent) => {
    event.preventDefault()
    if (!complete) return
    update({ promptFor: input })
    setResult(null)
  }

  const copy = async (target: CopyTarget, value: string) => {
    setCopyStatus({ target, ok: await writeClipboard(value) })
  }

  const downloadPrompt = () => {
    if (!promptFor) return
    const name = slugify(`${promptFor.programmeName} ${promptFor.degree}`) || 'programme'
    downloadFile(`prompt-${name}.md`, prompt, 'text/markdown')
  }

  const setAnswer = (answer: string) => {
    update({ answer })
    setResult(null)
  }

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setAnswer(await file.text())
      setFileError(false)
    } catch {
      setFileError(true)
    }
  }

  const check = () => {
    if (!promptFor) return
    setResult(parseCustomPreset(draft.answer, promptFor, idSuffix))
  }

  const create = () => {
    if (!result?.success) return
    store.replacePlan(createPlanFromPreset(result.preset, { id: newId(), startTerm, now: new Date() }))
    created.current = true
    clearDraft()
    // Best effort: ask the browser not to evict guest data under storage pressure.
    void navigator.storage?.persist?.().catch(() => false)
    void navigate({ to: '/' })
  }

  const submitPlan = (event: FormEvent) => {
    event.preventDefault()
    if (plan) setConfirmReplace(true)
    else create()
  }

  const copyFeedback = (target: CopyTarget) =>
    copyStatus?.target === target ? (copyStatus.ok ? t('copied') : t('copyFailed')) : ''

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link
        to="/start"
        className="text-sm font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300"
      >
        {t('back')}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">{t('title')}</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t('intro')}</p>

      <Section heading={t('describe.heading')}>
        <form onSubmit={generate} className="space-y-4">
          <div>
            <label htmlFor={ids.university} className="block text-sm font-medium">
              {t('describe.university')}
            </label>
            <input
              id={ids.university}
              value={draft.universityName}
              onChange={(event) => update({ universityName: event.target.value })}
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
              onChange={(event) => update({ programmeName: event.target.value })}
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
                onChange={(event) => update({ degree: event.target.value === 'msc' ? 'msc' : 'bsc' })}
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
                onChange={(event) => update({ poVersion: event.target.value })}
                aria-describedby={ids.poHint}
                className={fieldClass}
              />
              <p id={ids.poHint} className={`mt-1 ${hintClass}`}>
                {t('describe.poVersionHint')}
              </p>
            </div>
          </div>
          {stale ? (
            <p className="text-sm text-amber-800 dark:text-amber-300">{t('describe.changed')}</p>
          ) : null}
          <Button type="submit" variant="primary" disabled={!complete}>
            {promptFor ? t('describe.regenerate') : t('describe.generate')}
          </Button>
        </form>
      </Section>

      {promptFor ? (
        <>
          <Section heading={t('prompt.heading')}>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>{t('prompt.stepCopy')}</li>
              <li>{t('prompt.stepOpen')}</li>
              <li>{t('prompt.stepAttach')}</li>
              <li>{t('prompt.stepSend')}</li>
              <li>{t('prompt.stepAnswer')}</li>
            </ol>
            <div>
              <label htmlFor={ids.prompt} className="block text-sm font-medium">
                {t('prompt.label')}
              </label>
              <textarea
                id={ids.prompt}
                value={prompt}
                readOnly
                rows={8}
                spellCheck={false}
                className="mt-1 w-full resize-y overflow-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={() => void copy('prompt', prompt)}>
                <Copy aria-hidden className="size-4" />
                {t('prompt.copy')}
              </Button>
              <Button onClick={downloadPrompt}>
                <Download aria-hidden className="size-4" />
                {t('prompt.download')}
              </Button>
              <span role="status" className="text-sm text-zinc-700 dark:text-zinc-300">
                {copyFeedback('prompt')}
              </span>
            </div>
            <p className={hintClass}>{t('prompt.english')}</p>
            <p className={hintClass}>{t('prompt.privacy')}</p>
          </Section>

          <Section heading={t('answer.heading')}>
            <div>
              <label htmlFor={ids.answer} className="block text-sm font-medium">
                {t('answer.label')}
              </label>
              <textarea
                id={ids.answer}
                value={draft.answer}
                onChange={(event) => setAnswer(event.target.value)}
                rows={8}
                spellCheck={false}
                className="mt-1 w-full resize-y rounded-lg bg-white p-3 font-mono text-xs ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={check}>
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

            {result && !result.success ? (
              <div
                role="alert"
                className="space-y-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900"
              >
                <p className="font-semibold">{t('errors.title')}</p>
                <p>{t(ERROR_KEYS[result.reason])}</p>
                {result.issues.length > 0 ? (
                  <ul className="max-h-64 list-disc space-y-0.5 overflow-auto pl-5 font-mono text-xs break-words">
                    {result.issues.slice(0, MAX_ISSUES).map((issue, index) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: issues can repeat and never reorder
                      <li key={index}>
                        {issue.path ? `${issue.path}: ` : ''}
                        {issue.message}
                      </li>
                    ))}
                    {result.issues.length > MAX_ISSUES ? (
                      <li className="list-none font-sans">
                        {t('errors.more', { count: result.issues.length - MAX_ISSUES })}
                      </li>
                    ) : null}
                  </ul>
                ) : null}
                {result.reason !== 'empty' ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={() => void copy('report', describeIssuesForLlm(result))}>
                        <Copy aria-hidden className="size-4" />
                        {t('errors.copyReport')}
                      </Button>
                      <span role="status">{copyFeedback('report')}</span>
                    </div>
                    <p className="text-xs">{t('errors.reportHint')}</p>
                  </>
                ) : null}
              </div>
            ) : null}

            {result?.success ? <PresetPreview preset={result.preset} warnings={result.warnings} /> : null}
          </Section>
        </>
      ) : null}

      {promptFor && result?.success ? (
        <Section heading={t('create.heading')}>
          <form onSubmit={submitPlan} className="space-y-4">
            <StartTermFields
              value={startTerm}
              onChange={setStartTerm}
              standardSemesters={result.preset.standardSemesters}
            />
            <Button type="submit" variant="primary" className="w-full">
              {t('create.submit')}
            </Button>
          </form>
        </Section>
      ) : null}

      <ConfirmDialog
        open={confirmReplace}
        onOpenChange={setConfirmReplace}
        title={t('start:replace.title')}
        description={t('start:replace.description')}
        confirmLabel={t('start:replace.confirm')}
        destructive
        onConfirm={create}
      />
    </main>
  )
}

function PresetPreview({ preset, warnings }: { preset: Preset; warnings: CustomPresetWarning[] }) {
  const { t } = useTranslation('customPreset')
  const graded = preset.modules.filter((module) => module.grading === 'graded').length
  const withDetails = preset.modules.filter((module) => module.details !== undefined).length
  const credits = (value: number) => formatCredits(value)
  const examRules = preset.examRules
  const examLines = [
    examRules?.withdrawalDaysBeforeExam !== undefined
      ? t('preview.withdrawal', { count: examRules.withdrawalDaysBeforeExam })
      : null,
    examRules?.maxAttempts !== undefined ? t('preview.attempts', { count: examRules.maxAttempts }) : null,
  ].filter((line): line is string => line !== null)

  const rows: { label: string; value: ReactNode }[] = [
    { label: t('preview.programme'), value: preset.programme.name },
    { label: t('preview.degree'), value: DEGREE_LABEL[preset.programme.degree] },
    { label: t('preview.university'), value: preset.university.name },
    { label: t('preview.poVersion'), value: preset.poVersion },
    { label: t('preview.handbookVersion'), value: preset.handbookVersion },
    {
      label: t('preview.standardSemesters'),
      value: t('preview.semesterCount', { count: preset.standardSemesters }),
    },
    { label: t('preview.totalCredits'), value: `${credits(preset.totalCredits)} ${preset.creditLabel}` },
    {
      label: t('preview.modules'),
      value: t('preview.moduleCount', {
        count: preset.modules.length,
        graded,
        ungraded: preset.modules.length - graded,
      }),
    },
    {
      label: t('preview.details'),
      value: t('preview.detailsCount', { count: withDetails, total: preset.modules.length }),
    },
  ]
  if (preset.areas.length > 0) {
    rows.push({
      label: t('preview.areas'),
      value: (
        <ul className="space-y-0.5">
          {preset.areas.map((area) => (
            <li key={area.id}>
              {area.maxCredits === undefined
                ? t('preview.areaMin', {
                    name: area.name,
                    min: credits(area.minCredits),
                    label: preset.creditLabel,
                  })
                : t('preview.areaRange', {
                    name: area.name,
                    min: credits(area.minCredits),
                    max: credits(area.maxCredits),
                    label: preset.creditLabel,
                  })}
            </li>
          ))}
        </ul>
      ),
    })
  }
  rows.push({ label: t('preview.rounding'), value: describeRounding(preset.gradeRules.finalRounding) })
  if (examLines.length > 0) {
    rows.push({
      label: t('preview.examRules'),
      value: (
        <ul className="space-y-0.5">
          {examLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ),
    })
  }

  const download = () =>
    downloadFile(`${preset.id.replace('/', '-')}.json`, JSON.stringify(preset, null, 2), 'application/json')

  return (
    <div className="space-y-4 rounded-lg bg-emerald-50/60 p-4 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:ring-emerald-900">
      <div>
        <h3 className="text-base font-semibold">{t('preview.title')}</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t('preview.intro')}</p>
      </div>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="font-medium text-zinc-600 dark:text-zinc-400">{row.label}</dt>
            <dd className="break-words">{row.value}</dd>
          </div>
        ))}
      </dl>

      {warnings.length > 0 ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
          <p className="font-medium">{t('preview.warningsTitle')}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {warnings.map((warning) => (
              <li key={warning.kind}>
                {t(WARNING_KEYS[warning.kind], {
                  count: warning.codes.length,
                  codes: `${warning.codes.slice(0, MAX_CODES).join(', ')}${warning.codes.length > MAX_CODES ? ', …' : ''}`,
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {preset.notes ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">{t('preview.notes')}</summary>
          <p className="mt-2 whitespace-pre-line break-words text-zinc-700 dark:text-zinc-300">
            {preset.notes}
          </p>
        </details>
      ) : null}

      <p className={hintClass}>{t('preview.checkHint')}</p>
      <Button size="sm" onClick={download}>
        <Download aria-hidden className="size-4" />
        {t('preview.downloadTemplate')}
      </Button>
    </div>
  )
}
