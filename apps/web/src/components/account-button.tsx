import { Link, useMatchRoute, useNavigate } from '@tanstack/react-router'
import { CloudCheck, CloudOff, LogIn, LogOut, RefreshCw, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { describeSyncState, useAccountSync } from './account-sync.tsx'
import { Button } from './ui/button.tsx'
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from './ui/menu.tsx'
import { Spinner } from './ui/spinner.tsx'
import { useSignOut } from './use-sign-out.ts'

const linkClass =
  'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-white px-3.5 text-sm font-medium text-zinc-900 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800'

/** Sign in when signed out; when signed in, a menu with the save status, the account page and signing out. */
export function AccountButton() {
  const { t } = useTranslation('auth')
  const { user, state, sessionPending } = useAccountSync()
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  const [signingOut, setSigningOut] = useState(false)
  const signOutAndReset = useSignOut()
  if (sessionPending) return null

  if (!user) {
    // The sign-in and sign-up pages are already where this button would lead; the start page has its own, larger one.
    if (matchRoute({ to: '/sign-in' }) || matchRoute({ to: '/sign-up' }) || matchRoute({ to: '/start' })) {
      return null
    }
    return (
      <Link to="/sign-in" className={linkClass}>
        <LogIn aria-hidden className="size-4" />
        <span className="sr-only sm:not-sr-only">{t('button.signIn')}</span>
      </Link>
    )
  }

  const signOut = async () => {
    setSigningOut(true)
    try {
      await signOutAndReset()
    } finally {
      setSigningOut(false)
    }
  }

  const status = describeSyncState(state, true)
  const syncing = state.kind === 'saving' || state.kind === 'loading'
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
      <MenuTrigger render={<Button title={status} aria-busy={signingOut || syncing || undefined} />}>
        {signingOut ? (
          <Spinner />
        ) : (
          <Icon
            aria-hidden
            className={syncing ? 'size-4 animate-spin motion-reduce:animate-none' : 'size-4'}
          />
        )}
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
