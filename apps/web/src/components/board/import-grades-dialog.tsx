import {
  currentResult,
  fitImportResult,
  type ImportRow,
  mergeImportAttempts,
  mergeImportResults,
  type Plan,
  parseGradeImport,
  type ResultEntry,
  setModuleAttempts,
} from '@study-plan/shared'
import { type ChangeEvent, useId, useMemo, useState } from 'react'
import { cn } from '../../lib/cn.ts'
import { formatGrade } from '../../lib/format.ts'
import { useGuestStore } from '../../store/guest-store.ts'
import { useAnnounce } from '../announcer.tsx'
import { Button } from '../ui/button.tsx'
import { Dialog } from '../ui/dialog.tsx'

const describeResult = (result: ResultEntry | null): string => {
  if (!result) return '–'
  switch (result.kind) {
    case 'graded':
      return formatGrade(result.grade)
    case 'passed':
      return 'bestanden'
    case 'failed':
      return 'nicht bestanden'
    case 'open':
      return '–'
  }
}

const sameResult = (a: ResultEntry, b: ResultEntry) => JSON.stringify(a) === JSON.stringify(b)

export function ImportGradesDialog({
  plan,
  open,
  onOpenChange,
}: {
  plan: Plan
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const store = useGuestStore()
  const announce = useAnnounce()
  const textId = useId()
  const [text, setText] = useState('')
  const [choices, setChoices] = useState<Record<number, string>>({})

  const modules = useMemo(() => new Map(plan.modules.map((module) => [module.code, module])), [plan.modules])
  const sortedModules = useMemo(
    () => [...plan.modules].sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [plan.modules],
  )
  const rows = useMemo(() => (text.trim() ? parseGradeImport(text, plan) : []), [text, plan])
  const relevant = rows.filter((row) => row.status !== 'no_result')
  const skipped = rows.length - relevant.length

  const moduleCodeFor = (row: ImportRow) => choices[row.line] ?? row.moduleCode ?? ''
  const fittedResult = (row: ImportRow) => {
    const module = modules.get(moduleCodeFor(row))
    return module && row.result ? fitImportResult(row.result, module, plan) : null
  }

  const assignments = relevant.flatMap((row) => {
    const result = fittedResult(row)
    const moduleCode = moduleCodeFor(row)
    return result && moduleCode ? [{ moduleCode, result }] : []
  })
  const merged = mergeImportResults(assignments, plan)
  const overwrites = [...merged].filter(([code, entry]) => {
    const module = modules.get(code)
    if (!module) return false
    const existing = currentResult(module)
    return existing.kind !== 'open' && !sameResult(existing, entry)
  }).length

  const reset = () => {
    setText('')
    setChoices({})
  }

  const apply = () => {
    store.updatePlan((current) =>
      [...mergeImportAttempts(assignments, current)].reduce(
        (next, [code, attempts]) => setModuleAttempts(next, code, attempts),
        current,
      ),
    )
    announce(`${merged.size} ${merged.size === 1 ? 'Ergebnis' : 'Ergebnisse'} importiert`)
    reset()
    onOpenChange(false)
  }

  const loadFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) {
      setChoices({})
      setText(await file.text())
    }
  }

  return (
    <Dialog
      size="lg"
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title="Noten importieren"
      description="Kopiere die Tabelle aus deinem Notenspiegel oder lade eine CSV-Datei. Eine Prüfung pro Zeile, mit Modulname und Note oder „bestanden“. Du siehst alles, bevor etwas übernommen wird."
    >
      <div className="space-y-3">
        <div>
          <label htmlFor={textId} className="block text-sm font-medium">
            Text aus dem Notenspiegel
          </label>
          <textarea
            id={textId}
            rows={5}
            value={text}
            onChange={(event) => {
              setChoices({})
              setText(event.target.value)
            }}
            placeholder={'Grundlagen digitaler Systeme\t2,3\tbestanden\nProgrammieren I\t\tbestanden'}
            className="mt-1 w-full rounded-lg bg-white px-3 py-2 font-mono text-xs ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700"
          />
          <label className="mt-1 inline-flex cursor-pointer items-center gap-2 text-xs text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300">
            Oder CSV-Datei auswählen
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="sr-only"
              onChange={loadFile}
            />
          </label>
        </div>

        {relevant.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-600 dark:text-zinc-400">
                <tr>
                  <th className="py-1 pr-2 font-medium">Zeile</th>
                  <th className="py-1 pr-2 font-medium">Modul</th>
                  <th className="py-1 pr-2 font-medium">Ergebnis</th>
                  <th className="py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {relevant.map((row) => {
                  const fitted = fittedResult(row)
                  const chosen = moduleCodeFor(row)
                  const status = !chosen
                    ? 'Bitte Modul wählen'
                    : fitted
                      ? 'Wird übernommen'
                      : 'Passt nicht zum Modul'
                  return (
                    <tr key={row.line} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                      <td className="max-w-[14rem] truncate py-1.5 pr-2 font-mono text-xs" title={row.text}>
                        {row.text}
                      </td>
                      <td className="py-1.5 pr-2">
                        <select
                          aria-label={`Modul für Zeile ${row.line}`}
                          value={chosen}
                          onChange={(event) =>
                            setChoices((previous) => ({ ...previous, [row.line]: event.target.value }))
                          }
                          className="h-8 w-full max-w-[16rem] rounded-md bg-white px-2 text-sm ring-1 ring-zinc-300 ring-inset dark:bg-zinc-950 dark:ring-zinc-700"
                        >
                          <option value="">– ignorieren –</option>
                          {row.candidates.length > 0 ? (
                            <optgroup label="Passende Module">
                              {row.candidates.map((code) => (
                                <option key={code} value={code}>
                                  {modules.get(code)?.name ?? code}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                          <optgroup label="Alle Module">
                            {sortedModules.map((module) => (
                              <option key={module.code} value={module.code}>
                                {module.name}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums">{describeResult(fitted ?? row.result)}</td>
                      <td
                        className={cn(
                          'py-1.5 text-xs',
                          fitted && chosen
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400',
                        )}
                      >
                        {status}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {rows.length > 0 ? (
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {skipped > 0 ? `${skipped} ${skipped === 1 ? 'Zeile' : 'Zeilen'} ohne Note übersprungen. ` : ''}
            Mehrere Zeilen zum selben Modul gelten als Versuche und ersetzen die bisher eingetragenen. Von
            mehreren bestandenen zählt das beste.
            {overwrites > 0
              ? ` ${overwrites} bereits eingetragene ${overwrites === 1 ? 'Ergebnis wird' : 'Ergebnisse werden'} ersetzt.`
              : ''}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            onClick={() => {
              reset()
              onOpenChange(false)
            }}
          >
            Abbrechen
          </Button>
          <Button variant="primary" disabled={merged.size === 0} onClick={apply}>
            {merged.size === 1 ? '1 Ergebnis übernehmen' : `${merged.size} Ergebnisse übernehmen`}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
