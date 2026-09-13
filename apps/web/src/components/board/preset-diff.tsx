import type { ModuleField, PresetDiff, PresetInfo } from '@study-plan/shared'

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
  maxAttempts: 'Anzahl Versuche',
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
  maxAttempts: 'Anzahl Versuche',
  retakePassedExams: 'Notenverbesserung',
  supplementaryExamOnLastAttempt: 'Ergänzungsprüfung im letzten Versuch',
}

/** The changes a preset update or PO switch makes to a plan. */
export function PresetDiffList({ diff }: { diff: PresetDiff }) {
  return (
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
    </div>
  )
}
