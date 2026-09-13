import { addSemester, type Plan, removeLastSemester } from '@study-plan/shared'
import { useNavigate } from '@tanstack/react-router'
import { Download, EllipsisVertical } from 'lucide-react'
import { useState } from 'react'
import { useGuestStore } from '../store/guest-store.ts'
import { useAnnounce } from './announcer.tsx'
import { ImportPlanButton } from './import-plan-button.tsx'
import { Button } from './ui/button.tsx'
import { ConfirmDialog } from './ui/dialog.tsx'
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from './ui/menu.tsx'
import { useExportPlan } from './use-export-plan.ts'

export function AppHeader({ plan }: { plan: Plan }) {
  const store = useGuestStore()
  const navigate = useNavigate()
  const announce = useAnnounce()
  const exportPlan = useExportPlan()
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <header className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium tracking-wide text-indigo-600 uppercase dark:text-indigo-400">
          Studienplaner
        </p>
        <h1 className="truncate text-xl font-semibold">{plan.name}</h1>
        <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">
          {plan.preset.universityName} · {plan.preset.poVersion}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={() => exportPlan(plan)}>
          <Download aria-hidden className="size-4" />
          <span className="sr-only sm:not-sr-only">Exportieren</span>
        </Button>
        <ImportPlanButton labelClassName="sr-only sm:not-sr-only" />
        <MenuRoot>
          <MenuTrigger render={<Button variant="ghost" size="icon" aria-label="Weitere Aktionen" />}>
            <EllipsisVertical aria-hidden className="size-4" />
          </MenuTrigger>
          <MenuContent>
            <MenuItem
              onClick={() => {
                store.updatePlan(addSemester)
                announce('Semester hinzugefügt')
              }}
            >
              Semester hinzufügen
            </MenuItem>
            <MenuItem
              disabled={plan.semesters.length <= 1}
              onClick={() => {
                store.updatePlan(removeLastSemester)
                announce('Letztes Semester entfernt, seine Module sind jetzt nicht eingeplant')
              }}
            >
              Letztes Semester entfernen
            </MenuItem>
            <MenuSeparator />
            <MenuItem className="text-red-700 dark:text-red-400" onClick={() => setConfirmReset(true)}>
              Neu beginnen…
            </MenuItem>
          </MenuContent>
        </MenuRoot>
      </div>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Plan löschen und neu beginnen?"
        description="Dein Plan und alle eingetragenen Noten werden aus diesem Browser entfernt. Exportiere ihn vorher, wenn du ihn behalten willst."
        confirmLabel="Plan löschen"
        destructive
        onConfirm={() => {
          store.replacePlan(null)
          void navigate({ to: '/start' })
        }}
      />
    </header>
  )
}
