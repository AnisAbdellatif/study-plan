import { addTerms, createPlanFromPreset, formatTerm, type Term, termAt } from '@study-plan/shared'
import { Link, useNavigate } from '@tanstack/react-router'
import { type FormEvent, useId, useMemo, useState } from 'react'
import { ImportPlanButton } from '../components/import-plan-button.tsx'
import { Button } from '../components/ui/button.tsx'
import { ConfirmDialog } from '../components/ui/dialog.tsx'
import { DEGREE_LABEL, newId } from '../lib/format.ts'
import { findPreset, presets } from '../presets.ts'
import { useGuestState, useGuestStore } from '../store/guest-store.ts'

const fieldClass =
  'mt-1 h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700'

export function StartPage() {
  const store = useGuestStore()
  const { plan, loadError } = useGuestState()
  const navigate = useNavigate()
  const ids = { preset: useId(), year: useId() }

  const currentTerm = useMemo(() => termAt(new Date()), [])
  const [presetId, setPresetId] = useState(presets[0]?.preset.id ?? '')
  const [season, setSeason] = useState<Term['season']>(currentTerm.season)
  const [year, setYear] = useState(currentTerm.year)
  const [confirmReplace, setConfirmReplace] = useState(false)

  const entry = findPreset(presetId)
  const startTerm: Term = { season, year }
  const years = Array.from({ length: 9 }, (_, index) => currentTerm.year - 7 + index)

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
        Studienplaner
      </p>
      <h1 className="mt-1 text-2xl font-semibold">Studienplan anlegen</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Wähle deinen Studiengang und dein erstes Semester. Die Module werden nach dem Modulhandbuch
        vorsortiert, du kannst sie danach frei verschieben. Du brauchst kein Konto: dein Plan wird nur in
        diesem Browser gespeichert.
      </p>

      {loadError ? (
        <div
          role="alert"
          className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900"
        >
          Dein gespeicherter Plan konnte nicht gelesen werden. Eine Kopie der Daten bleibt im Browser
          erhalten. Du kannst einen exportierten Plan importieren oder neu beginnen.
          <button type="button" className="ml-2 underline" onClick={() => store.dismissLoadError()}>
            Ausblenden
          </button>
        </div>
      ) : null}

      <form
        onSubmit={submit}
        className="mt-6 space-y-5 rounded-xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
      >
        <div>
          <label htmlFor={ids.preset} className="block text-sm font-medium">
            Studiengang
          </label>
          <select
            id={ids.preset}
            value={presetId}
            onChange={(event) => setPresetId(event.target.value)}
            className={fieldClass}
          >
            {presets.map(({ preset, fictional }) => (
              <option key={preset.id} value={preset.id}>
                {preset.programme.name} {DEGREE_LABEL[preset.programme.degree]} · {preset.university.name}
                {fictional ? ' (fiktives Beispiel)' : ''}
              </option>
            ))}
          </select>
          {entry ? (
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {entry.preset.poVersion} · {entry.preset.standardSemesters} Semester ·{' '}
              {entry.preset.totalCredits} {entry.preset.creditLabel}
              {entry.fictional ? '. Frei erfunden, basiert auf keiner echten Prüfungsordnung.' : ''}
            </p>
          ) : null}
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Studienbeginn</legend>
          <div className="mt-1 grid grid-cols-[1fr_auto] gap-3">
            <div className="flex rounded-lg p-1 ring-1 ring-zinc-300 ring-inset dark:ring-zinc-700">
              {(['winter', 'summer'] as const).map((value) => (
                <label
                  key={value}
                  className="flex h-8 flex-1 cursor-pointer items-center justify-center rounded-md text-sm has-[:checked]:bg-indigo-600 has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-indigo-500"
                >
                  <input
                    type="radio"
                    name="season"
                    value={value}
                    checked={season === value}
                    onChange={() => setSeason(value)}
                    className="sr-only"
                  />
                  {value === 'winter' ? 'Wintersemester' : 'Sommersemester'}
                </label>
              ))}
            </div>
            <div>
              <label htmlFor={ids.year} className="sr-only">
                Jahr
              </label>
              <select
                id={ids.year}
                value={year}
                onChange={(event) => setYear(Number(event.target.value))}
                className={`${fieldClass} mt-0`}
              >
                {years.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            1. Semester: {formatTerm(startTerm)}
            {entry
              ? ` · ${entry.preset.standardSemesters}. Semester: ${formatTerm(addTerms(startTerm, entry.preset.standardSemesters - 1))}`
              : ''}
          </p>
        </fieldset>

        <Button type="submit" variant="primary" className="w-full" disabled={!entry}>
          Plan anlegen
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <ImportPlanButton label="Plan aus Datei importieren" variant="ghost" />
        {plan ? (
          <Link
            to="/"
            className="font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300"
          >
            Zurück zu deinem Plan
          </Link>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmReplace}
        onOpenChange={setConfirmReplace}
        title="Bestehenden Plan ersetzen?"
        description="In diesem Browser gibt es schon einen Plan. Der neue Plan ersetzt ihn mitsamt allen eingetragenen Noten. Exportiere den alten Plan vorher, wenn du ihn behalten willst."
        confirmLabel="Ersetzen"
        destructive
        onConfirm={create}
      />
    </main>
  )
}
