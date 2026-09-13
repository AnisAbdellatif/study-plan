import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button.tsx'
import { currentLocale } from '../i18n/index.ts'
import { missingOperatorDetails, type OperatorDetails, operator } from './operator.ts'

/** Shows a configured value, or a clearly marked gap that must be filled before publishing. */
export function Filled({ value, placeholder }: { value: string; placeholder: string }) {
  if (value !== '') return <>{value}</>
  return (
    <mark className="rounded bg-amber-200 px-1 text-amber-950 dark:bg-amber-900 dark:text-amber-100">
      [{placeholder}]
    </mark>
  )
}

/** One operator detail from the configuration, with a translated placeholder when it is missing. */
export function OperatorField({ field }: { field: keyof OperatorDetails }) {
  const { t } = useTranslation('legal')
  return <Filled value={operator[field]} placeholder={t(`placeholders.${field}`)} />
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  const { t, i18n } = useTranslation('legal')
  const missing = missingOperatorDetails()
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <Link
        to="/"
        className="text-sm text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300"
      >
        {t('backToApp')}
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
      {currentLocale() !== 'de' ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-950 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-100 dark:ring-indigo-900">
          <p>{t('courtesyTranslation.note')}</p>
          <Button size="sm" lang="de" onClick={() => void i18n.changeLanguage('de')}>
            {t('courtesyTranslation.switchToGerman')}
          </Button>
        </div>
      ) : null}
      {missing.length > 0 ? (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900"
        >
          {t('incomplete')}
        </p>
      ) : null}
      <div className="legal-content mt-6 space-y-4 text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </main>
  )
}
