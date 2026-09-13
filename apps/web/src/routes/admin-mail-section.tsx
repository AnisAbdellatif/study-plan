import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button.tsx'
import { LoadingText } from '../components/ui/spinner.tsx'
import { currentIntlLocale } from '../i18n/index.ts'
import { adminApi, type MailStatus } from '../lib/api.ts'

const cardClass = 'rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'

type Message = { tone: 'ok' | 'error'; text: string }
type Health = 'ok' | 'failing' | 'unknown' | 'console'

const HEALTH_CLASS: Record<Health, string> = {
  ok: 'bg-emerald-50 text-emerald-900 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-900',
  failing: 'bg-red-50 text-red-900 ring-red-200 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900',
  unknown: 'bg-zinc-50 text-zinc-800 ring-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-200 dark:ring-zinc-700',
  console:
    'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900',
}

/** A failure counts as current when it is newer than the last success. */
function healthOf(status: MailStatus): Health {
  if (status.transport === 'console') return 'console'
  const failed = status.lastFailure?.at
  const succeeded = status.lastSuccess?.at
  if (failed && (!succeeded || failed > succeeded)) return 'failing'
  return succeeded ? 'ok' : 'unknown'
}

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(currentIntlLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )

/** Mail delivery status with a connection check and a test e-mail, so admins can find why e-mails don't arrive. */
export function MailSection({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation(['admin', 'common'])
  const [status, setStatus] = useState<MailStatus | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<'verify' | 'test' | null>(null)
  const [message, setMessage] = useState<Message | null>(null)

  const load = useCallback(async () => {
    try {
      setStatus(await adminApi.mailStatus())
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const verify = async () => {
    setBusy('verify')
    setMessage(null)
    try {
      const result = await adminApi.verifyMail()
      setMessage(
        result.ok
          ? { tone: 'ok', text: t('mail.verifyOk', { ms: result.durationMs }) }
          : { tone: 'error', text: t('mail.verifyFailed', { error: result.error }) },
      )
    } catch {
      setMessage({ tone: 'error', text: t('messages.failed') })
    } finally {
      setBusy(null)
    }
  }

  const sendTest = async () => {
    setBusy('test')
    setMessage(null)
    try {
      const result = await adminApi.sendTestMail()
      setMessage(
        result.ok
          ? { tone: 'ok', text: t('mail.testSent', { email: result.to }) }
          : { tone: 'error', text: t('mail.testFailed', { error: result.error }) },
      )
    } catch {
      setMessage({ tone: 'error', text: t('messages.failed') })
    } finally {
      setBusy(null)
      await load()
      onChanged()
    }
  }

  const health = status ? healthOf(status) : null

  return (
    <section aria-labelledby="admin-mail" className="space-y-3">
      <h2 id="admin-mail" className="text-lg font-semibold">
        {t('mail.heading')}
      </h2>
      <div className={`${cardClass} space-y-4`}>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('mail.intro')}</p>
        {loadError ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {t('mail.loadError')}
          </p>
        ) : null}
        {!status && !loadError ? <LoadingText>{t('common:loading')}</LoadingText> : null}
        {status && health ? (
          <>
            <p className={`rounded-lg px-3 py-2 text-sm ring-1 ${HEALTH_CLASS[health]}`}>
              {t(`mail.health.${health}`)}
            </p>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
              <dt className="text-zinc-600 dark:text-zinc-400">{t('mail.transport')}</dt>
              <dd>{t(`mail.transports.${status.transport}`)}</dd>
              {status.server ? (
                <>
                  <dt className="text-zinc-600 dark:text-zinc-400">{t('mail.server')}</dt>
                  <dd className="break-all">
                    {status.server.host}:{status.server.port} ·{' '}
                    {status.server.secure ? t('mail.tls') : t('mail.starttls')}
                  </dd>
                  <dt className="text-zinc-600 dark:text-zinc-400">{t('mail.username')}</dt>
                  <dd className="break-all">{status.server.username ?? '–'}</dd>
                </>
              ) : null}
              <dt className="text-zinc-600 dark:text-zinc-400">{t('mail.from')}</dt>
              <dd className="break-all">{status.from}</dd>
              <dt className="text-zinc-600 dark:text-zinc-400">{t('mail.lastSuccess')}</dt>
              <dd>{status.lastSuccess ? formatDateTime(status.lastSuccess.at) : t('mail.never')}</dd>
              <dt className="text-zinc-600 dark:text-zinc-400">{t('mail.lastFailure')}</dt>
              <dd>
                {status.lastFailure ? (
                  <>
                    {formatDateTime(status.lastFailure.at)}
                    <span className="mt-0.5 block font-mono text-xs break-words text-red-700 dark:text-red-400">
                      {status.lastFailure.error}
                    </span>
                  </>
                ) : (
                  t('mail.never')
                )}
              </dd>
            </dl>
          </>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void verify()} loading={busy === 'verify'} disabled={busy !== null}>
            {busy === 'verify' ? t('mail.verifying') : t('mail.verify')}
          </Button>
          <Button onClick={() => void sendTest()} loading={busy === 'test'} disabled={busy !== null}>
            {busy === 'test' ? t('mail.sending') : t('mail.sendTest')}
          </Button>
        </div>
        {message ? (
          <p
            role="status"
            className={
              message.tone === 'ok'
                ? 'text-sm text-emerald-800 dark:text-emerald-300'
                : 'text-sm break-words text-red-700 dark:text-red-400'
            }
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </section>
  )
}
