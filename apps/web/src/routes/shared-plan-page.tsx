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
import { Button } from '../components/ui/button.tsx'
import { ConfirmDialog } from '../components/ui/dialog.tsx'
import { currentLocale } from '../i18n/index.ts'
import { ApiError, type SharedPlanResponse, shareApi } from '../lib/api.ts'
import { formatCredits, newId } from '../lib/format.ts'
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
  const summary = useMemo(() => summarizePlan(plan), [plan])
  const names = new Map(plan.modules.map((module) => [module.code, module]))
  const estimates = useMemo(() => placeholderCredits(plan), [plan])
  const areaNames = new Map(plan.areas.map((area) => [area.id, area.name]))
  const placeholderAreas = new Map((plan.placeholders ?? []).map((item) => [item.id, item.areaId]))
  const label = plan.preset.creditLabel

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
    <main className="mx-auto max-w-[96rem] space-y-4 px-4 py-6 sm:px-6">
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
            {t('lastChanged', { time: formatDateTime(response.updatedAt) })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="primary" onClick={() => (localPlan ? setConfirm(true) : adopt())}>
            {t('adopt')}
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {columns.map((column) => (
          <section
            key={column.key}
            aria-label={column.title}
            className="rounded-xl bg-zinc-200/60 p-3 dark:bg-zinc-900/70 print:break-inside-avoid"
          >
            <h2 className="text-sm font-semibold">{column.title}</h2>
            {column.subtitle ? (
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{column.subtitle}</p>
            ) : null}
            <ul className="mt-2 space-y-1.5">
              {column.codes.map((code) => {
                if (isPlaceholderId(code)) {
                  const areaId = placeholderAreas.get(code)
                  // A placeholder without its record carries no information worth showing.
                  if (areaId === undefined) return null
                  return (
                    <li
                      key={code}
                      data-testid="shared-placeholder"
                      className="rounded-lg border-2 border-dashed border-zinc-400 px-2.5 py-2 text-sm dark:border-zinc-600"
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
                return (
                  <li
                    key={code}
                    className="rounded-lg bg-white px-2.5 py-2 text-sm ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800"
                  >
                    <span className="block leading-snug font-medium">{module?.name ?? code}</span>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {formatCredits(module?.credits ?? 0)} {label}
                      {category ? ` · ${category}` : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

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
      <h1 className="text-2xl font-semibold">{state.kind === 'loading' ? t('loading') : t('unavailable')}</h1>
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
