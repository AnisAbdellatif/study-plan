import { createPlanFromPreset, type Term, termAt } from '@study-plan/shared'
import { Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImportPlanButton } from '../components/import-plan-button.tsx'
import { fieldClass, StartTermFields } from '../components/start-term-fields.tsx'
import { Button } from '../components/ui/button.tsx'
import { ConfirmDialog } from '../components/ui/dialog.tsx'
import { DEGREE_LABEL, newId } from '../lib/format.ts'
import { currentPresets, findPreset } from '../presets.ts'
import { useGuestState, useGuestStore } from '../store/guest-store.ts'

export function StartPage() {
  const { t } = useTranslation(['start', 'common'])
  const store = useGuestStore()
  const { plan, loadError } = useGuestState()
  const navigate = useNavigate()
  const presetFieldId = useId()

  const currentTerm = useMemo(() => termAt(new Date()), [])
  const [presetId, setPresetId] = useState(currentPresets[0]?.preset.id ?? '')
  const [startTerm, setStartTerm] = useState<Term>(currentTerm)
  const [confirmReplace, setConfirmReplace] = useState(false)

  const entry = findPreset(presetId)

  const create = () => {
    if (!entry) return
    store.replacePlan(createPlanFromPreset(entry.preset, { id: newId(), startTerm, now: new Date() }))
    // Best effort: ask the browser not to evict guest data under storage pressure.
    void navigator.storage?.persist?.().catch(() => false)
    void navigate({ to: '/' })
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (plan) setConfirmReplace(true)
    else create()
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
      <p className="text-xs font-medium tracking-wide text-indigo-600 uppercase dark:text-indigo-400">
        {t('common:brand')}
      </p>
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

      <form
        onSubmit={submit}
        className="mt-6 space-y-5 rounded-xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
      >
        <div>
          <label htmlFor={presetFieldId} className="block text-sm font-medium">
            {t('programme')}
          </label>
          <select
            id={presetFieldId}
            value={presetId}
            onChange={(event) => setPresetId(event.target.value)}
            className={fieldClass}
          >
            {currentPresets.map(({ preset, fictional }) => (
              <option key={preset.id} value={preset.id}>
                {preset.programme.name} {DEGREE_LABEL[preset.programme.degree]} · {preset.university.name}
                {fictional ? ` ${t('fictional')}` : ''}
              </option>
            ))}
          </select>
          {entry ? (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {entry.preset.poVersion} · {t('semesterCount', { count: entry.preset.standardSemesters })} ·{' '}
              {entry.preset.totalCredits} {entry.preset.creditLabel}
              {entry.fictional ? `. ${t('fictionalNote')}` : ''}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            {t('customMissing')}{' '}
            <Link
              to="/start/custom"
              className="font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300"
            >
              {t('customLink')}
            </Link>
          </p>
        </div>

        <StartTermFields
          value={startTerm}
          onChange={setStartTerm}
          standardSemesters={entry?.preset.standardSemesters}
        />

        <Button type="submit" variant="primary" className="w-full" disabled={!entry}>
          {t('submit')}
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <ImportPlanButton label={t('import')} variant="ghost" />
        <Link
          to="/sign-in"
          className="font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300"
        >
          {t('haveAccount')}
        </Link>
        {plan ? (
          <Link
            to="/"
            className="font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300"
          >
            {t('backToPlan')}
          </Link>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmReplace}
        onOpenChange={setConfirmReplace}
        title={t('replace.title')}
        description={t('replace.description')}
        confirmLabel={t('replace.confirm')}
        destructive
        onConfirm={create}
      />
    </main>
  )
}
