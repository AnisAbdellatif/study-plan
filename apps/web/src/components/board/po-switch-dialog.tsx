import { type AvailableTransition, type Plan, previewPoSwitch, switchPo } from '@study-plan/shared'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGuestStore } from '../../store/guest-store.ts'
import { useAnnounce } from '../announcer.tsx'
import { Button } from '../ui/button.tsx'
import { Dialog } from '../ui/dialog.tsx'
import { PresetDiffList } from './preset-diff.tsx'

export interface PoSwitchDialogProps {
  plan: Plan
  transitions: readonly AvailableTransition[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PoSwitchDialog({ plan, transitions, open, onOpenChange }: PoSwitchDialogProps) {
  const { t } = useTranslation(['dialogs', 'common'])
  const store = useGuestStore()
  const announce = useAnnounce()
  const selectId = useId()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const available = transitions.find((entry) => entry.preset.id === selectedId) ?? transitions[0]
  const preview = useMemo(
    () => (available ? previewPoSwitch(plan, available.preset, available.transition) : null),
    [plan, available],
  )

  if (!available || !preview) return null

  const apply = () => {
    store.updatePlan((current) => switchPo(current, available.preset, available.transition))
    onOpenChange(false)
    announce(t('poSwitch.announced', { poVersion: available.preset.poVersion }))
  }

  return (
    <Dialog
      size="lg"
      open={open}
      onOpenChange={onOpenChange}
      title={t('poSwitch.title')}
      description={t('poSwitch.description', {
        from: plan.preset.poVersion,
        to: available.preset.poVersion,
      })}
    >
      <div className="space-y-4 text-sm">
        {transitions.length > 1 ? (
          <div>
            <label htmlFor={selectId} className="block font-medium">
              {t('poSwitch.newPo')}
            </label>
            <select
              id={selectId}
              value={available.preset.id}
              onChange={(event) => setSelectedId(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg bg-white px-3 ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700"
            >
              {transitions.map((entry) => (
                <option key={entry.preset.id} value={entry.preset.id}>
                  {entry.preset.programme.name}, {entry.preset.poVersion}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {available.transition.notes ? (
          <p className="rounded-lg bg-sky-50 px-3 py-2 text-sky-950 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-900">
            {available.transition.notes}
          </p>
        ) : null}
        {preview.mapped.length > 0 ? (
          <section>
            <h3 className="font-semibold">{t('poSwitch.mapped', { number: preview.mapped.length })}</h3>
            <p className="text-zinc-600 dark:text-zinc-400">{t('poSwitch.mappedHint')}</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {preview.mapped.map((module) => (
                <li key={module.from}>
                  {module.fromName} → {module.toName}
                  {module.hasResult ? ` ${t('poSwitch.withResult')}` : ''}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <PresetDiffList diff={preview.diff} />
        <p className="text-zinc-600 dark:text-zinc-400">{t('poSwitch.disclaimer')}</p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => onOpenChange(false)}>{t('common:actions.cancel')}</Button>
          <Button variant="primary" onClick={apply}>
            {t('poSwitch.confirm')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
