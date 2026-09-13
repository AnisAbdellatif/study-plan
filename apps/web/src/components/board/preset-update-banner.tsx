import {
  applyPresetUpdate,
  diffPresetUpdate,
  hasPresetChanges,
  type ModuleField,
  type Plan,
  type PresetInfo,
} from '@study-plan/shared'
import { useMemo, useState } from 'react'
import { findPreset } from '../../presets.ts'
import { useGuestStore } from '../../store/guest-store.ts'
import { useAnnounce } from '../announcer.tsx'
import { Button } from '../ui/button.tsx'
import { Dialog } from '../ui/dialog.tsx'

const DISMISS_KEY = 'study-plan:preset-update-dismissed'

const FIELD_LABEL: Record<ModuleField, string> = {
  name: 'Name',
  credits: 'Leistungspunkte',
  grading: 'Benotung',
  countsTowardAverage: 'Zählt zum Schnitt',
  category: 'Bereich',
  offering: 'Turnus',
  typicalSemester: 'Empfohlenes Semester',
  prerequisites: 'Voraussetzungen',
  requiresCredits: 'Mindest-LP',
}

const INFO_LABEL: Record<keyof PresetInfo, string> = {
  id: 'Vorlage',
  universityName: 'Hochschule',
  programmeName: 'Studiengang',
  degree: 'Abschluss',
  poVersion: 'Prüfungsordnung',
  handbookVersion: 'Modulhandbuch',
  standardSemesters: 'Regelstudienzeit',
  totalCredits: 'Gesamt-LP',
  creditLabel: 'LP-Bezeichnung',
  codesAreOfficial: 'Modulnummern',
  withdrawalDaysBeforeExam: 'Abmeldefrist',
}

/** FNV-1a, enough to remember which set of changes was dismissed. */
function fingerprint(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_KEY)
  } catch {
    return null
  }
}

function writeDismissed(value: string): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, value)
  } catch {
    // Without storage the banner simply shows again next time.
  }
}

export function PresetUpdateBanner({ plan }: { plan: Plan }) {
  const store = useGuestStore()
  const announce = useAnnounce()
  const entry = findPreset(plan.preset.id)
  const diff = useMemo(() => (entry ? diffPresetUpdate(plan, entry.preset) : null), [plan, entry])
  const signature = useMemo(
    () => (diff ? `${plan.preset.id}:${fingerprint(JSON.stringify(diff))}` : ''),
    [diff, plan.preset.id],
  )
  const [dismissed, setDismissed] = useState(readDismissed)
  const [open, setOpen] = useState(false)

  if (!entry || !diff || !hasPresetChanges(diff) || dismissed === signature) return null

  const apply = () => {
    store.updatePlan((current) => applyPresetUpdate(current, entry.preset))
    setOpen(false)
    announce('Plan auf die aktualisierte Vorlage umgestellt')
  }

  return (
    <>
      <div
        role="status"
        className="flex flex-col gap-3 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-950 ring-1 ring-sky-200 sm:flex-row sm:items-center dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-900"
      >
        <p className="flex-1">
          Für {entry.preset.programme.name} gibt es eine aktualisierte Vorlage ({entry.preset.poVersion},{' '}
          {entry.preset.handbookVersion}). Sieh dir die Änderungen an, bevor du deinen Plan umstellst.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
            Änderungen ansehen
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              writeDismissed(signature)
              setDismissed(signature)
            }}
          >
            Später
          </Button>
        </div>
      </div>

      <Dialog
        size="lg"
        open={open}
        onOpenChange={setOpen}
        title="Vorlage aktualisieren"
        description="Deine Platzierungen, Ergebnisse und Prüfungstermine bleiben erhalten, wo sie noch passen."
      >
        <div className="space-y-4 text-sm [&_h3]:font-semibold [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:space-y-0.5 [&_ul]:pl-5">
          {diff.added.length > 0 ? (
            <section>
              <h3>Neue Module ({diff.added.length})</h3>
              <p className="text-zinc-600 dark:text-zinc-400">Sie landen unter „Nicht eingeplant“.</p>
              <ul>
                {diff.added.map((module) => (
                  <li key={module.code}>{module.name}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {diff.removed.length > 0 ? (
            <section>
              <h3>Entfallene Module ({diff.removed.length})</h3>
              <ul>
                {diff.removed.map((module) => (
                  <li key={module.code}>
                    {module.name}:{' '}
                    {module.kept
                      ? 'bleibt mit deinem Ergebnis im Plan, zählt aber nicht mehr zum Schnitt'
                      : 'wird aus dem Plan entfernt'}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {diff.changed.length > 0 ? (
            <section>
              <h3>Geänderte Module ({diff.changed.length})</h3>
              <ul>
                {diff.changed.map((change) => (
                  <li key={change.code}>
                    {change.name}
                    {change.fields.length > 0
                      ? `: ${change.fields.map((field) => FIELD_LABEL[field]).join(', ')}`
                      : ''}
                    {change.resultCleared ? (
                      <span className="text-amber-700 dark:text-amber-400">
                        {' '}
                        (dein eingetragenes Ergebnis passt nicht mehr und wird entfernt)
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {diff.info.length > 0 || diff.rulesChanged || diff.areasChanged || diff.targetGradeCleared ? (
            <section>
              <h3>Allgemein</h3>
              <ul>
                {diff.info.map((key) => (
                  <li key={key}>{INFO_LABEL[key]}</li>
                ))}
                {diff.rulesChanged ? <li>Regeln zur Berechnung des Schnitts</li> : null}
                {diff.areasChanged ? <li>Bereiche und ihre Leistungspunkte</li> : null}
                {diff.targetGradeCleared ? (
                  <li>Dein Zielschnitt ist nicht mehr zulässig und wird entfernt</li>
                ) : null}
              </ul>
            </section>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button variant="primary" onClick={apply}>
              Plan aktualisieren
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
