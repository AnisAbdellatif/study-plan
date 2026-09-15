import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  BellRing,
  Calculator,
  Check,
  ChevronDown,
  LayoutGrid,
  ListChecks,
  MessageCircle,
  MonitorSmartphone,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountButton } from '../components/account-button.tsx'
import { BrandMark } from '../components/brand-logo.tsx'
import { LanguageMenu } from '../components/language-menu.tsx'
import { ThemeToggle } from '../components/theme-toggle.tsx'
import { createExamplePlan } from '../demo.ts'
import { cn } from '../lib/cn.ts'
import { formatGrade, newId } from '../lib/format.ts'
import { useGuestState, useGuestStore } from '../store/guest-store.ts'

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500'
const primaryCta = cn(
  'inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-base font-semibold text-white shadow-lg shadow-indigo-600/25 transition-colors hover:bg-indigo-500 dark:shadow-indigo-950/60',
  focusRing,
)
const secondaryCta = cn(
  'inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white/80 px-5 text-base font-semibold text-zinc-900 ring-1 ring-zinc-300 ring-inset backdrop-blur transition-colors hover:bg-white dark:bg-zinc-900/70 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-900',
  focusRing,
)
const eyebrowClass = 'text-sm font-semibold text-indigo-600 dark:text-indigo-400'
const sectionTitleClass = 'mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl'

const FEATURES = [
  { key: 'board', icon: LayoutGrid, account: false },
  { key: 'grades', icon: Calculator, account: false },
  { key: 'hints', icon: ListChecks, account: false },
  { key: 'deadlines', icon: BellRing, account: false },
  { key: 'assistant', icon: MessageCircle, account: true },
  { key: 'devices', icon: MonitorSmartphone, account: true },
] as const
const STEPS = ['choose', 'start', 'plan'] as const
const PRIVACY_POINTS = ['local', 'encrypted', 'noTracking', 'neverShared'] as const
const QUESTIONS = ['account', 'programme', 'accuracy', 'grades', 'changes'] as const

type Tone = 'sky' | 'emerald' | 'amber'
const TONES: Record<Tone, string> = {
  sky: 'border-l-sky-500',
  emerald: 'border-l-emerald-500',
  amber: 'border-l-amber-500',
}

interface PreviewModule {
  name: string
  credits: number
  tone: Tone
  grade?: number
  passed?: boolean
  warning?: boolean
}

/**
 * A drawn study plan for the hero: made of plain elements, so it stays sharp, follows the theme and the language,
 * and never goes stale like a screenshot. Screen readers skip it; the text next to it says the same.
 */
function HeroPreview() {
  const { t } = useTranslation('landing')
  // Module names are programme data, like in the templates, so they stay German in both languages.
  const semesters: { number: number; term: string; modules: PreviewModule[]; wide?: boolean }[] = [
    {
      number: 1,
      term: t('preview.winter', { year: '2026/27' }),
      modules: [
        { name: 'Programmieren I', credits: 8, tone: 'sky', grade: 1.3 },
        { name: 'Lineare Algebra I', credits: 9, tone: 'sky', grade: 2.0 },
        { name: 'Wissenschaftliches Arbeiten', credits: 5, tone: 'amber', passed: true },
      ],
    },
    {
      number: 2,
      term: t('preview.summer', { year: '2027' }),
      modules: [
        { name: 'Algorithmen und Datenstrukturen', credits: 8, tone: 'sky' },
        { name: 'Analysis I', credits: 9, tone: 'sky', warning: true },
        { name: 'Softwaretechnik', credits: 6, tone: 'emerald' },
      ],
    },
    {
      number: 3,
      term: t('preview.winter', { year: '2027/28' }),
      wide: true,
      modules: [
        { name: 'Rechnerarchitektur', credits: 6, tone: 'sky' },
        { name: 'Datenbanksysteme', credits: 6, tone: 'emerald' },
      ],
    },
  ]

  return (
    <div aria-hidden className="relative isolate mx-auto w-full max-w-xl lg:max-w-none">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-linear-to-tr from-indigo-500/30 via-violet-500/20 to-sky-400/30 blur-2xl" />
      <div className="rounded-2xl bg-white/85 p-3 shadow-2xl shadow-indigo-950/10 ring-1 ring-zinc-200 backdrop-blur sm:p-4 lg:rotate-1 dark:bg-zinc-900/85 dark:ring-zinc-800">
        <div className="flex items-center gap-1.5 px-1">
          <span className="size-2.5 rounded-full bg-red-400/80" />
          <span className="size-2.5 rounded-full bg-amber-400/80" />
          <span className="size-2.5 rounded-full bg-emerald-400/80" />
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <p className="font-semibold">Informatik B.Sc.</p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{t('preview.university')}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-200 dark:ring-indigo-900">
              {t('preview.average')} {formatGrade(1.6)}
            </span>
            <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700">
              {t('preview.credits', { earned: 22, total: 180 })}
            </span>
          </div>
        </div>
        <div className="mx-1 mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full w-[12%] rounded-full bg-linear-to-r from-indigo-500 to-sky-400" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          {semesters.map((semester) => (
            <div
              key={semester.number}
              className={cn(
                'space-y-2 rounded-xl bg-zinc-100/80 p-2 dark:bg-zinc-950/60',
                // The current semester is outlined, like on the real board.
                semester.number === 1
                  ? 'ring-2 ring-indigo-400/70 dark:ring-indigo-500/70'
                  : 'ring-1 ring-zinc-200 dark:ring-zinc-800',
                semester.wide && 'hidden sm:block',
              )}
            >
              <div className="px-1">
                <p className="text-xs font-semibold">{t('preview.semester', { number: semester.number })}</p>
                <p className="text-[11px] text-zinc-600 dark:text-zinc-400">{semester.term}</p>
              </div>
              {semester.modules.map((module) => (
                <div
                  key={module.name}
                  className={cn(
                    'rounded-lg border-l-4 bg-white px-2 py-1.5 shadow-xs ring-1 ring-zinc-200 dark:bg-zinc-800/90 dark:ring-zinc-700',
                    TONES[module.tone],
                  )}
                >
                  <p className="truncate text-[11px] leading-snug font-medium">{module.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-600 dark:text-zinc-400">
                    {t('preview.moduleCredits', { count: module.credits })}
                    {module.grade !== undefined ? (
                      <span className="rounded bg-emerald-100 px-1 font-semibold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                        {formatGrade(module.grade)}
                      </span>
                    ) : null}
                    {module.passed ? (
                      <span className="rounded bg-emerald-100 px-1 font-semibold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                        {t('preview.passed')}
                      </span>
                    ) : null}
                  </p>
                  {module.warning ? (
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300">
                      <TriangleAlert className="size-3 shrink-0" />
                      <span className="truncate">{t('preview.offered')}</span>
                    </p>
                  ) : null}
                </div>
              ))}
              {semester.wide ? (
                <div className="rounded-lg border border-dashed border-zinc-300 px-2 py-2 text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                  {t('preview.choose')}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="absolute -bottom-6 -left-4 hidden items-center gap-3 rounded-xl bg-white px-3.5 py-2.5 shadow-xl shadow-indigo-950/10 ring-1 ring-zinc-200 sm:flex lg:-left-8 dark:bg-zinc-900 dark:ring-zinc-700">
        <span className="flex size-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
          <BellRing className="size-4" />
        </span>
        <span>
          <span className="block text-[11px] text-zinc-600 dark:text-zinc-400">
            {t('preview.reminderTitle')}
          </span>
          <span className="block text-xs font-semibold">{t('preview.reminder')}</span>
        </span>
      </div>
      <div className="absolute -top-5 -right-3 hidden max-w-56 items-start gap-2 rounded-xl rounded-br-sm bg-indigo-600 px-3 py-2 text-xs font-medium text-white shadow-xl shadow-indigo-600/30 sm:flex lg:-right-6">
        <MessageCircle className="mt-0.5 size-3.5 shrink-0" />
        {t('preview.question')}
      </div>
    </div>
  )
}

/** What Study Plan is, for visitors without a plan (at /) and for anyone at /about. */
export function LandingPage() {
  const { t } = useTranslation('landing')
  const { plan } = useGuestState()
  const store = useGuestStore()
  const navigate = useNavigate()
  const ids = { features: useId(), steps: useId(), privacy: useId(), faq: useId(), final: useId() }

  const tryExample = () => {
    store.replacePlan(createExamplePlan(newId()))
    void navigate({ to: '/' })
  }

  // Someone who already has a plan goes back to it instead of replacing it with the example.
  const secondaryAction = plan ? (
    <Link to="/" className={secondaryCta}>
      {t('cta.toPlan')}
    </Link>
  ) : (
    <button type="button" onClick={tryExample} className={secondaryCta}>
      <Sparkles aria-hidden className="size-5" />
      {t('cta.example')}
    </button>
  )

  return (
    <div className="overflow-x-clip">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 pt-4 sm:px-6 sm:pt-6">
        <Link to="/" className={cn('rounded-lg', focusRing)}>
          <span className="sm:hidden">
            <BrandMark />
          </span>
          <span className="hidden sm:block">
            <BrandMark size="lg" />
          </span>
        </Link>
        <nav aria-label={t('nav.label')} className="flex items-center gap-1 sm:gap-2">
          <LanguageMenu />
          <span className="hidden sm:contents">
            <ThemeToggle />
          </span>
          <AccountButton />
          <Link
            to="/start"
            className={cn(
              'inline-flex h-10 items-center rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500',
              focusRing,
            )}
          >
            {t('nav.start')}
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pt-12 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pt-20 lg:pb-28">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200 backdrop-blur dark:bg-indigo-950/40 dark:text-indigo-300 dark:ring-indigo-900">
              <Sparkles aria-hidden className="size-3.5" />
              {t('hero.eyebrow')}
            </p>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              {t('hero.titleStart')}{' '}
              <span className="bg-linear-to-r from-indigo-600 via-violet-500 to-sky-500 bg-clip-text text-transparent dark:from-indigo-400 dark:via-violet-300 dark:to-sky-300">
                {t('hero.titleHighlight')}
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">{t('hero.lead')}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/start" className={primaryCta}>
                {t('cta.start')}
                <ArrowRight aria-hidden className="size-5" />
              </Link>
              {secondaryAction}
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              {(['noAccount', 'noTracking', 'encrypted'] as const).map((key) => (
                <li key={key} className="flex items-center gap-1.5">
                  <Check aria-hidden className="size-4 text-emerald-600 dark:text-emerald-400" />
                  {t(`hero.trust.${key}`)}
                </li>
              ))}
            </ul>
          </div>
          <HeroPreview />
        </section>

        <section aria-labelledby={ids.features} className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className={eyebrowClass}>{t('features.eyebrow')}</p>
            <h2 id={ids.features} className={sectionTitleClass}>
              {t('features.title')}
            </h2>
            <p className="mt-4 text-zinc-600 dark:text-zinc-400">{t('features.lead')}</p>
          </div>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ key, icon: Icon, account }) => (
              <li
                key={key}
                className="rounded-2xl bg-white/80 p-6 ring-1 ring-zinc-200 transition motion-safe:hover:-translate-y-0.5 hover:shadow-lg hover:shadow-indigo-950/5 dark:bg-zinc-900/70 dark:ring-zinc-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-sky-500 text-white shadow-md shadow-indigo-500/25">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  {account ? (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      {t('features.account')}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-4 text-lg font-semibold">{t(`features.items.${key}.title`)}</h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {t(`features.items.${key}.text`)}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby={ids.steps}
          className="border-y border-zinc-200/80 bg-white/50 dark:border-zinc-800 dark:bg-zinc-900/40"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <div className="max-w-2xl">
              <p className={eyebrowClass}>{t('steps.eyebrow')}</p>
              <h2 id={ids.steps} className={sectionTitleClass}>
                {t('steps.title')}
              </h2>
            </div>
            <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
              {STEPS.map((key, index) => (
                <li key={key} className="relative">
                  {index < STEPS.length - 1 ? (
                    <span
                      aria-hidden
                      className="absolute top-5 left-14 hidden h-px w-[calc(100%-3.5rem)] bg-linear-to-r from-indigo-300 to-transparent md:block dark:from-indigo-800"
                    />
                  ) : null}
                  <span className="flex size-10 items-center justify-center rounded-full bg-indigo-600 text-sm font-semibold text-white shadow-md shadow-indigo-600/30">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold">{t(`steps.items.${key}.title`)}</h3>
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {t(`steps.items.${key}.text`)}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby={ids.privacy} className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="relative isolate overflow-hidden rounded-3xl bg-zinc-950 px-6 py-12 text-white ring-1 ring-white/10 sm:px-12 lg:grid lg:grid-cols-2 lg:items-center lg:gap-12">
            <div className="absolute -top-24 -right-24 -z-10 size-96 rounded-full bg-indigo-500/30 blur-3xl" />
            <div className="absolute -bottom-32 -left-20 -z-10 size-96 rounded-full bg-sky-500/20 blur-3xl" />
            <div>
              <span className="flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                <ShieldCheck aria-hidden className="size-6 text-sky-300" />
              </span>
              <h2
                id={ids.privacy}
                className="mt-5 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
              >
                {t('privacy.title')}
              </h2>
              <p className="mt-4 text-zinc-300">{t('privacy.lead')}</p>
              <Link
                to="/privacy"
                className="mt-6 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-sky-300 hover:text-sky-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
              >
                {t('privacy.link')}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
            <ul className="mt-10 space-y-3 lg:mt-0">
              {PRIVACY_POINTS.map((key) => (
                <li key={key} className="flex gap-3 rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                  <Check aria-hidden className="mt-0.5 size-5 shrink-0 text-emerald-300" />
                  <span className="text-sm text-zinc-200">{t(`privacy.items.${key}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby={ids.faq} className="mx-auto max-w-3xl px-4 pb-16 sm:px-6 lg:pb-24">
          <h2 id={ids.faq} className="text-center text-3xl font-semibold tracking-tight">
            {t('faq.title')}
          </h2>
          <div className="mt-8 divide-y divide-zinc-200 rounded-2xl bg-white/80 ring-1 ring-zinc-200 dark:divide-zinc-800 dark:bg-zinc-900/70 dark:ring-zinc-800">
            {QUESTIONS.map((key) => (
              <details key={key} className="group px-5 py-4">
                <summary
                  className={cn(
                    'flex cursor-pointer list-none items-center justify-between gap-4 rounded-md font-medium [&::-webkit-details-marker]:hidden',
                    focusRing,
                  )}
                >
                  {t(`faq.items.${key}.question`)}
                  <ChevronDown
                    aria-hidden
                    className="size-5 shrink-0 text-zinc-500 transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {t(`faq.items.${key}.answer`)}
                </p>
              </details>
            ))}
          </div>
        </section>

        <section aria-labelledby={ids.final} className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="relative isolate overflow-hidden rounded-3xl bg-linear-to-br from-indigo-600 via-violet-600 to-indigo-700 px-6 py-14 text-center text-white shadow-xl shadow-indigo-950/20 sm:px-12">
            <div className="absolute -top-20 left-1/2 -z-10 size-80 -translate-x-1/2 rounded-full bg-sky-400/30 blur-3xl" />
            <h2 id={ids.final} className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              {t('final.title')}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-indigo-100">{t('final.lead')}</p>
            <Link
              to="/start"
              className="mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-base font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {t('cta.start')}
              <ArrowRight aria-hidden className="size-5" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
