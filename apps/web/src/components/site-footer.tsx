import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

const linkClass = 'underline-offset-4 hover:underline'

export function SiteFooter() {
  const { t } = useTranslation()
  return (
    <footer className="mx-auto flex max-w-[96rem] flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-2 pb-8 text-xs text-zinc-600 sm:px-6 print:hidden dark:text-zinc-400">
      <Link to="/legal-notice" className={linkClass}>
        {t('footer.legalNotice')}
      </Link>
      <Link to="/privacy" className={linkClass}>
        {t('footer.privacy')}
      </Link>
    </footer>
  )
}
