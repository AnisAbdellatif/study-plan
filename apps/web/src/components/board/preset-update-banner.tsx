import { applyPresetUpdate, diffPresetUpdate, hasPresetChanges, type Plan } from '@study-plan/shared'
import { useMemo, useState } from 'react'
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
        <div className="space-y-4 text-sm">
          <PresetDiffList diff={diff} />
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
