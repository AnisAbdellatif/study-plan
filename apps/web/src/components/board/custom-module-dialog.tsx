import {
  type CustomModuleInput,
  customModuleArea,
  customModulesCanCount,
  type Plan,
  PlanError,
} from '@study-plan/shared'
import { type FormEvent, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button.tsx'
import { Dialog } from '../ui/dialog.tsx'

export type CustomModuleTarget = { mode: 'create' } | { mode: 'edit'; code: string }

const OFFERINGS = ['winter', 'summer', 'both', 'irregular'] as const

const inputClass =
  'mt-1 h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 aria-[invalid=true]:ring-red-500 dark:bg-zinc-950 dark:ring-zinc-700'
const errorClass = 'mt-1 text-xs font-medium text-red-700 dark:text-red-400'
const hintClass = 'mt-1 text-xs text-zinc-600 dark:text-zinc-400'

/** Parses "5", "2.5" or "2,5"; the number input may hand over either. */
const parseCredits = (value: string): number => Number(value.trim().replace(',', '.'))
const validCredits = (value: number): boolean =>
  Number.isFinite(value) && value > 0 && Number.isInteger(value * 2)

interface FormProps {
  plan: Plan
  target: CustomModuleTarget
  onSave: (input: CustomModuleInput) => void
  onCancel: () => void
}

function CustomModuleForm({ plan, target, onSave, onCancel }: FormProps) {
  const { t } = useTranslation(['board', 'common'])
  const ids = {
    name: useId(),
    nameError: useId(),
    credits: useId(),
    creditsError: useId(),
    counts: useId(),
    countsHint: useId(),
    area: useId(),
    offering: useId(),
  }
  const existing =
    target.mode === 'edit' ? plan.modules.find((module) => module.code === target.code) : undefined
  const canCount = customModulesCanCount(plan)

  const [name, setName] = useState(existing?.name ?? '')
  const [credits, setCredits] = useState(existing ? String(existing.credits) : '')
  const [grading, setGrading] = useState<CustomModuleInput['grading']>(existing?.grading ?? 'graded')
  const [counts, setCounts] = useState(existing ? existing.countsTowardAverage : canCount)
  const [areaId, setAreaId] = useState<string | null>(existing ? customModuleArea(plan, existing.code) : null)
  const [offering, setOffering] = useState<CustomModuleInput['offering']>(existing?.offering ?? 'both')
  const [showErrors, setShowErrors] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const nameMissing = name.trim() === ''
  const creditsInvalid = !validCredits(parseCredits(credits))
  const countingDisabled = grading !== 'graded' || !canCount

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setShowErrors(true)
    setSaveError(false)
    if (nameMissing || creditsInvalid) return
    try {
      onSave({
        name: name.trim(),
        credits: parseCredits(credits),
        grading,
        countsTowardAverage: !countingDisabled && counts,
        offering,
        areaId,
      })
    } catch (error) {
      if (error instanceof PlanError) setSaveError(true)
      else throw error
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor={ids.name} className="block text-sm font-medium">
        {t('customModule.name')}
      </label>
      <input
        id={ids.name}
        type="text"
        value={name}
        maxLength={200}
        onChange={(event) => setName(event.target.value)}
        aria-invalid={showErrors && nameMissing}
        aria-describedby={showErrors && nameMissing ? ids.nameError : undefined}
        className={inputClass}
      />
      {showErrors && nameMissing ? (
        <p id={ids.nameError} className={errorClass}>
          {t('customModule.nameRequired')}
        </p>
      ) : null}

      <label htmlFor={ids.credits} className="mt-4 block text-sm font-medium">
        {t('customModule.credits')} ({plan.preset.creditLabel})
      </label>
      <input
        id={ids.credits}
        type="number"
        inputMode="decimal"
        min={0.5}
        step={0.5}
        value={credits}
        onChange={(event) => setCredits(event.target.value)}
        aria-invalid={showErrors && creditsInvalid}
        aria-describedby={showErrors && creditsInvalid ? ids.creditsError : undefined}
        className={inputClass}
      />
      {showErrors && creditsInvalid ? (
        <p id={ids.creditsError} className={errorClass}>
          {t('customModule.creditsInvalid')}
        </p>
      ) : null}

      <fieldset className="mt-4">
        <legend className="text-sm font-medium">{t('customModule.grading')}</legend>
        <div className="mt-1 space-y-1 text-sm">
          {(['graded', 'pass_fail'] as const).map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="grading"
                value={value}
                checked={grading === value}
                onChange={() => setGrading(value)}
                className="size-4 accent-indigo-600"
              />
              {value === 'graded' ? t('customModule.graded') : t('customModule.passFail')}
            </label>
          ))}
        </div>
        {existing && existing.attempts.length > 0 && existing.grading !== grading ? (
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            {t('customModule.gradingChangeHint')}
          </p>
        ) : null}
      </fieldset>

      <div className="mt-4">
        <label htmlFor={ids.counts} className="flex items-center gap-2 text-sm">
          <input
            id={ids.counts}
            type="checkbox"
            checked={!countingDisabled && counts}
            disabled={countingDisabled}
            onChange={(event) => setCounts(event.target.checked)}
            aria-describedby={countingDisabled ? ids.countsHint : undefined}
            className="size-4 accent-indigo-600"
          />
          {t('customModule.counts')}
        </label>
        {countingDisabled ? (
          <p id={ids.countsHint} className={hintClass}>
            {canCount ? t('customModule.countsPassFail') : t('customModule.countsUnavailable')}
          </p>
        ) : null}
      </div>

      <label htmlFor={ids.area} className="mt-4 block text-sm font-medium">
        {t('customModule.area')}
      </label>
      <select
        id={ids.area}
        value={areaId ?? ''}
        onChange={(event) => setAreaId(event.target.value === '' ? null : event.target.value)}
        className={inputClass}
      >
        <option value="">{t('customModule.noArea')}</option>
        {plan.areas.map((area) => (
          <option key={area.id} value={area.id}>
            {area.name}
          </option>
        ))}
      </select>

      <label htmlFor={ids.offering} className="mt-4 block text-sm font-medium">
        {t('customModule.offering')}
      </label>
      <select
        id={ids.offering}
        value={offering}
        onChange={(event) => {
          const value = OFFERINGS.find((item) => item === event.target.value)
          if (value) setOffering(value)
        }}
        className={inputClass}
      >
        {OFFERINGS.map((value) => (
          <option key={value} value={value}>
            {t(`customModule.offerings.${value}`)}
          </option>
        ))}
      </select>

      {saveError ? (
        <p role="alert" className="mt-4 text-sm font-medium text-red-700 dark:text-red-400">
          {t('customModule.saveFailed')}
        </p>
      ) : null}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t('common:actions.cancel')}
        </Button>
        <Button variant="primary" type="submit">
          {target.mode === 'create' ? t('customModule.add') : t('common:actions.save')}
        </Button>
      </div>
    </form>
  )
}

export interface CustomModuleDialogProps {
  plan: Plan
  target: CustomModuleTarget | null
  /** May throw a `PlanError`, which the dialog shows as a save error. */
  onSave: (target: CustomModuleTarget, input: CustomModuleInput) => void
  onClose: () => void
}

export function CustomModuleDialog({ plan, target, onSave, onClose }: CustomModuleDialogProps) {
  const { t } = useTranslation('board')
  const existing =
    target?.mode === 'edit'
      ? plan.modules.find((module) => module.code === target.code && module.custom)
      : undefined
  const open = target !== null && (target.mode === 'create' || existing !== undefined)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={existing ? t('customModule.editTitle', { name: existing.name }) : t('customModule.createTitle')}
      description={target?.mode === 'create' ? t('customModule.description') : undefined}
    >
      {open && target ? (
        <CustomModuleForm
          key={target.mode === 'edit' ? target.code : 'create'}
          plan={plan}
          target={target}
          onSave={(input) => onSave(target, input)}
          onCancel={onClose}
        />
      ) : null}
    </Dialog>
  )
}
