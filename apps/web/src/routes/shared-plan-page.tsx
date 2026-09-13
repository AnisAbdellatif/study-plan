import { forkPlan, type Plan, planSchema, summarizePlan } from '@study-plan/shared'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'
import { formatDateTime, useAccountSync } from '../components/account-sync.tsx'
import { Button } from '../components/ui/button.tsx'
import { ConfirmDialog } from '../components/ui/dialog.tsx'
import { ApiError, type SharedPlanResponse, shareApi } from '../lib/api.ts'
import { formatCredits, newId } from '../lib/format.ts'
import { useGuestState, useGuestStore } from '../store/guest-store.ts'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; notFound: boolean }
  | { kind: 'ready'; response: SharedPlanResponse; plan: Plan }

function SharedPlanView({ response, plan }: { response: SharedPlanResponse; plan: Plan }) {
  const store = useGuestStore()
  const navigate = useNavigate()
  const { plan: localPlan } = useGuestState()
  const { sync } = useAccountSync()
  const [confirm, setConfirm] = useState(false)
  const summary = useMemo(() => summarizePlan(plan), [plan])
  const names = new Map(plan.modules.map((module) => [module.code, module]))
  const label = plan.preset.creditLabel

  const adopt = () => {
    store.replacePlan(forkPlan(plan, { id: newId(), now: new Date() }))
    void navigate({ to: '/' })
  }

  const columns = [
    ...plan.semesters.map((semester, index) => ({
      key: semester.id,
      title: `${index + 1}. Semester`,
      subtitle: `${summary.semesters[index]?.label ?? ''} · ${formatCredits(summary.semesters[index]?.credits ?? 0)} ${label}`,
      codes: semester.moduleCodes,
    })),
    ...(plan.backlog.length > 0
      ? [{ key: 'backlog', title: 'Nicht eingeplant', subtitle: '', codes: plan.backlog }]
      : []),
  ]

  return (
    <main className="mx-auto max-w-[96rem] space-y-4 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-indigo-600 uppercase dark:text-indigo-400">
            Geteilter Studienplan
          </p>
          <h1 className="text-xl font-semibold">{response.name}</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {plan.preset.programmeName} · {plan.preset.universityName} · {plan.preset.poVersion}
          </p>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Zuletzt geändert {formatDateTime(response.updatedAt)}. Ohne Noten, Prüfungstermine und
            Zielschnitt.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="primary" onClick={() => (localPlan ? setConfirm(true) : adopt())}>
            Als eigenen Plan übernehmen
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
                const module = names.get(code)
                return (
                  <li
                    key={code}
                    className="rounded-lg bg-white px-2.5 py-2 text-sm ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800"
                  >
                    <span className="block leading-snug font-medium">{module?.name ?? code}</span>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {formatCredits(module?.credits ?? 0)} {label}
                      {module?.category ? ` · ${module.category}` : ''}
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
        title="Deinen Plan ersetzen?"
        description={`„${response.name}“ ersetzt deinen Plan in diesem Browser${
          sync.linkedPlanId() ? ' und in deinem Konto' : ''
        }, samt eingetragener Noten. Exportiere deinen Plan vorher, wenn du ihn behalten willst.`}
        confirmLabel="Ersetzen"
        destructive
        onConfirm={adopt}
      />
    </main>
  )
}

export function SharedPlanPage() {
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
      <h1 className="text-2xl font-semibold">
        {state.kind === 'loading' ? 'Plan wird geladen…' : 'Link nicht verfügbar'}
      </h1>
      {state.kind === 'error' ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {state.notFound
            ? 'Dieser Link wurde deaktiviert oder existiert nicht.'
            : 'Der Plan konnte gerade nicht geladen werden. Bitte versuche es später noch einmal.'}{' '}
          <Link
            to="/start"
            className="font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300"
          >
            Eigenen Plan anlegen
          </Link>
        </p>
      ) : null}
    </main>
  )
}
