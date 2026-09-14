import type { FormEvent, ReactNode } from 'react'
import { createContext, useContext, useEffect, useId, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { currentIntlLocale } from '../i18n/index.ts'
import { planApi } from '../lib/api.ts'
import { appGradeKeyring } from '../lib/app-grade-keyring.ts'
import { authClient } from '../lib/auth-client.ts'
import { createGradeSealer } from '../lib/grade-sealer.ts'
import { PlanSync, type SyncState } from '../lib/plan-sync.ts'
import { type StorageLike, useGuestState, useGuestStore } from '../store/guest-store.ts'
import { Button } from './ui/button.tsx'
import { ConfirmDialog, Dialog } from './ui/dialog.tsx'

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
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await sync.loadAccountPlan()
            setBusy(false)
          }}
        >
          {t('sync.choosePlan.loadAccount')}
        </Button>
      </div>
    </Dialog>
  )
}

/**
 * Asks for the password when this device can't read the account's grades: after signing in without a password
 * (e.g. the link in the verification e-mail), or when they were encrypted with an earlier password.
 */
function GradesDialog({ sync, state, user }: { sync: PlanSync; state: SyncState; user: AccountUser | null }) {
  const { t } = useTranslation('auth')
  const store = useGuestStore()
  const passwordId = useId()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  if (!user || (state.kind !== 'locked' && state.kind !== 'grades_unreadable')) return null
  const unreadable = state.kind === 'grades_unreadable'

  const unlock = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (unreadable) {
        // An earlier password can't be checked with the account; decrypting shows whether it was the right one.
        await appGradeKeyring.rememberPrevious(password, user.id)
      } else {
        const result = await authClient.signIn.email({ email: user.email, password })
        if (result.error) {
          setError(t('sync.grades.wrongPassword'))
          return
        }
        await appGradeKeyring.remember(password, user.id)
      }
      setPassword('')
      await sync.resume()
      if (sync.getState().kind === 'grades_unreadable') setError(t('sync.grades.stillUnreadable'))
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    setBusy(true)
    await authClient.signOut()
    sync.stop()
    store.replacePlan(null)
    setBusy(false)
  }

  return (
    <Dialog
      open
      onOpenChange={() => {}}
      title={unreadable ? t('sync.grades.unreadableTitle') : t('sync.grades.lockedTitle')}
      description={unreadable ? t('sync.grades.unreadableText') : t('sync.grades.lockedText')}
    >
      <form onSubmit={(event) => void unlock(event)} className="space-y-3">
        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}
        <div>
          <label htmlFor={passwordId} className="block text-sm font-medium">
            {unreadable ? t('sync.grades.previousPassword') : t('fields.password')}
          </label>
          <input
            id={passwordId}
            type="password"
            autoComplete={unreadable ? 'off' : 'current-password'}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700"
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {unreadable ? (
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmDiscard(true)}>
              {t('sync.grades.discard')}
            </Button>
          ) : (
            <Button variant="ghost" disabled={busy} onClick={() => void signOut()}>
              {t('sync.grades.signOut')}
            </Button>
          )}
          <Button type="submit" variant="primary" loading={busy}>
            {t('sync.grades.unlock')}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title={t('sync.grades.discardTitle')}
        description={t('sync.grades.discardText')}
        confirmLabel={t('sync.grades.discardConfirm')}
        destructive
        onConfirm={() => void sync.discardUnreadableGrades()}
      />
    </Dialog>
  )
}

export function AccountSyncProvider({ children }: { children: ReactNode }) {
  const store = useGuestStore()
  const session = authClient.useSession()
  const [sync] = useState(
    () =>
      new PlanSync({
        store,
        api: planApi,
        grades: createGradeSealer(appGradeKeyring),
        storage: browserStorage(),
        debounceMs: 1000,
      }),
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
      <GradesDialog sync={sync} state={state} user={user} />
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
    case 'locked':
      return i18n.t('auth:sync.locked')
    case 'grades_unreadable':
      return i18n.t('auth:sync.gradesUnreadable')
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
