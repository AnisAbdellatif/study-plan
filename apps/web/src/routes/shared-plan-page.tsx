import {
  forkPlan,
  formatTerm,
  isPlaceholderId,
  type Plan,
  placeholderCredits,
  planSchema,
  summarizePlan,
} from '@study-plan/shared'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDateTime, useAccountSync } from '../components/account-sync.tsx'
import { ResultBadge } from '../components/board/module-card.tsx'
import { ModuleDetailsDialog } from '../components/board/module-details-dialog.tsx'
import { Button } from '../components/ui/button.tsx'
import { ConfirmDialog } from '../components/ui/dialog.tsx'
import { Spinner } from '../components/ui/spinner.tsx'
import { currentLocale } from '../i18n/index.ts'
import { ApiError, type SharedPlanResponse, shareApi } from '../lib/api.ts'
import { areaTone, moduleTone } from '../lib/area-colors.ts'
import { cn } from '../lib/cn.ts'
import { formatCredits, formatGradeString, newId } from '../lib/format.ts'
import { useGuestState, useGuestStore } from '../store/guest-store.ts'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; notFound: boolean }
  | { kind: 'ready'; response: SharedPlanResponse; plan: Plan }

function SharedPlanView({ response, plan }: { response: SharedPlanResponse; plan: Plan }) {
  const { t } = useTranslation('sharedPlan')
  const locale = currentLocale()
  const store = useGuestStore()
  const navigate = useNavigate()
  const { plan: localPlan } = useGuestState()
  const { sync } = useAccountSync()
  const [confirm, setConfirm] = useState(false)
  const [detailsCode, setDetailsCode] = useState<string | null>(null)
  const summary = useMemo(() => summarizePlan(plan), [plan])
  const names = new Map(plan.modules.map((module) => [module.code, module]))
  const estimates = useMemo(() => placeholderCredits(plan), [plan])
  const areaNames = new Map(plan.areas.map((area) => [area.id, area.name]))
  const placeholderAreas = new Map((plan.placeholders ?? []).map((item) => [item.id, item.areaId]))
  const label = plan.preset.creditLabel
  const withGrades = response.includeGrades === true

  const adopt = () => {
    store.replacePlan(forkPlan(plan, { id: newId(), now: new Date() }))
    void navigate({ to: '/' })
  }

  const columns = [
    ...plan.semesters.map((semester, index) => {
      const info = summary.semesters[index]
      const credits = formatCredits(info?.credits ?? 0)
      const estimate = info?.placeholderCredits ?? 0
      return {
        key: semester.id,
        title: t('semester', { number: index + 1 }),
        subtitle: `${info ? formatTerm(info.term, locale) : ''} · ${
          estimate > 0
            ? t('creditsWithEstimate', { credits, estimate: formatCredits(estimate), label })
            : `${credits} ${label}`
        }`,
        codes: semester.moduleCodes,
      }
    }),
    ...(plan.backlog.length > 0
      ? [{ key: 'backlog', title: t('backlog'), subtitle: '', codes: plan.backlog }]
      : []),
  ]

  return (
    <main className="mx-auto max-w-[240rem] space-y-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-indigo-600 uppercase dark:text-indigo-400">
            {t('eyebrow')}
          </p>
          <h1 className="text-xl font-semibold">{response.name}</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {plan.preset.programmeName} · {plan.preset.universityName} · {plan.preset.poVersion}
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            {withGrades
              ? t('lastChangedWithGrades', { time: formatDateTime(response.updatedAt) })
              : t('lastChanged', { time: formatDateTime(response.updatedAt) })}
          </p>
          {withGrades && summary.overall.value !== null ? (
            <p className="mt-2 inline-flex items-baseline gap-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:ring-indigo-900">
              {t('average')}
              <span className="text-lg font-semibold tabular-nums" data-testid="shared-average">
                {formatGradeString(summary.overall.value)}
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1 print:hidden">
          <Button variant="primary" onClick={() => (localPlan ? setConfirm(true) : adopt())}>
            {t('adopt')}
          </Button>
          {withGrades ? (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{t('adoptWithoutGrades')}</p>
          ) : null}
        </div>
      </header>

      {plan.areas.length > 0 ? (
        <ul aria-label={t('legend')} className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {plan.areas.map((area) => (
            <li key={area.id} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn('size-2.5 shrink-0 rounded-full', areaTone(plan, area.id).dot)}
              />
              {area.name}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {columns.map((column) => (
          <section
            key={column.key}
            aria-label={column.title}
            className={cn(
              'rounded-xl p-3 print:break-inside-avoid',
              column.key === 'backlog'
                ? 'bg-slate-200/35 ring-1 ring-zinc-300/50 dark:bg-zinc-900/35 dark:ring-zinc-800/60'
                : 'bg-slate-200/75 ring-1 ring-slate-300/60 dark:bg-zinc-900/80 dark:ring-zinc-800',
            )}
          >
            <h2 className="text-sm font-semibold">{column.title}</h2>
            {column.subtitle ? (
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{column.subtitle}</p>
            ) : null}
            <ul
              // Every option of a choice area ends up here, so the list scrolls instead of stretching the page.
              // Focusable, so keyboard users can scroll it too; printing shows everything.
              {...(column.key === 'backlog'
                ? { tabIndex: 0, 'aria-label': t('backlogList', { count: column.codes.length }) }
                : {})}
              className={cn(
                'mt-2 space-y-1.5',
                column.key === 'backlog' &&
                  '-mx-1 max-h-[60dvh] overflow-y-auto overscroll-contain px-1 pb-1 focus-visible:outline-2 focus-visible:outline-indigo-500 print:max-h-none print:overflow-visible',
              )}
            >
              {column.codes.map((code) => {
                if (isPlaceholderId(code)) {
                  const areaId = placeholderAreas.get(code)
                  // A placeholder without its record carries no information worth showing.
                  if (areaId === undefined) return null
                  const tone = areaTone(plan, areaId)
                  return (
                    <li
                      key={code}
                      data-testid="shared-placeholder"
                      className={cn(
                        'rounded-lg border-2 border-l-4 border-dashed border-zinc-400 px-2.5 py-2 text-sm dark:border-zinc-500',
                        tone.stripe,
                        tone.soft,
                      )}
                    >
                      <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                        {t('placeholder')}
                      </span>
                      <span className="block leading-snug font-medium">
                        {areaNames.get(areaId) ?? areaId}
                      </span>
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        {t('estimate', { credits: formatCredits(estimates.get(code) ?? 0), label })}
                      </span>
                    </li>
                  )
                }
                const module = names.get(code)
                const category = module?.custom ? t('custom') : module?.category
                // Same area colours as the board, so a shared plan reads like the owner's.
                const tone = moduleTone(plan, code)
                return (
                  <li
                    key={code}
                    data-testid="shared-module"
                    className={cn(
                      'rounded-lg border-l-4 text-sm shadow-sm ring-1 ring-zinc-900/10 dark:ring-white/10',
                      tone.stripe,
                      tone.soft,
                    )}
                  >
                    {/* The whole card opens the module's details, like on the board. */}
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      disabled={!module}
                      onClick={() => setDetailsCode(code)}
                      className="block w-full rounded-lg px-2.5 py-2 text-left hover:bg-white/40 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-white/5"
                    >
                      <span className="block leading-snug font-medium">{module?.name ?? code}</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                        {withGrades && module ? (
                          <ResultBadge module={module} passThreshold={plan.rules.passThreshold} />
                        ) : null}
                        <span>
                          {formatCredits(module?.credits ?? 0)} {label}
                          {category ? ` · ${category}` : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      <ModuleDetailsDialog
        module={detailsCode === null ? null : (names.get(detailsCode) ?? null)}
        plan={plan}
        onClose={() => setDetailsCode(null)}
      />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('replace.title')}
        description={t(sync.linkedPlanId() ? 'replace.descriptionLinked' : 'replace.description', {
          name: response.name,
        })}
        confirmLabel={t('replace.confirm')}
        destructive
        onConfirm={adopt}
      />
    </main>
  )
}

export function SharedPlanPage() {
  const { t } = useTranslation('sharedPlan')
  const params = useParams({ strict: false }) as { token?: string }
  const token = params.token ?? ''
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.append(meta)
    return () => meta.remove()
  }, [])

  useEffect(() => {
    let cancelled = false
    setState({ kind: 'loading' })
    shareApi
      .get(token)
      .then((response) => {
        if (cancelled) return
        const parsed = planSchema.safeParse(response.plan)
        setState(
          parsed.success
            ? { kind: 'ready', response, plan: parsed.data }
            : { kind: 'error', notFound: false },
        )
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setState({ kind: 'error', notFound: error instanceof ApiError && error.status === 404 })
      })
    return () => {
      cancelled = true
    }
  }, [token])

  if (state.kind === 'ready') return <SharedPlanView response={state.response} plan={state.plan} />

  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col justify-center px-4 py-10">
      <h1 className="flex items-center gap-3 text-2xl font-semibold" aria-busy={state.kind === 'loading'}>
        {state.kind === 'loading' ? (
          <Spinner className="size-6 text-indigo-600 dark:text-indigo-400" />
        ) : null}
        {state.kind === 'loading' ? t('loading') : t('unavailable')}
      </h1>
      {state.kind === 'error' ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {state.notFound ? t('notFound') : t('loadFailed')}{' '}
          <Link
            to="/start"
            className="font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300"
          >
            {t('createOwn')}
          </Link>
        </p>
      ) : null}
    </main>
  )
}
