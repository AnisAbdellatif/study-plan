import { Link } from '@tanstack/react-router'
import { useEffect, useId, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { type CreatedShare, type ShareStatus, shareApi } from '../../lib/api.ts'
import { formatDateTime, useAccountSync } from '../account-sync.tsx'
import { Button } from '../ui/button.tsx'
import { Dialog } from '../ui/dialog.tsx'

const linkClass = 'font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300'

export function ShareDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation(['dialogs', 'common'])
  const { sync, user, state } = useAccountSync()
  const planId = user && state.kind !== 'loading' ? sync.linkedPlanId() : null
  const inputId = useId()
  const [status, setStatus] = useState<ShareStatus | null>(null)
  const [created, setCreated] = useState<CreatedShare | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Without grades unless the owner picks otherwise; an active link preselects what it shows.
  const [includeGrades, setIncludeGrades] = useState(false)
  const visibilityName = useId()

  useEffect(() => {
    if (!open || !planId) return
    setCreated(null)
    setCopied(false)
    setError(null)
    shareApi
      .status(planId)
      .then((next) => {
        setStatus(next)
        setIncludeGrades(next.active && next.includeGrades)
      })
      .catch(() => setError(t('share.statusError')))
  }, [open, planId, t])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch {
      setError(t('share.genericError'))
    } finally {
      setBusy(false)
    }
  }

  const createLink = () =>
    run(async () => {
      if (!planId) return
      const share = await shareApi.create(planId, { includeGrades })
      setCreated(share)
      setStatus({ active: true, createdAt: share.createdAt, includeGrades: share.includeGrades })
    })

  const revokeLink = () =>
    run(async () => {
      if (!planId) return
      await shareApi.revoke(planId)
      setCreated(null)
      setStatus({ active: false, createdAt: null, includeGrades: false })
    })

  const copy = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.url)
      setCopied(true)
    } catch {
      document.getElementById(inputId)?.focus()
    }
  }

  let body: React.ReactNode
  if (!user) {
    body = (
      <p className="text-sm">
        <Trans
          t={t}
          i18nKey="share.signedOut"
          components={{
            signIn: <Link to="/sign-in" className={linkClass} />,
            signUp: <Link to="/sign-up" className={linkClass} />,
          }}
        />
      </p>
    )
  } else if (!planId) {
    body = (
      <div className="space-y-3 text-sm">
        <p>{t('share.saveFirst')}</p>
        {state.kind === 'no_account_plan' ? (
          <Button variant="primary" onClick={() => void sync.uploadLocal()}>
            {t('share.saveToAccount')}
          </Button>
        ) : null}
      </div>
    )
  } else {
    body = (
      <div className="space-y-4 text-sm">
        <p className="text-zinc-600 dark:text-zinc-400">{t('share.explanation')}</p>
        {error ? (
          <p role="alert" className="text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}
        {created ? (
          <div className="space-y-2">
            <label htmlFor={inputId} className="block font-medium">
              {t('share.linkLabel')}
            </label>
            <div className="flex gap-2">
              <input
                id={inputId}
                readOnly
                value={created.url}
                onFocus={(event) => event.target.select()}
                className="h-10 min-w-0 flex-1 rounded-lg bg-white px-3 text-sm ring-1 ring-zinc-300 ring-inset dark:bg-zinc-950 dark:ring-zinc-700"
              />
              <Button onClick={copy}>{copied ? t('share.copied') : t('share.copy')}</Button>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{t('share.shownOnce')}</p>
          </div>
        ) : status?.active ? (
          <p>
            {status.createdAt
              ? t('share.activeSince', { date: formatDateTime(status.createdAt) })
              : t('share.active')}{' '}
            {status.includeGrades ? t('share.activeWithGrades') : t('share.activeWithoutGrades')}
          </p>
        ) : status ? (
          <p>{t('share.noLink')}</p>
        ) : null}
        {status ? (
          <fieldset className="space-y-2">
            <legend className="mb-1 font-medium">{t('share.visibility')}</legend>
            {([false, true] as const).map((withGrades) => (
              <label
                key={String(withGrades)}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2.5 ring-1 ring-zinc-200 ring-inset has-[:checked]:bg-indigo-50 has-[:checked]:ring-2 has-[:checked]:ring-indigo-500 dark:ring-zinc-700 dark:has-[:checked]:bg-indigo-950/40"
              >
                <input
                  type="radio"
                  name={visibilityName}
                  checked={includeGrades === withGrades}
                  onChange={() => setIncludeGrades(withGrades)}
                  className="mt-1 accent-indigo-600"
                />
                <span>
                  <span className="block font-medium">
                    {withGrades ? t('share.withGrades') : t('share.withoutGrades')}
                  </span>
                  <span className="block text-xs text-zinc-600 dark:text-zinc-400">
                    {withGrades ? t('share.withGradesHint') : t('share.withoutGradesHint')}
                  </span>
                </span>
              </label>
            ))}
            {status.active && !created && includeGrades !== status.includeGrades ? (
              <p className="text-xs text-amber-800 dark:text-amber-300">{t('share.changeHint')}</p>
            ) : null}
          </fieldset>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy || status === null} onClick={() => void createLink()}>
            {status?.active ? t('share.createNew') : t('share.create')}
          </Button>
          {status?.active ? (
            <Button variant="danger" disabled={busy} onClick={() => void revokeLink()}>
              {t('share.revoke')}
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('share.title')}>
      {body}
      <div className="mt-5 flex justify-end">
        <Button onClick={() => onOpenChange(false)}>{t('common:actions.close')}</Button>
      </div>
    </Dialog>
  )
}
