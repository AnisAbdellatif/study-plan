import { formatTerm, type Plan, resetPlan, setStartTerm } from '@study-plan/shared'
import { useNavigate } from '@tanstack/react-router'
import { Download, EllipsisVertical, Moon, Sun, Upload } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isLocale, LOCALES } from '../i18n/config.ts'
import { currentLocale } from '../i18n/index.ts'
import { setTheme, useTheme } from '../lib/theme.ts'
import { useGuestStore } from '../store/guest-store.ts'
import { AccountButton } from './account-button.tsx'
import { AdminButton } from './admin-button.tsx'
import { useAnnounce } from './announcer.tsx'
import { ImportGradesDialog } from './board/import-grades-dialog.tsx'
import { ShareDialog } from './board/share-dialog.tsx'
import { StartTermDialog } from './board/start-term-dialog.tsx'
import { BrandMark } from './brand-logo.tsx'
import { useImportPlan } from './import-plan-button.tsx'
import { LanguageMenu } from './language-menu.tsx'
import { PlanSwitcher } from './plan-switcher.tsx'
import { ThemeToggle } from './theme-toggle.tsx'
import { Button } from './ui/button.tsx'
import { ConfirmDialog } from './ui/dialog.tsx'
import {
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from './ui/menu.tsx'
import { useExportPlan } from './use-export-plan.ts'

export function AppHeader({ plan }: { plan: Plan }) {
  const { t, i18n } = useTranslation(['board', 'common', 'dialogs'])
  const theme = useTheme()
  const importer = useImportPlan()
  const locale = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'de'
  const store = useGuestStore()
  const navigate = useNavigate()
  const announce = useAnnounce()
  const exportPlan = useExportPlan()
  const [confirmReset, setConfirmReset] = useState(false)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [clearResults, setClearResults] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [startTermOpen, setStartTermOpen] = useState(false)

  return (
    <header className="space-y-3">
      {/* Brand and actions share the first row; the plan name gets the full width below, so phones don't cut it. */}
      <div className="flex items-center justify-between gap-2">
        <span className="sm:hidden">
          <BrandMark />
        </span>
        <span className="hidden sm:block">
          <BrandMark size="lg" />
        </span>
        <div className="flex items-center gap-1 sm:gap-2 print:hidden">
          {/* On phones language, theme, export and import live in the menu instead. */}
          <span className="hidden sm:contents">
            <LanguageMenu />
            <ThemeToggle />
          </span>
          <AdminButton labelClassName="sr-only sm:not-sr-only" />
          <AccountButton />
          <span className="hidden sm:contents">
            <Button onClick={() => exportPlan(plan)}>
              <Download aria-hidden className="size-4" />
              {t('header.export')}
            </Button>
            <Button onClick={importer.open}>
              <Upload aria-hidden className="size-4" />
              {t('dialogs:importPlan.label')}
            </Button>
          </span>
          <MenuRoot>
            <MenuTrigger render={<Button variant="ghost" size="icon" aria-label={t('header.moreActions')} />}>
              <EllipsisVertical aria-hidden className="size-4" />
            </MenuTrigger>
            <MenuContent>
              <div className="sm:hidden">
                <MenuItem onClick={() => exportPlan(plan)}>
                  <Download aria-hidden className="size-4" />
                  {t('header.export')}
                </MenuItem>
                <MenuItem onClick={importer.open}>
                  <Upload aria-hidden className="size-4" />
                  {t('dialogs:importPlan.label')}
                </MenuItem>
                <MenuSeparator />
              </div>
              <MenuItem onClick={() => setImportOpen(true)}>{t('header.importGrades')}</MenuItem>
              <MenuItem onClick={() => setShareOpen(true)}>{t('header.sharePlan')}</MenuItem>
              <MenuItem onClick={() => window.print()}>{t('header.print')}</MenuItem>
              <MenuItem onClick={() => void navigate({ to: '/plan/update' })}>
                {t('header.updateProgramme')}
              </MenuItem>
              <MenuItem onClick={() => setStartTermOpen(true)}>{t('header.changeStartTerm')}</MenuItem>
              <MenuSeparator />
              <MenuItem
                onClick={() => {
                  setClearResults(false)
                  setRestoreOpen(true)
                }}
              >
                {t('header.restoreDefault')}
              </MenuItem>
              <MenuItem className="text-red-700 dark:text-red-400" onClick={() => setConfirmReset(true)}>
                {t('header.startOver')}
              </MenuItem>
              <div className="sm:hidden">
                <MenuSeparator />
                <MenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                  {theme === 'dark' ? (
                    <Sun aria-hidden className="size-4" />
                  ) : (
                    <Moon aria-hidden className="size-4" />
                  )}
                  {t(theme === 'dark' ? 'common:theme.toLight' : 'common:theme.toDark')}
                </MenuItem>
                <MenuGroup>
                  <MenuGroupLabel>{t('common:language.label')}</MenuGroupLabel>
                  <MenuRadioGroup
                    value={locale}
                    onValueChange={(value: unknown) => {
                      if (isLocale(value)) void i18n.changeLanguage(value)
                    }}
                  >
                    {LOCALES.map((option) => (
                      <MenuRadioItem key={option} value={option} lang={option}>
                        {t(`common:language.${option}`)}
                      </MenuRadioItem>
                    ))}
                  </MenuRadioGroup>
                </MenuGroup>
              </div>
            </MenuContent>
          </MenuRoot>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold break-words sm:truncate sm:text-xl">{plan.name}</h1>
          <p className="text-sm text-zinc-600 sm:truncate dark:text-zinc-400">
            {plan.preset.universityName} · {plan.preset.poVersion}
          </p>
        </div>
        <div className="shrink-0 print:hidden">
          <PlanSwitcher plan={plan} />
        </div>
      </div>
      <div
        aria-hidden
        className="h-px bg-linear-to-r from-indigo-500/60 via-sky-400/40 to-transparent print:hidden dark:from-indigo-400/60 dark:via-sky-400/30"
      />
      {importer.element}
      <ImportGradesDialog plan={plan} open={importOpen} onOpenChange={setImportOpen} />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} />
      <StartTermDialog
        open={startTermOpen}
        onOpenChange={setStartTermOpen}
        plan={plan}
        onSave={(term) => {
          store.updatePlan((current) => setStartTerm(current, term))
          setStartTermOpen(false)
          announce(t('startTerm.changed', { term: formatTerm(term, currentLocale()) }))
        }}
      />
      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title={t('header.restoreDefaultTitle')}
        description={
          <>
            <span className="block">{t('header.restoreDefaultDescription')}</span>
            <label className="mt-3 flex items-start gap-2 text-zinc-900 dark:text-zinc-100">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-indigo-600"
                checked={clearResults}
                onChange={(event) => setClearResults(event.target.checked)}
              />
              <span>{t('header.restoreDefaultClearResults')}</span>
            </label>
          </>
        }
        confirmLabel={t('header.restoreDefaultConfirm')}
        destructive={clearResults}
        onConfirm={() => {
          store.updatePlan((current) => resetPlan(current, { clearResults }))
          announce(t(clearResults ? 'header.restoreDefaultDoneCleared' : 'header.restoreDefaultDone'))
        }}
      />
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
