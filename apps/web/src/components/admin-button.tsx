import { useMatchRoute, useNavigate } from '@tanstack/react-router'
import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccountSync } from './account-sync.tsx'
import { Button } from './ui/button.tsx'

/**
 * Shortcut to the admin dashboard for signed-in admins. The role comes from the session, so nobody else triggers
 * a request; the dashboard itself still checks access on the server.
 */
export function AdminButton({ labelClassName }: { labelClassName?: string }) {
  const { t } = useTranslation('auth')
  const { user } = useAccountSync()
  const navigate = useNavigate()
  const matchRoute = useMatchRoute()
  if (user?.role !== 'admin' && user?.role !== 'superadmin') return null
  if (matchRoute({ to: '/admin' })) return null
  return (
    <Button variant="ghost" onClick={() => void navigate({ to: '/admin' })}>
      <ShieldCheck aria-hidden className="size-4" />
      <span className={labelClassName}>{t('account.adminLink')}</span>
    </Button>
  )
}
