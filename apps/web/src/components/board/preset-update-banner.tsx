import { applyPresetUpdate, diffPresetUpdate, hasPresetChanges, type Plan } from '@study-plan/shared'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { findPreset } from '../../presets.ts'
import { useGuestStore } from '../../store/guest-store.ts'
import { useAnnounce } from '../announcer.tsx'
import { Button } from '../ui/button.tsx'
import { Dialog } from '../ui/dialog.tsx'
import { PresetDiffList } from './preset-diff.tsx'

const DISMISS_KEY = 'study-plan:preset-update-dismissed'

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
  const { t } = useTranslation(['dialogs', 'common'])
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
    announce(t('presetUpdate.announced'))
  }

  return (
    <>
      <div
        role="status"
        className="flex flex-col gap-3 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-950 ring-1 ring-sky-200 sm:flex-row sm:items-center dark:bg-sky-950/40 dark:text-sky-100 dark:ring-sky-900"
      >
        <p className="flex-1">
          {t('presetUpdate.banner', {
            programme: entry.preset.programme.name,
            poVersion: entry.preset.poVersion,
            handbookVersion: entry.preset.handbookVersion,
          })}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
            {t('presetUpdate.review')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              writeDismissed(signature)
              setDismissed(signature)
            }}
          >
            {t('presetUpdate.later')}
          </Button>
        </div>
      </div>

      <Dialog
        size="lg"
        open={open}
        onOpenChange={setOpen}
        title={t('presetUpdate.title')}
        description={t('presetUpdate.description')}
      >
        <div className="space-y-4 text-sm">
          <PresetDiffList diff={diff} />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>{t('common:actions.cancel')}</Button>
            <Button variant="primary" onClick={apply}>
              {t('presetUpdate.apply')}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
