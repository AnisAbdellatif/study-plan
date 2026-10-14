import type {
  CalendarChange,
  CalendarFetchError,
  CalendarOverview,
  CalendarSettings,
  CalendarSourceView,
} from '@study-plan/shared'
import { Link, Navigate } from '@tanstack/react-router'
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react'
import { type FormEvent, type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { formatDateTime, useAccountSync } from '../components/account-sync.tsx'
import { FeedsSection } from '../components/calendar/feeds-section.tsx'
import { formatEventStart } from '../components/calendar/format.ts'
import { SubjectsSection } from '../components/calendar/subjects-section.tsx'
import { Button } from '../components/ui/button.tsx'
import { ConfirmDialog } from '../components/ui/dialog.tsx'
import { LoadingText } from '../components/ui/spinner.tsx'
import { ApiError, CalendarFetchFailedError, calendarApi } from '../lib/api.ts'

const cardClass = 'space-y-3 rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'
const linkClass = 'font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300'
const mutedClass = 'text-sm text-zinc-600 dark:text-zinc-400'
const fieldClass =
  'mt-1 h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700'

const FETCH_ERRORS = new Set<string>([
  'unreachable',
  'timeout',
  'rejected',
  'not_found',
  'too_large',
  'not_a_calendar',
  'empty',
] satisfies CalendarFetchError[])

/** Settings are saved this long after the last change, so typing a short name sends one request. */
const SAVE_DELAY_MS = 500

function Alert({ children, tone = 'danger' }: { children: ReactNode; tone?: 'danger' | 'warning' }) {
  return (
    <p
      role="alert"
      className={
        tone === 'danger'
          ? 'rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900'
          : 'rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900'
      }
    >
      {children}
    </p>
  )
}

function Section({
  title,
  intro,
  children,
  aside,
}: {
  title: string
  intro?: string
  children: ReactNode
  aside?: ReactNode
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id={headingId} className="text-lg font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      {intro ? <p className={mutedClass}>{intro}</p> : null}
      {children}
    </section>
  )
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

/** Keeps settings locally and saves them shortly after the last change, one request at a time. */
function useSettingsSaver(initial: CalendarSettings | null) {
  const [settings, setSettings] = useState(initial)
  const [state, setState] = useState<SaveState>('idle')
  const timer = useRef<number | undefined>(undefined)
  const queue = useRef<Promise<void>>(Promise.resolve())

  // A fresh overview from the server (connect, sync) replaces the local copy.
  useEffect(() => setSettings(initial), [initial])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const update = useCallback((next: CalendarSettings) => {
    setSettings(next)
    setState('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      queue.current = queue.current.then(() =>
        calendarApi.saveSettings(next).then(
          () => setState('saved'),
          () => setState('error'),
        ),
      )
    }, SAVE_DELAY_MS)
  }, [])

  return { settings, update, state }
}

export function CalendarPage() {
  const { t } = useTranslation(['calendar', 'common'])
  const { user, sessionPending } = useAccountSync()
  const [overview, setOverview] = useState<CalendarOverview | null>(null)
  const [loadError, setLoadError] = useState(false)

  const userId = user?.id
  useEffect(() => {
    if (!userId) return
    let active = true
    calendarApi
      .get()
      .then((loaded) => {
        if (active) setOverview(loaded)
      })
      .catch(() => {
        if (active) setLoadError(true)
      })
    return () => {
      active = false
    }
  }, [userId])

  if (sessionPending)
    return (
      <PageLayout>
        <LoadingText>{t('common:loading')}</LoadingText>
      </PageLayout>
    )
  if (!user) return <Navigate to="/sign-in" replace />

  return (
    <PageLayout>
      {loadError ? (
        <Alert>{t('loadError')}</Alert>
      ) : !overview ? (
        <LoadingText>{t('common:loading')}</LoadingText>
      ) : overview.sources.length > 0 ? (
        <ConnectedCalendar overview={overview} onOverview={setOverview} />
      ) : (
        <section className={cardClass} aria-label={t('connect.title')}>
          <h2 className="font-semibold">{t('connect.title')}</h2>
          <ConnectForm overview={overview} onDone={setOverview} />
        </section>
      )}
    </PageLayout>
  )
}

function PageLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation('calendar')
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <Link
          to="/"
          className="mb-4 -ml-2 inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t('back')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className={`mt-2 ${mutedClass}`}>{t('intro')}</p>
      </div>
      {children}
    </main>
  )
}

function ConnectForm({
  overview,
  source,
  onDone,
  onCancel,
}: {
  overview: CalendarOverview
  /** The link being replaced; without it, the form adds one. */
  source?: CalendarSourceView
  onDone: (overview: CalendarOverview) => void
  onCancel?: () => void
}) {
  const { t } = useTranslation('calendar')
  const inputId = useId()
  const labelId = useId()
  const hintId = useId()
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState(source?.label ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const host = overview.allowedHosts[0] ?? 'studip.example.org'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    try {
      const name = label.trim() || undefined
      onDone(
        source
          ? await calendarApi.replaceSource(source.id, url, name)
          : await calendarApi.addSource(url, name),
      )
      setUrl('')
      setLabel('')
    } catch (failure) {
      if (failure instanceof CalendarFetchFailedError) {
        const reason = FETCH_ERRORS.has(failure.reason)
          ? (failure.reason as CalendarFetchError)
          : 'unreachable'
        setError(t('connect.errors.fetch_failed', { reason: t(`fetchErrors.${reason}`) }))
      } else if (
        failure instanceof ApiError &&
        (failure.code === 'invalid_url' ||
          failure.code === 'host_not_allowed' ||
          failure.code === 'duplicate' ||
          failure.code === 'source_limit')
      ) {
        setError(
          t(`connect.errors.${failure.code}`, {
            host,
            hosts: overview.allowedHosts.join(', '),
            max: overview.maxSources,
          }),
        )
      } else {
        setError(t('connect.errors.generic'))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3 text-sm">
      {source ? null : (
        <ol className="list-decimal space-y-1 pl-5">
          <li>{t('connect.step1')}</li>
          <li>{t('connect.step2')}</li>
          <li>{t('connect.step3')}</li>
        </ol>
      )}
      {error ? <Alert>{error}</Alert> : null}
      <div>
        <label htmlFor={inputId} className="block font-medium">
          {t('connect.label')}
        </label>
        <input
          id={inputId}
          type="url"
          inputMode="url"
          required
          autoComplete="off"
          spellCheck={false}
          aria-describedby={hintId}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          className={`${fieldClass} font-mono`}
        />
        <p id={hintId} className="mt-1 text-xs break-all text-zinc-600 dark:text-zinc-400">
          {source ? t('connect.replaceHint') : t('connect.hint', { host })}
        </p>
      </div>
      <div>
        <label htmlFor={labelId} className="block font-medium">
          {t('connect.name')}
        </label>
        <input
          id={labelId}
          type="text"
          maxLength={40}
          placeholder={t('connect.namePlaceholder')}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          className={fieldClass}
        />
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        <Trans
          t={t}
          i18nKey="connect.privacy"
          components={{ privacy: <Link to="/privacy" hash="calendar" className={linkClass} /> }}
        />
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={pending}>
          {source ? t('connect.replace') : t('connect.submit')}
        </Button>
        {onCancel ? <Button onClick={onCancel}>{t('source.cancelChange')}</Button> : null}
      </div>
    </form>
  )
}

/** The student's Stud.IP links: up to `maxSources`, each with its sync state. */
function SourcesSection({
  overview,
  onOverview,
}: {
  overview: CalendarOverview
  onOverview: (overview: CalendarOverview) => void
}) {
  const { t } = useTranslation('calendar')
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [removing, setRemoving] = useState<CalendarSourceView | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const { sources, maxSources } = overview
  const last = sources.length === 1

  const refresh = async () => {
    setRefreshing(true)
    setNotice(null)
    try {
      onOverview(await calendarApi.refresh())
    } catch (failure) {
      setNotice(
        failure instanceof ApiError && failure.status === 429 ? t('source.tooSoon') : t('feeds.error'),
      )
    } finally {
      setRefreshing(false)
    }
  }

  const remove = async (source: CalendarSourceView) => {
    setNotice(null)
    try {
      onOverview(await calendarApi.removeSource(source.id))
    } catch {
      setNotice(t('feeds.error'))
    }
  }

  return (
    <Section
      title={t('source.title', { count: sources.length, max: maxSources })}
      intro={t('source.intro', { max: maxSources })}
      aside={
        <Button size="sm" loading={refreshing} onClick={() => void refresh()}>
          <RefreshCw aria-hidden className="size-4" />
          {t('source.refresh')}
        </Button>
      }
    >
      {notice ? (
        <p role="status" className={mutedClass}>
          {notice}
        </p>
      ) : null}
      <ul className="space-y-3">
        {sources.map((source, index) => (
          <li key={source.id} className={cardClass}>
            <div className="min-w-0 text-sm">
              <p className="font-medium break-words">
                {source.label || t('source.fallbackName', { number: index + 1 })}
              </p>
              <p className="text-zinc-600 dark:text-zinc-400">
                {source.host} · {t('feeds.eventCount', { count: source.eventCount })}
              </p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {source.lastSuccessAt
                  ? t('source.updated', { time: formatDateTime(source.lastSuccessAt) })
                  : t('source.never')}
              </p>
            </div>
            {source.status === 'error' && source.error ? (
              <Alert tone="warning">{t('source.failed', { reason: t(`fetchErrors.${source.error}`) })}</Alert>
            ) : null}
            {editing === source.id ? (
              <ConnectForm
                overview={overview}
                source={source}
                onDone={(next) => {
                  onOverview(next)
                  setEditing(null)
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setEditing(source.id)}>
                  {t('source.changeLink')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-700 dark:text-red-400"
                  onClick={() => setRemoving(source)}
                >
                  {t('source.remove')}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {editing === 'new' ? (
        <div className={cardClass}>
          <h3 className="font-semibold">{t('source.addTitle')}</h3>
          <ConnectForm
            overview={overview}
            onDone={(next) => {
              onOverview(next)
              setEditing(null)
            }}
            onCancel={() => setEditing(null)}
          />
        </div>
      ) : sources.length < maxSources ? (
        <Button onClick={() => setEditing('new')}>
          <Plus aria-hidden className="size-4" />
          {t('source.add')}
        </Button>
      ) : (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">{t('source.limit', { max: maxSources })}</p>
      )}
      {overview.refreshMinutes > 0 ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {t('source.every', { minutes: overview.refreshMinutes })}
        </p>
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={t('source.removeTitle')}
        description={last ? t('source.removeLastBody') : t('source.removeBody')}
        confirmLabel={t('source.removeConfirm')}
        destructive
        onConfirm={() => {
          if (removing) void remove(removing)
        }}
      />
    </Section>
  )
}

function ConnectedCalendar({
  overview,
  onOverview,
}: {
  overview: CalendarOverview
  onOverview: (overview: CalendarOverview) => void
}) {
  const { t } = useTranslation(['calendar', 'common'])
  const { settings, update, state } = useSettingsSaver(overview.settings)
  const alertsId = useId()
  const showKindId = useId()
  const dotsId = useId()

  if (!settings) return null

  const saveStatus =
    state === 'saving' ? t('subjects.saving') : state === 'saved' ? t('subjects.saved') : null

  return (
    <>
      <SourcesSection overview={overview} onOverview={onOverview} />

      <Section title={t('feeds.title')} intro={t('feeds.intro')}>
        <FeedsSection
          feeds={overview.feeds}
          events={overview.events}
          settings={settings}
          onFeedsChange={(feeds) => onOverview({ ...overview, feeds })}
        />
        <p className="text-xs text-zinc-600 dark:text-zinc-400">{t('feeds.secret')}</p>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">{t('feeds.refreshNote')}</p>
      </Section>

      <Section
        title={t('subjects.title')}
        intro={t('subjects.intro')}
        aside={
          saveStatus ? (
            <p role="status" className="text-xs text-zinc-600 dark:text-zinc-400">
              {saveStatus}
            </p>
          ) : null
        }
      >
        {state === 'error' ? <Alert>{t('subjects.saveError')}</Alert> : null}
        <SubjectsSection events={overview.events} settings={settings} onChange={update} />
      </Section>

      <Section title={t('display.title')}>
        <div className={cardClass}>
          <div className="flex items-start gap-2 text-sm">
            <input
              id={showKindId}
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-indigo-600"
              checked={settings.showKind}
              onChange={(event) => update({ ...settings, showKind: event.target.checked })}
            />
            <label htmlFor={showKindId}>{t('display.showKind')}</label>
          </div>
          <div className="flex items-start gap-2 text-sm">
            <input
              id={dotsId}
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-indigo-600"
              checked={settings.colorDots}
              onChange={(event) => update({ ...settings, colorDots: event.target.checked })}
            />
            <label htmlFor={dotsId}>{t('display.colorDots')}</label>
          </div>
          <fieldset className="space-y-1.5 text-sm">
            <legend className="font-medium">{t('display.cancelled')}</legend>
            {(['mark', 'hide'] as const).map((choice) => (
              <label key={choice} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="cancelled-dates"
                  className="mt-0.5 size-4 shrink-0 accent-indigo-600"
                  checked={settings.cancelled === choice}
                  onChange={() => update({ ...settings, cancelled: choice })}
                />
                {choice === 'mark' ? t('display.cancelledMark') : t('display.cancelledHide')}
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">{t('display.colorNote')}</p>
        </div>
      </Section>

      <Section title={t('alerts.title')}>
        <div className={cardClass}>
          <div className="flex items-start gap-2 text-sm">
            <input
              id={alertsId}
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-indigo-600"
              checked={settings.changeAlerts}
              onChange={(event) => update({ ...settings, changeAlerts: event.target.checked })}
            />
            <label htmlFor={alertsId}>{t('alerts.label')}</label>
          </div>
          <h3 className="pt-1 text-sm font-medium">{t('alerts.recent')}</h3>
          {overview.changes.length === 0 ? (
            <p className={mutedClass}>{t('alerts.none')}</p>
          ) : (
            <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              {overview.changes.slice(0, 12).map((change) => (
                <ChangeRow
                  key={`${change.detectedAt}|${change.uid}|${change.kind}`}
                  change={change}
                  settings={settings}
                />
              ))}
            </ul>
          )}
        </div>
      </Section>
    </>
  )
}

function ChangeRow({ change, settings }: { change: CalendarChange; settings: CalendarSettings }) {
  const { t } = useTranslation('calendar')
  const name = settings.subjects[change.subject]?.shortName || change.course
  const detail =
    change.kind === 'moved' && change.previousStart
      ? t('alerts.movedFrom', { time: formatEventStart(change.previousStart) })
      : change.kind === 'room'
        ? t('alerts.roomFrom', { from: change.previousLocation || '–', to: change.location || '–' })
        : null
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 py-2">
      <span
        className={
          change.kind === 'added' || change.kind === 'restored'
            ? 'rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200'
            : 'rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200'
        }
      >
        {t(`alerts.kinds.${change.kind}`)}
      </span>
      <span className="min-w-0 font-medium break-words">{name}</span>
      <span className="text-zinc-600 tabular-nums dark:text-zinc-400">{formatEventStart(change.start)}</span>
      {detail ? (
        <span className="w-full text-xs break-words text-zinc-600 dark:text-zinc-400">{detail}</span>
      ) : null}
    </li>
  )
}
