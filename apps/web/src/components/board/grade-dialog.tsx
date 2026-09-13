import {
  type AttemptEntry,
  attemptEntries,
  attemptStatus,
  findModule,
  type GradeRules,
  type Plan,
  type PlanModule,
  setModuleAttempts,
} from '@study-plan/shared'
import { Plus, X } from 'lucide-react'
import { type FormEvent, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCredits, formatGrade } from '../../lib/format.ts'
import { Button } from '../ui/button.tsx'
import { Dialog } from '../ui/dialog.tsx'

const encode = (entry: AttemptEntry): string =>
  entry.kind === 'graded' ? `grade:${entry.grade}` : entry.kind

const KINDS = ['passed', 'failed', 'registered', 'absent', 'withdrawn'] as const

function decode(value: string, date: string | undefined): AttemptEntry | null {
  const extra = date ? { date } : {}
  if (value.startsWith('grade:'))
    return { kind: 'graded', grade: Number(value.slice('grade:'.length)), ...extra }
  const kind = KINDS.find((candidate) => candidate === value)
  return kind ? { kind, ...extra } : null
}

function GradeOption({ grade, passThreshold }: { grade: number; passThreshold: number }) {
  const { t } = useTranslation(['dialogs', 'common'])
  return (
    <option value={`grade:${grade}`}>
      {formatGrade(grade)}
      {grade > passThreshold ? ` ${t('grade.failedSuffix')}` : ''}
    </option>
  )
}

/** Standard exam grade steps first; composite module grades (e.g. 1,2 from weighted parts) in their own group. */
function GradeOptions({ rules }: { rules: GradeRules }) {
  const { t } = useTranslation(['dialogs', 'common'])
  const option = (grade: number) => (
    <GradeOption key={grade} grade={grade} passThreshold={rules.passThreshold} />
  )
  const standard = rules.standardGrades
  if (!standard?.length) return <>{rules.allowedValues.map(option)}</>
  const composite = rules.allowedValues.filter((grade) => !standard.includes(grade))
  return (
    <>
      <optgroup label={t('grade.standardGrades')}>{standard.map(option)}</optgroup>
      {composite.length > 0 ? (
        <optgroup label={t('grade.compositeGrades')}>{composite.map(option)}</optgroup>
      ) : null}
    </>
  )
}

interface Row {
  key: number
  value: string
  /** Kept from an existing attempt; the dialog does not edit it. */
  date?: string
}

const inputClass =
  'h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700'

function AttemptSummary({
  module,
  plan,
  entries,
}: {
  module: PlanModule
  plan: Plan
  entries: AttemptEntry[]
}) {
  const { t } = useTranslation(['dialogs', 'common'])
  const status = useMemo(() => {
    const next = setModuleAttempts(plan, module.code, entries)
    return attemptStatus(findModule(next, module.code), next)
  }, [plan, module.code, entries])

  const lines: { text: string; warning: boolean }[] = []
  if (status.maxAttempts !== null && !status.passed) {
    if (status.exhausted) {
      lines.push({ text: t('attempts.exhausted', { count: status.maxAttempts }), warning: true })
    } else {
      const used = t('attempts.used', { used: status.used, count: status.maxAttempts })
      const supplementary = plan.preset.supplementaryExamOnLastAttempt
        ? ` ${
            module.grading === 'graded'
              ? t('attempts.supplementaryGraded', { grade: formatGrade(4) })
              : t('attempts.supplementaryPassFail')
          }`
        : ''
      lines.push(
        status.lastAttempt
          ? { text: `${t('attempts.lastAttempt', { used })}${supplementary}`, warning: true }
          : { text: used, warning: false },
      )
    }
  }
  if (status.retakenAfterPass) {
    lines.push({
      text: t('attempts.retakenAfterPass'),
      warning: true,
    })
  }
  if (lines.length === 0) return null
  return (
    <div className="mt-3 space-y-1 text-sm" data-testid="attempt-summary">
      {lines.map((line) => (
        <p
          key={line.text}
          className={line.warning ? 'text-amber-800 dark:text-amber-300' : 'text-zinc-600 dark:text-zinc-400'}
        >
          {line.text}
        </p>
      ))}
    </div>
  )
}

interface GradeFormProps {
  module: PlanModule
  plan: Plan
  onSave: (entries: AttemptEntry[], examDate: string | null) => void
  onCancel: () => void
}

function GradeForm({ module, plan, onSave, onCancel }: GradeFormProps) {
  const { t } = useTranslation(['dialogs', 'common'])
  const baseId = useId()
  const dateId = useId()
  const [rows, setRows] = useState<Row[]>(() => {
    const existing = attemptEntries(module)
    return existing.length > 0
      ? existing.map((entry, index) => ({ key: index, value: encode(entry), date: entry.date }))
      : [{ key: 0, value: 'open' }]
  })
  const [examDate, setExamDate] = useState(module.examDate ?? '')
  const entries = useMemo(() => rows.flatMap((row) => decode(row.value, row.date) ?? []), [rows])
  const graded = module.grading === 'graded'
  const base = graded ? t('grade.grade') : t('grade.result')
  // Custom modules have internal codes only.
  const showCode = (plan.preset.codesAreOfficial ?? true) && !module.custom

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSave(entries, examDate === '' ? null : examDate)
  }

  const update = (key: number, value: string) =>
    setRows((current) => current.map((row) => (row.key === key ? { key, value } : row)))
  const addRow = () =>
    setRows((current) => [...current, { key: Math.max(...current.map((row) => row.key)) + 1, value: 'open' }])
  const removeRow = (key: number) => setRows((current) => current.filter((row) => row.key !== key))

  return (
    <form onSubmit={submit}>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {showCode ? `${module.code} · ` : ''}
        {formatCredits(module.credits)} {plan.preset.creditLabel}
        {module.countsTowardAverage ? '' : ` · ${t('grade.notCounted')}`}
      </p>
      <ol className="mt-4 space-y-3">
        {rows.map((row, index) => {
          const id = `${baseId}-${row.key}`
          const label =
            rows.length === 1
              ? base
              : t(graded ? 'grade.gradeInAttempt' : 'grade.resultInAttempt', { number: index + 1 })
          return (
            <li key={row.key}>
              <label htmlFor={id} className="block text-sm font-medium">
                {label}
              </label>
              <div className="mt-1 flex gap-2">
                <select
                  id={id}
                  value={row.value}
                  onChange={(event) => update(row.key, event.target.value)}
                  className={inputClass}
                >
                  <option value="open">{t('grade.open')}</option>
                  {graded ? (
                    <GradeOptions rules={plan.rules} />
                  ) : (
                    <>
                      <option value="passed">{t('grade.passed')}</option>
                      <option value="failed">{t('grade.failed')}</option>
                    </>
                  )}
                  <optgroup label={t('grade.withoutResult')}>
                    <option value="registered">{t('grade.registered')}</option>
                    <option value="absent">{t('grade.absent')}</option>
                    <option value="withdrawn">{t('grade.withdrawn')}</option>
                  </optgroup>
                </select>
                {rows.length > 1 ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 self-center"
                    aria-label={t('grade.removeAttempt', { number: index + 1 })}
                    onClick={() => removeRow(row.key)}
                  >
                    <X aria-hidden className="size-4" />
                  </Button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
      <Button
        size="sm"
        variant="ghost"
        className="mt-2 -ml-2"
        disabled={rows.at(-1)?.value === 'open'}
        onClick={addRow}
      >
        <Plus aria-hidden className="size-4" />
        {t('grade.addAttempt')}
      </Button>
      <AttemptSummary module={module} plan={plan} entries={entries} />
      <label htmlFor={dateId} className="mt-4 block text-sm font-medium">
        {t('grade.examDate')}{' '}
        <span className="font-normal text-zinc-500 dark:text-zinc-400">{t('grade.optional')}</span>
      </label>
      <input
        id={dateId}
        type="date"
        value={examDate}
        onChange={(event) => setExamDate(event.target.value)}
        className={inputClass}
      />
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t('common:actions.cancel')}
        </Button>
        <Button variant="primary" type="submit">
          {t('common:actions.save')}
        </Button>
      </div>
    </form>
  )
}

export interface GradeDialogProps {
  module: PlanModule | null
  plan: Plan
  onSave: (code: string, entries: AttemptEntry[], examDate: string | null) => void
  onClose: () => void
}

export function GradeDialog({ module, plan, onSave, onClose }: GradeDialogProps) {
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
          plan={plan}
          onCancel={onClose}
          onSave={(entries, examDate) => onSave(module.code, entries, examDate)}
        />
      ) : null}
    </Dialog>
  )
}
