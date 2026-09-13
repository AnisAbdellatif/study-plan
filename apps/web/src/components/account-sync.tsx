import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { currentIntlLocale } from '../i18n/index.ts'
import { planApi } from '../lib/api.ts'
import { authClient } from '../lib/auth-client.ts'
import { PlanSync, type SyncState } from '../lib/plan-sync.ts'
import { type StorageLike, useGuestState, useGuestStore } from '../store/guest-store.ts'
import { Button } from './ui/button.tsx'
import { Dialog } from './ui/dialog.tsx'

export interface AccountUser {
  id: string
  email: string
  /** 'user', 'admin' or 'superadmin'; the superadmin account can't be deleted. */
  role?: string | null
}

interface AccountSyncValue {
  sync: PlanSync
  state: SyncState
  user: AccountUser | null
  sessionPending: boolean
}

const AccountSyncContext = createContext<AccountSyncValue | null>(null)

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>()
export function formatDateTime(iso: string): string {
  const locale = currentIntlLocale()
  let format = dateTimeFormats.get(locale)
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
    dateTimeFormats.set(locale, format)
  }
  return format.format(new Date(iso))
}

function ChoosePlanDialog({ sync, state }: { sync: PlanSync; state: SyncState }) {
  const { t } = useTranslation('auth')
  const { plan } = useGuestState()
  const [busy, setBusy] = useState(false)
  if (state.kind !== 'choose') return null
  return (
    <Dialog
      open
      onOpenChange={() => {}}
      title={t('sync.choosePlan.title')}
      description={t('sync.choosePlan.description', {
        remote: state.remote.name,
        time: formatDateTime(state.remote.updatedAt),
        local: plan?.name ?? t('sync.choosePlan.fallbackName'),
      })}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await sync.keepBrowserPlan()
            setBusy(false)
          }}
        >
          {t('sync.choosePlan.keepBrowser')}
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => sync.loadAccountPlan()}>
          {t('sync.choosePlan.loadAccount')}
        </Button>
      </div>
    </Dialog>
  )
}

export function AccountSyncProvider({ children }: { children: ReactNode }) {
  const store = useGuestStore()
  const session = authClient.useSession()
  const [sync] = useState(
    () => new PlanSync({ store, api: planApi, storage: browserStorage(), debounceMs: 1000 }),
  )
  const state = useSyncExternalStore(sync.subscribe, sync.getState, sync.getState)
  const sessionUser = session.data?.user
  const user = sessionUser ? { id: sessionUser.id, email: sessionUser.email, role: sessionUser.role } : null
  const userId = user?.id ?? null

  const sessionFailed = session.error !== null
  useEffect(() => {
    // A failed session request (API restarting, offline) says nothing about being signed out.
    // Stopping here would unlink the browser plan from the account and ask again which plan to keep.
    if (session.isPending || sessionFailed) return
    if (userId) void sync.start(userId)
    else sync.stop()
  }, [sync, userId, session.isPending, sessionFailed])

  return (
    <AccountSyncContext.Provider value={{ sync, state, user, sessionPending: session.isPending }}>
      {children}
      <ChoosePlanDialog sync={sync} state={state} />
    </AccountSyncContext.Provider>
  )
}

export function useAccountSync(): AccountSyncValue {
  const value = useContext(AccountSyncContext)
  if (!value) throw new Error('useAccountSync must be used inside AccountSyncProvider')
  return value
}

/** One short line about where the plan is saved. */
export function describeSyncState(state: SyncState, signedIn: boolean): string {
  if (!signedIn) return i18n.t('auth:sync.browserOnly')
  switch (state.kind) {
    case 'signed_out':
    case 'loading':
      return i18n.t('auth:sync.connecting')
    case 'no_account_plan':
      return i18n.t('auth:sync.notInAccount')
    case 'choose':
      return i18n.t('auth:sync.choose')
    case 'saving':
      return i18n.t('auth:sync.saving')
    case 'synced':
      return i18n.t('auth:sync.synced', { time: formatDateTime(state.savedAt) })
    case 'error':
      return i18n.t('auth:sync.failed')
  }
}

/** Banner on the board for the moments that need a decision or an explanation. */
export function AccountSyncBanner() {
  const { t } = useTranslation('auth')
  const { sync, state, user } = useAccountSync()
  const { plan } = useGuestState()
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null)
  if (!user || !plan) return null

  const box =
    'flex flex-col gap-3 rounded-lg px-4 py-3 text-sm sm:flex-row sm:items-center bg-indigo-50 text-indigo-950 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-100 dark:ring-indigo-900'

  // A plan that is not in the account yet is handled by StorageNotice, together with the export reminder.
  if (state.kind === 'error') {
    return (
      <div role="alert" className={box}>
        <p className="flex-1">{t('sync.banner.errorText')}</p>
        <Button size="sm" onClick={() => void sync.retry()}>
          {t('sync.banner.retry')}
        </Button>
      </div>
    )
  }
  if (state.kind === 'synced' && state.notice === 'remote_newer' && dismissedNotice !== state.savedAt) {
    return (
      <div role="status" className={box}>
        <p className="flex-1">{t('sync.banner.remoteNewerText')}</p>
        <Button size="sm" variant="ghost" onClick={() => setDismissedNotice(state.savedAt)}>
          {t('sync.banner.dismiss')}
        </Button>
      </div>
    )
  }
  return null
}
