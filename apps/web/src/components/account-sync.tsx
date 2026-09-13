import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { planApi } from '../lib/api.ts'
import { authClient } from '../lib/auth-client.ts'
import { PlanSync, type SyncState } from '../lib/plan-sync.ts'
import { type StorageLike, useGuestState, useGuestStore } from '../store/guest-store.ts'
import { Button } from './ui/button.tsx'
import { Dialog } from './ui/dialog.tsx'

export interface AccountUser {
  id: string
  email: string
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

const dateTimeFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
export const formatDateTime = (iso: string): string => dateTimeFormat.format(new Date(iso))

function ChoosePlanDialog({ sync, state }: { sync: PlanSync; state: SyncState }) {
  const { plan } = useGuestState()
  const [busy, setBusy] = useState(false)
  if (state.kind !== 'choose') return null
  return (
    <Dialog
      open
      onOpenChange={() => {}}
      title="Welchen Plan möchtest du behalten?"
      description={
        <>
          In deinem Konto liegt „{state.remote.name}“, zuletzt gespeichert am{' '}
          {formatDateTime(state.remote.updatedAt)}. In diesem Browser gibt es „{plan?.name ?? 'einen Plan'}“.
          Der andere Plan wird ersetzt.
        </>
      }
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
          Plan aus diesem Browser behalten
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => sync.loadAccountPlan()}>
          Plan aus dem Konto laden
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
  const user = sessionUser ? { id: sessionUser.id, email: sessionUser.email } : null
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
  if (!signedIn) return 'Nur in diesem Browser gespeichert'
  switch (state.kind) {
    case 'signed_out':
    case 'loading':
      return 'Verbinde mit dem Konto…'
    case 'no_account_plan':
      return 'Noch nicht im Konto gesichert'
    case 'choose':
      return 'Plan auswählen'
    case 'saving':
      return 'Wird gespeichert…'
    case 'synced':
      return `Im Konto gespeichert, ${formatDateTime(state.savedAt)}`
    case 'error':
      return 'Speichern im Konto fehlgeschlagen'
  }
}

/** Banner on the board for the moments that need a decision or an explanation. */
export function AccountSyncBanner() {
  const { sync, state, user } = useAccountSync()
  const { plan } = useGuestState()
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null)
  if (!user || !plan) return null

  const box =
    'flex flex-col gap-3 rounded-lg px-4 py-3 text-sm sm:flex-row sm:items-center bg-indigo-50 text-indigo-950 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-100 dark:ring-indigo-900'

  if (state.kind === 'no_account_plan') {
    return (
      <div role="status" className={box}>
        <p className="flex-1">
          Sichere deinen Plan im Konto, dann ist er auf allen deinen Geräten verfügbar.
        </p>
        <Button size="sm" variant="primary" onClick={() => void sync.uploadLocal()}>
          Im Konto sichern
        </Button>
      </div>
    )
  }
  if (state.kind === 'error') {
    return (
      <div role="alert" className={box}>
        <p className="flex-1">
          Dein Plan konnte gerade nicht im Konto gespeichert werden. Die Änderungen bleiben in diesem Browser.
        </p>
        <Button size="sm" onClick={() => void sync.retry()}>
          Erneut versuchen
        </Button>
      </div>
    )
  }
  if (state.kind === 'synced' && state.notice === 'remote_newer' && dismissedNotice !== state.savedAt) {
    return (
      <div role="status" className={box}>
        <p className="flex-1">
          Dein Plan wurde inzwischen auf einem anderen Gerät geändert. Die neuere Version aus dem Konto ist
          geladen, deine letzte Änderung hier wurde nicht übernommen.
        </p>
        <Button size="sm" variant="ghost" onClick={() => setDismissedNotice(state.savedAt)}>
          Verstanden
        </Button>
      </div>
    )
  }
  return null
}
