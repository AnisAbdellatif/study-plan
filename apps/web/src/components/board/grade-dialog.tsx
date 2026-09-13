import { currentResult, type GradeRules, type PlanModule, type ResultEntry } from '@study-plan/shared'
import { type FormEvent, useId, useState } from 'react'
import { formatCredits, formatGrade } from '../../lib/format.ts'
import { Button } from '../ui/button.tsx'
import { Dialog } from '../ui/dialog.tsx'

const encode = (entry: ResultEntry): string => (entry.kind === 'graded' ? `grade:${entry.grade}` : entry.kind)

function decode(value: string): ResultEntry {
  if (value.startsWith('grade:')) return { kind: 'graded', grade: Number(value.slice('grade:'.length)) }
  if (value === 'passed' || value === 'failed') return { kind: value }
  return { kind: 'open' }
}

function GradeOption({ grade, passThreshold }: { grade: number; passThreshold: number }) {
  return (
    <option value={`grade:${grade}`}>
      {formatGrade(grade)}
      {grade > passThreshold ? ' (nicht bestanden)' : ''}
    </option>
  )
}

/** Standard exam grade steps first; composite module grades (e.g. 1,2 from weighted parts) in their own group. */
function GradeOptions({ rules }: { rules: GradeRules }) {
  const option = (grade: number) => (
    <GradeOption key={grade} grade={grade} passThreshold={rules.passThreshold} />
  )
  const standard = rules.standardGrades
  if (!standard?.length) return <>{rules.allowedValues.map(option)}</>
  const composite = rules.allowedValues.filter((grade) => !standard.includes(grade))
  return (
    <>
      <optgroup label="Notenstufen">{standard.map(option)}</optgroup>
      {composite.length > 0 ? (
        <optgroup label="Zusammengesetzte Modulnoten">{composite.map(option)}</optgroup>
      ) : null}
    </>
  )
}

interface GradeFormProps {
  module: PlanModule
  rules: GradeRules
  creditLabel: string
  showCode: boolean
  onSave: (entry: ResultEntry) => void
  onCancel: () => void
}

function GradeForm({ module, rules, creditLabel, showCode, onSave, onCancel }: GradeFormProps) {
  const id = useId()
  const [value, setValue] = useState(() => encode(currentResult(module)))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSave(decode(value))
  }

  return (
    <form onSubmit={submit}>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {showCode ? `${module.code} · ` : ''}
        {formatCredits(module.credits)} {creditLabel}
        {module.countsTowardAverage ? '' : ' · zählt nicht zum Schnitt'}
      </p>
      <label htmlFor={id} className="mt-4 block text-sm font-medium">
        {module.grading === 'graded' ? 'Note' : 'Ergebnis'}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700"
      >
        <option value="open">Noch offen</option>
        {module.grading === 'graded' ? (
          <GradeOptions rules={rules} />
        ) : (
          <>
            <option value="passed">Bestanden</option>
            <option value="failed">Nicht bestanden</option>
          </>
        )}
      </select>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button variant="primary" type="submit">
          Speichern
        </Button>
      </div>
    </form>
  )
}

export interface GradeDialogProps {
  module: PlanModule | null
  rules: GradeRules
  creditLabel: string
  /** False when the preset's module codes are made up; they are then hidden. */
  showCode: boolean
  onSave: (code: string, entry: ResultEntry) => void
  onClose: () => void
}

export function GradeDialog({ module, rules, creditLabel, showCode, onSave, onClose }: GradeDialogProps) {
  return (
    <Dialog
      open={module !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={module ? module.name : ''}
    >
      {module ? (
        <GradeForm
          key={module.code}
          module={module}
          rules={rules}
          creditLabel={creditLabel}
          showCode={showCode}
          onCancel={onClose}
          onSave={(entry) => onSave(module.code, entry)}
        />
      ) : null}
    </Dialog>
  )
}
