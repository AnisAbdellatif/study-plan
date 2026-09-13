import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { LOCALES } from '../i18n/config.ts'
import { cn } from '../lib/cn.ts'

const linkClass = 'underline-offset-4 hover:underline'

export function SiteFooter() {
  const { t, i18n } = useTranslation()
  return (
    <footer className="mx-auto flex max-w-[96rem] flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-2 pb-8 text-xs text-zinc-600 sm:px-6 print:hidden dark:text-zinc-400">
      <Link to="/legal-notice" className={linkClass}>
        {t('footer.legalNotice')}
      </Link>
      <Link to="/privacy" className={linkClass}>
        {t('footer.privacy')}
      </Link>
      <div role="group" aria-label={t('language.label')} className="ml-auto flex gap-1">
        {LOCALES.map((locale) => {
          const active = i18n.resolvedLanguage === locale
          return (
            <button
              key={locale}
              type="button"
              lang={locale}
              aria-pressed={active}
              onClick={() => void i18n.changeLanguage(locale)}
              className={cn(
                'rounded px-1.5 py-0.5 focus-visible:outline-2 focus-visible:outline-indigo-500',
                active ? 'font-semibold text-zinc-900 dark:text-zinc-100' : linkClass,
              )}
            >
              {t(`language.${locale}`)}
            </button>
          )
        })}
      </div>
    </footer>
  )
}
