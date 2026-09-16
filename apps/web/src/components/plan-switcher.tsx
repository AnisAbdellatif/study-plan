import type { Plan } from '@study-plan/shared'
import { useNavigate } from '@tanstack/react-router'
import { Check, ChevronsUpDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type PlanOverview, type PlanSummary, planApi } from '../lib/api.ts'
import { useGuestStore } from '../store/guest-store.ts'
import { formatDateTime, useAccountSync } from './account-sync.tsx'
import { useAnnounce } from './announcer.tsx'
import { Button } from './ui/button.tsx'
import { ConfirmDialog, Dialog } from './ui/dialog.tsx'
import {
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from './ui/menu.tsx'
import { LoadingText } from './ui/spinner.tsx'

const inputClass =
  'mt-1 h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700'

/**
 * Switches between the plans saved in the account, renames the open one and starts a new one. Signed-in accounts
 * only: without an account there is just the one plan in this browser.
 */
export function PlanSwitcher({ plan }: { plan: Plan }) {
  const { t } = useTranslation(['board', 'common'])
  const { sync, user } = useAccountSync()
  const store = useGuestStore()
  const navigate = useNavigate()
  const announce = useAnnounce()
  const nameId = useId()
  const [overview, setOverview] = useState<PlanOverview | 'loading' | 'error'>('loading')
  const [switching, setSwitching] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(plan.name)
  /** The plan waiting for the delete confirmation. */
  const [deleting, setDeleting] = useState<PlanSummary | null>(null)

  if (!user) return null
  const activeId = sync.linkedPlanId()
  const loaded = typeof overview === 'object' ? overview : null
  const limit = loaded?.limit ?? null
  const full = loaded !== null && limit !== null && loaded.plans.length >= limit

  const load = () => {
    setOverview('loading')
    planApi
      .overview()
      .then(setOverview)
      .catch(() => setOverview('error'))
  }

  const open = async (id: string, planName: string) => {
    setSwitching(true)
    try {
      await sync.switchTo(id)
      announce(t('plans.switched', { name: planName }))
    } finally {
      setSwitching(false)
    }
  }

  const createNew = async () => {
    setSwitching(true)
    try {
      // Pending edits are saved and the plan detached first, so the next plan becomes a new account plan.
      await sync.startNewPlan()
      store.replacePlan(null)
      await navigate({ to: '/start' })
    } finally {
      setSwitching(false)
    }
  }

  /**
   * Deletes a plan of the account. The open plan goes through the sync, which opens the next plan or leaves the
   * browser empty for a new one; any other plan is simply removed from the account.
   */
  const remove = async (target: PlanSummary) => {
    if (target.id === activeId) {
      setSwitching(true)
      try {
        const next = await sync.deleteCurrentPlan()
        if (next === null) {
          store.replacePlan(null)
          await navigate({ to: '/start' })
          announce(t('header.deleteDone', { name: target.name }))
        } else {
          announce(
            t('header.deleteDoneOpened', { name: target.name, next: store.getState().plan?.name ?? '' }),
          )
        }
      } finally {
        setSwitching(false)
      }
      return
    }
    try {
      await planApi.remove(target.id)
      announce(t('header.deleteDone', { name: target.name }))
    } catch {
      announce(t('plans.deleteError'))
    }
  }

  const rename = (event: FormEvent) => {
    event.preventDefault()
    const next = name.trim()
    if (!next) return
    store.updatePlan((current) => ({ ...current, name: next }))
    setRenaming(false)
    announce(t('plans.renamed', { name: next }))
  }

  return (
    <>
      <MenuRoot
        onOpenChange={(next) => {
          if (next) load()
        }}
      >
        <MenuTrigger
          render={
            <Button
              size="sm"
              variant="ghost"
              loading={switching}
              aria-label={t('plans.switchLabel', { name: plan.name })}
            />
          }
        >
          <ChevronsUpDown aria-hidden className="size-4" />
          <span className="sr-only sm:not-sr-only">{t('plans.switch')}</span>
        </MenuTrigger>
        <MenuContent align="start">
          <MenuGroup>
            <MenuGroupLabel>
              {!loaded
                ? t('plans.title')
                : limit === null
                  ? t('plans.usageUnlimited', { count: loaded.plans.length })
                  : t('plans.usage', { used: loaded.plans.length, limit })}
            </MenuGroupLabel>
            {overview === 'loading' ? (
              <div className="px-3 py-2">
                <LoadingText>{t('common:loading')}</LoadingText>
              </div>
            ) : overview === 'error' ? (
              <p className="px-3 py-2 text-sm text-red-700 dark:text-red-400">{t('plans.loadError')}</p>
            ) : (
              overview.plans.map((item) => {
                const active = item.id === activeId
                return (
                  // Opening and deleting are two menu items side by side, so both work from the keyboard.
                  <div key={item.id} className="flex items-center gap-1">
                    <MenuItem
                      className="min-w-0 flex-1"
                      // A plan not saved in the account yet would be lost by switching away from it.
                      disabled={active || activeId === null}
                      onClick={() => void open(item.id, item.name)}
                    >
                      {active ? (
                        <Check aria-hidden className="size-4 shrink-0" />
                      ) : (
                        <span aria-hidden className="size-4 shrink-0" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate">{item.name}</span>
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                          {t('plans.updated', { time: formatDateTime(item.updatedAt) })}
                        </span>
                      </span>
                    </MenuItem>
                    <MenuItem
                      aria-label={t('plans.deleteLabel', { name: item.name })}
                      title={t('plans.deleteLabel', { name: item.name })}
                      className="shrink-0 text-red-700 dark:text-red-400"
                      onClick={() => setDeleting(item)}
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </MenuItem>
                  </div>
                )
              })
            )}
          </MenuGroup>
          {activeId === null ? (
            <p className="max-w-64 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
              {t('plans.saveFirst')}
            </p>
          ) : null}
          <MenuSeparator />
          <MenuItem
            onClick={() => {
              setName(plan.name)
              setRenaming(true)
            }}
          >
            <Pencil aria-hidden className="size-4" />
            {t('plans.rename')}
          </MenuItem>
          <MenuItem disabled={!loaded || full || activeId === null} onClick={() => void createNew()}>
            <Plus aria-hidden className="size-4" />
            {t('plans.new')}
          </MenuItem>
          {full && limit !== null ? (
            <p className="max-w-64 px-3 pb-2 text-xs text-zinc-600 dark:text-zinc-400">
              {t('plans.limitReached', { limit })}
            </p>
          ) : null}
        </MenuContent>
      </MenuRoot>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('plans.deleteTitle', { name: deleting?.name ?? '' })}
        description={t(
          deleting?.id === activeId ? 'header.deleteDescriptionAccount' : 'plans.deleteDescription',
        )}
        confirmLabel={t('header.deleteConfirm')}
        destructive
        onConfirm={() => {
          if (deleting) void remove(deleting)
        }}
      />
      <Dialog open={renaming} onOpenChange={setRenaming} title={t('plans.renameTitle')}>
        <form onSubmit={rename}>
          <label htmlFor={nameId} className="block text-sm font-medium">
            {t('plans.nameLabel')}
          </label>
          <input
            id={nameId}
            value={name}
            required
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setRenaming(false)}>{t('common:actions.cancel')}</Button>
            <Button type="submit" variant="primary">
              {t('common:actions.save')}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
