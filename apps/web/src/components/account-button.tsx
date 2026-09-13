import { Link } from '@tanstack/react-router'
import { CloudCheck, CloudOff, LogIn, RefreshCw, UserRound } from 'lucide-react'
import { describeSyncState, useAccountSync } from './account-sync.tsx'

const linkClass =
  'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white px-3.5 text-sm font-medium text-zinc-900 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800'

export function AccountButton() {
  const { user, state, sessionPending } = useAccountSync()
  if (sessionPending) return null

  if (!user) {
    return (
      <Link to="/sign-in" className={linkClass}>
        <LogIn aria-hidden className="size-4" />
        <span className="sr-only sm:not-sr-only">Anmelden</span>
      </Link>
    )
  }

  const status = describeSyncState(state, true)
  const Icon =
    state.kind === 'error'
      ? CloudOff
      : state.kind === 'saving' || state.kind === 'loading'
        ? RefreshCw
        : state.kind === 'synced'
          ? CloudCheck
          : UserRound
  return (
    <Link to="/account" className={linkClass} title={status}>
      <Icon aria-hidden className="size-4" />
      <span className="sr-only sm:not-sr-only">Konto</span>
      <span className="sr-only">: {status}</span>
    </Link>
  )
}
