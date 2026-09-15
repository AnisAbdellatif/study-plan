import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { type FormEvent, useEffect, useId, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useAccountSync } from '../components/account-sync.tsx'
import { BrandMark } from '../components/brand-logo.tsx'
import { Button } from '../components/ui/button.tsx'
import { currentLocale } from '../i18n/index.ts'
import { ApiError, contactApi } from '../lib/api.ts'

const inputClass =
  'mt-1 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700'
const linkClass = 'font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300'

/** Bounds the API accepts, see apps/api/src/routes/contact.ts. */
const MESSAGE_MIN = 10
const MESSAGE_MAX = 5000

type State = 'idle' | 'sent' | 'failed' | 'rateLimited'

/** A message to the operator. The server mails it to the contact address and stores nothing. */
export function ContactPage() {
  const { t } = useTranslation('contact')
  const { user } = useAccountSync()
  const nameId = useId()
  const emailId = useId()
  const messageId = useId()
  const messageHintId = useId()
  const trapId = useId()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [trap, setTrap] = useState('')
  const [pending, setPending] = useState(false)
  const [state, setState] = useState<State>('idle')

  // Signed-in students write from their account address unless they typed another one.
  useEffect(() => {
    if (user?.email) setEmail((current) => current || user.email)
  }, [user?.email])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setState('idle')
    try {
      await contactApi.send({
        name: name.trim() || undefined,
        email: email.trim(),
        message: message.trim(),
        locale: currentLocale(),
        website: trap || undefined,
      })
      setState('sent')
    } catch (error) {
      setState(error instanceof ApiError && error.status === 429 ? 'rateLimited' : 'failed')
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-[80dvh] max-w-lg flex-col justify-center px-4 py-10">
      <Link
        to="/"
        className="mb-6 -ml-2 inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('back')}
      </Link>
      <BrandMark />
      <h1 className="mt-1 text-2xl font-semibold">{t('title')}</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t('intro')}</p>

      {state === 'sent' ? (
        <div
          role="status"
          className="mt-6 rounded-xl bg-emerald-50 p-5 text-sm text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-900"
        >
          <p className="font-medium">{t('sentTitle')}</p>
          <p className="mt-1">{t('sentBody', { email: email.trim() })}</p>
        </div>
      ) : (
        <form
          onSubmit={(event) => void submit(event)}
          className="mt-6 space-y-4 rounded-xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800"
        >
          {state === 'failed' || state === 'rateLimited' ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900"
            >
              {t(state)}
            </p>
          ) : null}
          <div>
            <label htmlFor={nameId} className="block text-sm font-medium">
              {t('name')}
            </label>
            <input
              id={nameId}
              type="text"
              autoComplete="name"
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={`${inputClass} h-10`}
            />
          </div>
          <div>
            <label htmlFor={emailId} className="block text-sm font-medium">
              {t('email')}
            </label>
            <input
              id={emailId}
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={`${inputClass} h-10`}
            />
          </div>
          <div>
            <label htmlFor={messageId} className="block text-sm font-medium">
              {t('message')}
            </label>
            <textarea
              id={messageId}
              required
              rows={7}
              minLength={MESSAGE_MIN}
              maxLength={MESSAGE_MAX}
              aria-describedby={messageHintId}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className={`${inputClass} resize-y py-2`}
            />
            <p id={messageHintId} className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {t('messageHint', { min: MESSAGE_MIN, max: MESSAGE_MAX })}
            </p>
          </div>
          {/* Invisible to people and skipped by screen readers; bots that fill every field give themselves away. */}
          <div aria-hidden className="hidden">
            <label htmlFor={trapId}>{t('trap')}</label>
            <input
              id={trapId}
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={trap}
              onChange={(event) => setTrap(event.target.value)}
            />
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            <Trans
              t={t}
              i18nKey="privacy"
              components={{ privacy: <Link to="/privacy" hash="contact" className={linkClass} /> }}
            />
          </p>
          <Button type="submit" variant="primary" className="w-full" loading={pending}>
            {t('submit')}
          </Button>
        </form>
      )}
    </main>
  )
}
