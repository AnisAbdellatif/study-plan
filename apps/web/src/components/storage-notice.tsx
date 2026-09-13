import type { Plan } from '@study-plan/shared'
import { Download, TriangleAlert } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { cn } from '../lib/cn.ts'
import { useGuestState } from '../store/guest-store.ts'
import { Button } from './ui/button.tsx'
import { useExportPlan } from './use-export-plan.ts'

const EXPORT_REMINDER_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

function Notice({
  tone,
  children,
  actions,
}: {
  tone: 'warning' | 'danger'
  children: ReactNode
  actions: ReactNode
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex flex-col gap-3 rounded-lg px-4 py-3 text-sm sm:flex-row sm:items-center',
        tone === 'danger'
          ? 'bg-red-50 text-red-900 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900'
          : 'bg-amber-50 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900',
      )}
    >
      <TriangleAlert aria-hidden className="hidden size-4 shrink-0 sm:block" />
      <p className="flex-1">{children}</p>
      <div className="flex gap-2">{actions}</div>
    </div>
  )
}

/** Guest data lives only in this browser. Warn when saving fails and nudge regular exports. */
export function StorageNotice({ plan }: { plan: Plan }) {
  const { saveFailed, lastExportedAt } = useGuestState()
  const exportPlan = useExportPlan()
  const [dismissed, setDismissed] = useState(false)

  const exportButton = (
    <Button size="sm" variant="secondary" onClick={() => exportPlan(plan)}>
      <Download aria-hidden className="size-4" />
      Exportieren
    </Button>
  )

  if (saveFailed) {
    return (
      <Notice tone="danger" actions={exportButton}>
        Dein Plan konnte nicht im Browser gespeichert werden. Exportiere ihn als Datei, damit nichts verloren
        geht.
      </Notice>
    )
  }

  const exportIsStale =
    lastExportedAt === null || Date.now() - Date.parse(lastExportedAt) > EXPORT_REMINDER_DAYS * DAY_MS
  const hasChanges = plan.updatedAt !== plan.createdAt
  if (dismissed || !exportIsStale || !hasChanges) return null

  return (
    <Notice
      tone="warning"
      actions={
        <>
          {exportButton}
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
            Später
          </Button>
        </>
      }
    >
      Ohne Konto liegt dein Plan nur in diesem Browser. Manche Browser, etwa Safari, löschen Daten von Seiten,
      die du länger nicht besucht hast. Sichere deinen Plan regelmäßig als Datei.
    </Notice>
  )
}
