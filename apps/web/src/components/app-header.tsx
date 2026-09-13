import { addSemester, findTransitions, type Plan, removeLastSemester } from '@study-plan/shared'
import { useNavigate } from '@tanstack/react-router'
import { Download, EllipsisVertical } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { presets } from '../presets.ts'
import { useGuestStore } from '../store/guest-store.ts'
import { AccountButton } from './account-button.tsx'
import { useAnnounce } from './announcer.tsx'
import { ImportGradesDialog } from './board/import-grades-dialog.tsx'
import { PoSwitchDialog } from './board/po-switch-dialog.tsx'
import { ShareDialog } from './board/share-dialog.tsx'
import { ImportPlanButton } from './import-plan-button.tsx'
import { LanguageMenu } from './language-menu.tsx'
import { Button } from './ui/button.tsx'
import { ConfirmDialog } from './ui/dialog.tsx'
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from './ui/menu.tsx'
import { useExportPlan } from './use-export-plan.ts'

export function AppHeader({ plan }: { plan: Plan }) {
  const { t } = useTranslation(['board', 'common'])
  const store = useGuestStore()
  const navigate = useNavigate()
  const announce = useAnnounce()
  const exportPlan = useExportPlan()
  const [confirmReset, setConfirmReset] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const transitions = useMemo(
    () =>
      findTransitions(
        plan,
        presets.map((entry) => entry.preset),
      ),
    [plan],
  )

  return (
    <header className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium tracking-wide text-indigo-600 uppercase dark:text-indigo-400">
          {t('common:brand')}
        </p>
        <h1 className="truncate text-xl font-semibold">{plan.name}</h1>
        <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">
          {plan.preset.universityName} · {plan.preset.poVersion}
        </p>
      </div>
      <div className="flex items-center gap-2 print:hidden">
        <LanguageMenu />
        <AccountButton />
        <Button onClick={() => exportPlan(plan)}>
          <Download aria-hidden className="size-4" />
          <span className="sr-only sm:not-sr-only">{t('header.export')}</span>
        </Button>
        <ImportPlanButton labelClassName="sr-only sm:not-sr-only" />
        <MenuRoot>
          <MenuTrigger render={<Button variant="ghost" size="icon" aria-label={t('header.moreActions')} />}>
            <EllipsisVertical aria-hidden className="size-4" />
          </MenuTrigger>
          <MenuContent>
            <MenuItem onClick={() => setImportOpen(true)}>{t('header.importGrades')}</MenuItem>
            <MenuItem onClick={() => setShareOpen(true)}>{t('header.sharePlan')}</MenuItem>
            <MenuItem onClick={() => window.print()}>{t('header.print')}</MenuItem>
            {transitions.length > 0 ? (
              <MenuItem onClick={() => setSwitchOpen(true)}>{t('header.switchPo')}</MenuItem>
            ) : null}
            <MenuSeparator />
            <MenuItem
              onClick={() => {
                store.updatePlan(addSemester)
                announce(t('header.semesterAdded'))
              }}
            >
              {t('header.addSemester')}
            </MenuItem>
            <MenuItem
              disabled={plan.semesters.length <= 1}
              onClick={() => {
                store.updatePlan(removeLastSemester)
                announce(t('header.lastSemesterRemoved'))
              }}
            >
              {t('header.removeLastSemester')}
            </MenuItem>
            <MenuSeparator />
            <MenuItem className="text-red-700 dark:text-red-400" onClick={() => setConfirmReset(true)}>
              {t('header.startOver')}
            </MenuItem>
          </MenuContent>
        </MenuRoot>
      </div>
      <ImportGradesDialog plan={plan} open={importOpen} onOpenChange={setImportOpen} />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
      <PoSwitchDialog plan={plan} transitions={transitions} open={switchOpen} onOpenChange={setSwitchOpen} />
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t('header.resetTitle')}
        description={t('header.resetDescription')}
        confirmLabel={t('header.resetConfirm')}
        destructive
        onConfirm={() => {
          store.replacePlan(null)
          void navigate({ to: '/start' })
        }}
      />
    </header>
  )
}
