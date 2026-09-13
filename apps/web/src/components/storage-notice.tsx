import type { Plan } from '@study-plan/shared'
import { Download, TriangleAlert } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn.ts'
import { useGuestState } from '../store/guest-store.ts'
import { useAccountSync } from './account-sync.tsx'
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
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  )
}

/** Guest data lives only in this browser. Warn when saving fails and nudge regular exports. */
export function StorageNotice({ plan }: { plan: Plan }) {
  const { t } = useTranslation(['board', 'auth'])
  const { saveFailed, lastExportedAt } = useGuestState()
  const exportPlan = useExportPlan()
  const { user, state, sync } = useAccountSync()
  const [dismissed, setDismissed] = useState(false)

  const exportButton = (
    <Button size="sm" variant="secondary" onClick={() => exportPlan(plan)}>
      <Download aria-hidden className="size-4" />
      {t('header.export')}
    </Button>
  )

  if (saveFailed) {
    return (
      <Notice tone="danger" actions={exportButton}>
        {t('storage.saveFailed')}
      </Notice>
    )
  }

  const laterButton = (
    <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
      {t('storage.later')}
    </Button>
  )

  // Signed in, but the plan is not in the account yet: one notice offers both ways to keep it safe.
  if (user !== null && state.kind === 'no_account_plan') {
    if (dismissed) return null
    return (
      <Notice
        tone="warning"
        actions={
          <>
            <Button size="sm" variant="primary" onClick={() => void sync.uploadLocal()}>
              {t('auth:sync.banner.upload')}
            </Button>
            {exportButton}
            {laterButton}
          </>
        }
      >
        {t('storage.accountReminder')}
      </Notice>
    )
  }

  const exportIsStale =
    lastExportedAt === null || Date.now() - Date.parse(lastExportedAt) > EXPORT_REMINDER_DAYS * DAY_MS
  const hasChanges = plan.updatedAt !== plan.createdAt
  // A plan saved in the account survives cleared browser data, so the export reminder is not needed.
  const savedInAccount = user !== null && state.kind === 'synced'
  if (dismissed || !exportIsStale || !hasChanges || savedInAccount) return null

  return (
    <Notice
      tone="warning"
      actions={
        <>
          {exportButton}
          {laterButton}
        </>
      }
    >
      {t('storage.exportReminder')}
    </Notice>
  )
}
