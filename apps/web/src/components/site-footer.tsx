import { Link, useMatchRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn.ts'

const linkClass = 'underline-offset-4 hover:underline'

/**
 * Legal links. On phones the board has a bottom tab bar at the screen edge, so there the links move into the board
 * (`placement="board"`, above the bar) and the page footer is hidden.
 */
export function SiteFooter({ placement = 'page' }: { placement?: 'page' | 'board' }) {
  const { t } = useTranslation()
  const matchRoute = useMatchRoute()
  const onBoard = Boolean(matchRoute({ to: '/' }))
  // Only the page footer is the contentinfo landmark; the board's copy is a plain block inside main.
  const Tag = placement === 'page' ? 'footer' : 'div'
  return (
    <Tag
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600 print:hidden dark:text-zinc-400',
        placement === 'page' ? 'mx-auto w-full max-w-[240rem] px-4 pt-2 pb-8 sm:px-6' : 'pt-2 pb-3 sm:hidden',
        placement === 'page' && onBoard && 'max-sm:hidden',
      )}
    >
      <Link to="/legal-notice" className={linkClass}>
        {t('footer.legalNotice')}
      </Link>
      <Link to="/privacy" className={linkClass}>
        {t('footer.privacy')}
      </Link>
      <Link to="/contact" className={linkClass}>
        {t('footer.contact')}
      </Link>
    </Tag>
  )
}
