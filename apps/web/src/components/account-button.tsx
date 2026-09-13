import { Link, useMatchRoute, useNavigate } from '@tanstack/react-router'
import { CloudCheck, CloudOff, LogIn, LogOut, RefreshCw, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { authClient } from '../lib/auth-client.ts'
import { describeSyncState, useAccountSync } from './account-sync.tsx'
import { Button } from './ui/button.tsx'
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from './ui/menu.tsx'

const linkClass =
  'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white px-3.5 text-sm font-medium text-zinc-900 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800'

/** Sign in when signed out; when signed in, a menu with the save status, the account page and signing out. */
export function AccountButton() {
  const { t } = useTranslation('auth')
  const { user, state, sessionPending, sync } = useAccountSync()
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  if (sessionPending) return null

  if (!user) {
    // The sign-in and sign-up pages are already where this button would lead.
    if (matchRoute({ to: '/sign-in' }) || matchRoute({ to: '/sign-up' })) return null
    return (
      <Link to="/sign-in" className={linkClass}>
        <LogIn aria-hidden className="size-4" />
        <span className="sr-only sm:not-sr-only">{t('button.signIn')}</span>
      </Link>
    )
  }

  const signOut = async () => {
    await authClient.signOut()
    // The plan in this browser stays; only syncing with the account stops.
    sync.stop()
    void navigate({ to: '/' })
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
    <MenuRoot>
      <MenuTrigger render={<Button title={status} />}>
        <Icon aria-hidden className="size-4" />
        <span className="sr-only sm:not-sr-only">{t('button.account')}</span>
        <span className="sr-only">: {status}</span>
      </MenuTrigger>
      <MenuContent>
        <div className="px-2 py-1.5">
          <p className="truncate text-sm font-medium">{user.email}</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{status}</p>
        </div>
        <MenuSeparator />
        <MenuItem onClick={() => void navigate({ to: '/account' })}>
          <UserRound aria-hidden className="size-4" />
          {t('button.manageAccount')}
        </MenuItem>
        <MenuItem onClick={() => void signOut()}>
          <LogOut aria-hidden className="size-4" />
          {t('button.signOut')}
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  )
}
