import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BrandMark } from '../components/brand-logo.tsx'
import { Button } from '../components/ui/button.tsx'
import { currentLocale } from '../i18n/index.ts'
import { cn } from '../lib/cn.ts'
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

export interface LegalSectionLink {
  id: string
  heading: string
}

/** A numbered part of a legal page. The id is the anchor the table of contents links to. */
export function LegalSection({
  id,
  heading,
  children,
}: {
  id: string
  heading: string
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-6">
      <h2
        id={`${id}-heading`}
        className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
      >
        {heading}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

const backLinkClass =
  'inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-zinc-900 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800'

// Typography for the legal text itself; sections get dividers between them.
const articleClass =
  'rounded-2xl bg-white px-6 py-8 ring-1 ring-zinc-200 sm:px-10 sm:py-10 dark:bg-zinc-900 dark:ring-zinc-800 [&_section+section]:mt-10 [&_section+section]:border-t [&_section+section]:border-zinc-200 [&_section+section]:pt-10 dark:[&_section+section]:border-zinc-800 [&_p]:text-[15px] [&_p]:leading-7 [&_p]:text-zinc-700 dark:[&_p]:text-zinc-300 [&_li]:text-[15px] [&_li]:leading-7 [&_li]:text-zinc-700 dark:[&_li]:text-zinc-300 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_a]:font-medium [&_a]:text-indigo-700 [&_a]:underline [&_a]:underline-offset-4 dark:[&_a]:text-indigo-300'

export function LegalPage({
  title,
  updated,
  sections,
  children,
}: {
  title: string
  /** e.g. "Stand: September 2026", shown under the title. */
  updated?: string
  /** When given, a table of contents links to these sections; it stays in view beside the text on wide screens. */
  sections?: readonly LegalSectionLink[]
  children: ReactNode
}) {
  const { t, i18n } = useTranslation('legal')
  const missing = missingOperatorDetails()
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-12 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/"
          className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          <BrandMark />
        </Link>
        <Link to="/" className={backLinkClass}>
          <ArrowLeft aria-hidden className="size-4" />
          {t('backToApp')}
        </Link>
      </div>

      <header className="mt-10 max-w-3xl">
        <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{t('eyebrow')}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {updated ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{updated}</p> : null}
        {currentLocale() !== 'de' ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-indigo-50 px-4 py-3 text-sm text-indigo-950 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-100 dark:ring-indigo-900">
            <p>{t('courtesyTranslation.note')}</p>
            <Button size="sm" lang="de" onClick={() => void i18n.changeLanguage('de')}>
              {t('courtesyTranslation.switchToGerman')}
            </Button>
          </div>
        ) : null}
        {missing.length > 0 ? (
          <p
            role="alert"
            className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900"
          >
            {t('incomplete')}
          </p>
        ) : null}
      </header>

      <div className={cn('mt-8 grid gap-8', sections && 'lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10')}>
        {sections ? (
          <nav aria-label={t('contents')} className="lg:sticky lg:top-6 lg:self-start">
            <p className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              {t('contents')}
            </p>
            <ol className="mt-3 space-y-0.5 border-l border-zinc-200 text-sm dark:border-zinc-800">
              {sections.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="-ml-px block border-l border-transparent py-1 pl-3 text-zinc-600 hover:border-indigo-500 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <article className={articleClass}>{children}</article>
      </div>
    </main>
  )
}
