import { Link, Navigate, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useId, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { describeSyncState, useAccountSync } from '../components/account-sync.tsx'
import { BrandLogo } from '../components/brand-logo.tsx'
import { Button } from '../components/ui/button.tsx'
import { ConfirmDialog } from '../components/ui/dialog.tsx'
import i18n, { currentLocale } from '../i18n/index.ts'
import { adminApi, notificationApi } from '../lib/api.ts'
import { authClient } from '../lib/auth-client.ts'
import { downloadFile } from '../lib/files.ts'
import { useGuestState } from '../store/guest-store.ts'

const inputClass =
  'mt-1 h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700'
const cardClass =
  'mt-6 space-y-4 rounded-xl bg-white p-5 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'
const linkClass = 'font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300'

export const MIN_PASSWORD_LENGTH = 10
const VERIFIED_CALLBACK = '/account?verified=1'

interface AuthError {
  status?: number
  code?: string
}

export function describeAuthError(error: AuthError): string {
  if (error.code === 'PASSWORD_TOO_SHORT')
    return i18n.t('auth:errors.passwordTooShort', { min: MIN_PASSWORD_LENGTH })
  if (error.code?.startsWith('USER_ALREADY_EXISTS')) return i18n.t('auth:errors.userExists')
  if (error.code === 'INVALID_TOKEN') return i18n.t('auth:errors.invalidToken')
  switch (error.status) {
    case 401:
      return i18n.t('auth:errors.invalidCredentials')
    case 403:
      return i18n.t('auth:errors.emailNotVerified')
    case 429:
      return i18n.t('auth:errors.tooManyAttempts')
    default:
      return i18n.t('auth:errors.generic')
  }
}

function AuthLayout({
  title,
  intro,
  back,
  children,
}: {
  title: string
  intro?: ReactNode
  /** A labelled way back, shown above everything else. */
  back?: { to: '/' | '/start'; label: string }
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <main className="mx-auto flex min-h-[80dvh] max-w-md flex-col justify-center px-4 py-10">
      {back ? (
        <Link
          to={back.to}
          className="mb-6 inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1.5 -ml-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {back.label}
        </Link>
      ) : null}
      <Link
        to="/"
        className="flex w-fit items-center gap-2 text-xs font-medium tracking-wide text-indigo-600 uppercase dark:text-indigo-400"
      >
        <BrandLogo className="size-7" />
        {t('brand')}
      </Link>
      <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
      {intro ? <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{intro}</p> : null}
      {children}
    </main>
  )
}

function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & Omit<React.ComponentProps<'input'>, 'id' | 'className'>) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input id={id} className={inputClass} {...input} />
      {hint ? <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{hint}</p> : null}
    </div>
  )
}

function Alert({ children, tone = 'danger' }: { children: ReactNode; tone?: 'danger' | 'success' }) {
  return (
    <p
      role={tone === 'danger' ? 'alert' : 'status'}
      className={
        tone === 'danger'
          ? 'rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900'
          : 'rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-950 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-100 dark:ring-emerald-900'
      }
    >
      {children}
    </p>
  )
}

export function SignInPage() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)
  const [resent, setResent] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    const result = await authClient.signIn.email({ email, password })
    setPending(false)
    if (result.error) setError(result.error)
    else void navigate({ to: '/' })
  }

  const resend = async () => {
    await authClient.sendVerificationEmail({ email, callbackURL: VERIFIED_CALLBACK })
    setResent(true)
  }

  return (
    <AuthLayout title={t('signIn.title')} intro={t('signIn.intro')}>
      <form onSubmit={submit} className={cardClass}>
        {error ? <Alert>{describeAuthError(error)}</Alert> : null}
        {error?.status === 403 ? (
          resent ? (
            <Alert tone="success">{t('signIn.verificationResent')}</Alert>
          ) : (
            <Button size="sm" onClick={resend}>
              {t('signIn.resendVerification')}
            </Button>
          )
        ) : null}
        <Field
          label={t('fields.email')}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label={t('fields.password')}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? t('signIn.pending') : t('signIn.submit')}
        </Button>
      </form>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
        <Link to="/forgot-password" className={linkClass}>
          {t('signIn.forgotPassword')}
        </Link>
        <Link to="/sign-up" className={linkClass}>
          {t('signIn.noAccount')}
        </Link>
      </div>
    </AuthLayout>
  )
}

export function SignUpPage() {
  const { t } = useTranslation('auth')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [resent, setResent] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    const result = await authClient.signUp.email({
      email,
      password,
      // Better Auth requires a name; the part before the @ avoids asking for more personal data.
      name: email.split('@')[0] || email,
      callbackURL: VERIFIED_CALLBACK,
      locale: currentLocale(),
    })
    setPending(false)
    if (result.error) setError(result.error)
    else setSentTo(email)
  }

  if (sentTo) {
    return (
      <AuthLayout title={t('signUp.checkTitle')}>
        <div className={cardClass}>
          <p className="text-sm">
            <Trans
              t={t}
              i18nKey="signUp.checkText"
              values={{ email: sentTo }}
              components={{ strong: <strong /> }}
            />
          </p>
          {resent ? (
            <Alert tone="success">{t('signUp.resent')}</Alert>
          ) : (
            <Button
              size="sm"
              onClick={async () => {
                await authClient.sendVerificationEmail({ email: sentTo, callbackURL: VERIFIED_CALLBACK })
                setResent(true)
              }}
            >
              {t('signUp.resend')}
            </Button>
          )}
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t('signUp.title')} intro={t('signUp.intro')}>
      <form onSubmit={submit} className={cardClass}>
        {error ? <Alert>{describeAuthError(error)}</Alert> : null}
        <Field
          label={t('fields.email')}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label={t('fields.password')}
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={128}
          hint={t('signUp.passwordHint', { min: MIN_PASSWORD_LENGTH })}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          <Trans
            t={t}
            i18nKey="signUp.privacy"
            components={{ privacyLink: <Link to="/privacy" className={linkClass} /> }}
          />
        </p>
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? t('signUp.pending') : t('signUp.submit')}
        </Button>
      </form>
      <p className="mt-4 text-sm">
        <Link to="/sign-in" className={linkClass}>
          {t('signUp.haveAccount')}
        </Link>
      </p>
    </AuthLayout>
  )
}

export function ForgotPasswordPage() {
  const { t } = useTranslation('auth')
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    const result = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })
    setPending(false)
    // Only rate limiting is reported. Everything else gets the same answer, so nobody can probe for accounts.
    if (result.error?.status === 429) setError(result.error)
    else setDone(true)
  }

  return (
    <AuthLayout title={t('forgotPassword.title')}>
      <form onSubmit={submit} className={cardClass}>
        {done ? (
          <Alert tone="success">{t('forgotPassword.sent')}</Alert>
        ) : (
          <>
            {error ? <Alert>{describeAuthError(error)}</Alert> : null}
            <Field
              label={t('fields.email')}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" variant="primary" className="w-full" disabled={pending}>
              {t('forgotPassword.submit')}
            </Button>
          </>
        )}
      </form>
      <p className="mt-4 text-sm">
        <Link to="/sign-in" className={linkClass}>
          {t('forgotPassword.back')}
        </Link>
      </p>
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const { t } = useTranslation('auth')
  const search = useSearch({ strict: false }) as { token?: unknown; error?: unknown }
  const token = typeof search.token === 'string' ? search.token : null
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)
  const [done, setDone] = useState(false)

  if (!token || search.error) {
    return (
      <AuthLayout title={t('resetPassword.invalidTitle')}>
        <div className={cardClass}>
          <Alert>{describeAuthError({ code: 'INVALID_TOKEN' })}</Alert>
          <Link to="/forgot-password" className={linkClass}>
            {t('resetPassword.requestNew')}
          </Link>
        </div>
      </AuthLayout>
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password !== confirmation) {
      setError({ code: 'PASSWORDS_DIFFER' })
      return
    }
    setPending(true)
    setError(null)
    const result = await authClient.resetPassword({ newPassword: password, token })
    setPending(false)
    if (result.error) setError(result.error)
    else setDone(true)
  }

  return (
    <AuthLayout title={t('resetPassword.title')}>
      {done ? (
        <div className={cardClass}>
          <Alert tone="success">{t('resetPassword.done')}</Alert>
          <Link to="/sign-in" className={linkClass}>
            {t('resetPassword.signInNow')}
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className={cardClass}>
          {error ? (
            <Alert>
              {error.code === 'PASSWORDS_DIFFER' ? t('errors.passwordsDiffer') : describeAuthError(error)}
            </Alert>
          ) : null}
          <Field
            label={t('resetPassword.newPassword')}
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label={t('resetPassword.repeatPassword')}
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            {t('resetPassword.submit')}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}

type ReminderState = { status: 'loading' } | { status: 'ready'; enabled: boolean } | { status: 'error' }

function ReminderSettings() {
  const { t } = useTranslation(['auth', 'common'])
  const [state, setState] = useState<ReminderState>({ status: 'loading' })
  const [saving, setSaving] = useState(false)
  const checkboxId = useId()

  useEffect(() => {
    let active = true
    notificationApi
      .get()
      .then((settings) => {
        if (active) setState({ status: 'ready', enabled: settings.examReminders })
      })
      .catch(() => {
        if (active) setState({ status: 'error' })
      })
    return () => {
      active = false
    }
  }, [])

  const toggle = async (enabled: boolean) => {
    setSaving(true)
    try {
      const settings = await notificationApi.update({ examReminders: enabled })
      setState({ status: 'ready', enabled: settings.examReminders })
    } catch {
      setState({ status: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={cardClass} aria-labelledby="konto-erinnerungen">
      <h2 id="konto-erinnerungen" className="font-semibold">
        {t('reminders.title')}
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('reminders.intro')}</p>
      {state.status === 'error' ? <Alert>{t('reminders.error')}</Alert> : null}
      {state.status === 'loading' ? (
        <p className="text-sm">{t('common:loading')}</p>
      ) : state.status === 'ready' ? (
        <div className="flex items-start gap-2 text-sm">
          <input
            id={checkboxId}
            type="checkbox"
            className="mt-0.5 size-4 accent-indigo-600"
            checked={state.enabled}
            disabled={saving}
            onChange={(event) => void toggle(event.target.checked)}
          />
          <label htmlFor={checkboxId}>{t('reminders.label')}</label>
        </div>
      ) : null}
    </section>
  )
}

/** Shown only to accounts listed in ADMIN_EMAILS; everyone else gets a 404 from the check. */
/**
 * Changing the password goes through the same one-time e-mail link as a forgotten password: it proves access to
 * the address, the link works once and expires after an hour, and using it signs out every session.
 */
export function ChangePasswordSection({ email }: { email: string }) {
  const { t } = useTranslation('auth')
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)

  const send = async () => {
    setPending(true)
    setError(null)
    const result = await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' })
    setPending(false)
    if (result.error) {
      setError(result.error)
      setSent(false)
    } else {
      setSent(true)
    }
  }

  return (
    <section className={cardClass} aria-labelledby="konto-passwort">
      <h2 id="konto-passwort" className="font-semibold">
        {t('account.password.title')}
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('account.password.intro')}</p>
      {error ? <Alert>{describeAuthError(error)}</Alert> : null}
      {sent ? (
        <Alert tone="success">
          <Trans
            t={t}
            i18nKey="account.password.sent"
            values={{ email }}
            components={{ strong: <strong /> }}
          />
        </Alert>
      ) : null}
      <div>
        <Button onClick={() => void send()} disabled={pending}>
          {pending
            ? t('account.password.pending')
            : sent
              ? t('account.password.resend')
              : t('account.password.submit')}
        </Button>
      </div>
    </section>
  )
}

function AdminLink() {
  const { t } = useTranslation('auth')
  const [allowed, setAllowed] = useState(false)
  useEffect(() => {
    let active = true
    adminApi
      .me()
      .then(() => {
        if (active) setAllowed(true)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  if (!allowed) return null
  return (
    <p className="text-sm">
      <Link to="/admin" className={linkClass}>
        {t('account.adminLink')}
      </Link>
    </p>
  )
}

export function UnsubscribePage() {
  const { t } = useTranslation('auth')
  const search = useSearch({ strict: false }) as { token?: unknown }
  const token = typeof search.token === 'string' ? search.token : ''
  const [state, setState] = useState<'idle' | 'pending' | 'done' | 'error'>('idle')

  const unsubscribe = async () => {
    setState('pending')
    try {
      await notificationApi.unsubscribe(token)
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <AuthLayout title={t('unsubscribe.title')}>
      {token === '' ? (
        <Alert>{t('unsubscribe.incomplete')}</Alert>
      ) : state === 'done' ? (
        <Alert tone="success">{t('unsubscribe.done')}</Alert>
      ) : (
        <div className="mt-6 space-y-4">
          {state === 'error' ? <Alert>{t('unsubscribe.invalid')}</Alert> : null}
          <p className="text-sm">{t('unsubscribe.explanation')}</p>
          <Button variant="primary" disabled={state === 'pending'} onClick={() => void unsubscribe()}>
            {t('unsubscribe.submit')}
          </Button>
        </div>
      )}
      <p className="mt-6 text-sm">
        <Link to="/account" className={linkClass}>
          {t('unsubscribe.toAccount')}
        </Link>
      </p>
    </AuthLayout>
  )
}

export function AccountPage() {
  const { t } = useTranslation(['auth', 'common'])
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { verified?: unknown }
  const { sync, state, user, sessionPending } = useAccountSync()
  const { plan } = useGuestState()
  const [password, setPassword] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [exportError, setExportError] = useState(false)

  if (sessionPending) {
    return (
      <AuthLayout title={t('account.loadingTitle')}>
        <p className="mt-6 text-sm">{t('common:loading')}</p>
      </AuthLayout>
    )
  }
  if (!user) return <Navigate to="/sign-in" replace />

  const exportData = async () => {
    setExportError(false)
    try {
      const response = await fetch('/api/account/export', { credentials: 'same-origin' })
      if (!response.ok) throw new Error(String(response.status))
      const filename =
        /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ??
        t('account.data.exportFilename')
      downloadFile(filename, await response.text(), 'application/json')
    } catch {
      setExportError(true)
    }
  }

  const signOut = async () => {
    await authClient.signOut()
    sync.stop()
    void navigate({ to: '/' })
  }

  const deleteAccount = async () => {
    setDeleteError(null)
    const result = await authClient.deleteUser({ password })
    if (result.error) {
      setDeleteError(
        result.error.status === 401 || result.error.status === 400
          ? t('errors.wrongPassword')
          : describeAuthError(result.error),
      )
      return
    }
    sync.stop()
    void navigate({ to: '/' })
  }

  return (
    <AuthLayout
      title={t('account.title')}
      back={
        plan ? { to: '/', label: t('account.backToPlan') } : { to: '/start', label: t('account.backHome') }
      }
    >
      {search.verified ? <Alert tone="success">{t('account.verified')}</Alert> : null}

      <section className={cardClass} aria-labelledby="konto-plan">
        <h2 id="konto-plan" className="font-semibold">
          {t('account.plan.title')}
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Trans
            t={t}
            i18nKey="account.plan.signedInAs"
            values={{ email: user.email }}
            components={{ strong: <strong className="text-zinc-900 dark:text-zinc-100" /> }}
          />{' '}
          {describeSyncState(state, true)}.
        </p>
        <div className="flex flex-wrap gap-2">
          {state.kind === 'no_account_plan' && plan ? (
            <Button variant="primary" onClick={() => void sync.uploadLocal()}>
              {t('account.plan.upload')}
            </Button>
          ) : null}
          {state.kind === 'error' ? (
            <Button onClick={() => void sync.retry()}>{t('account.plan.retry')}</Button>
          ) : null}
          <Link to={plan ? '/' : '/start'} className={`${linkClass} self-center text-sm`}>
            {plan ? t('account.plan.open') : t('account.plan.create')}
          </Link>
        </div>
      </section>

      <ChangePasswordSection email={user.email} />
      <ReminderSettings />
      <AdminLink />

      <section className={cardClass} aria-labelledby="konto-daten">
        <h2 id="konto-daten" className="font-semibold">
          {t('account.data.title')}
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('account.data.intro')}</p>
        {exportError ? <Alert>{t('account.data.exportError')}</Alert> : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportData}>{t('account.data.download')}</Button>
          <Button variant="ghost" onClick={signOut}>
            {t('account.data.signOut')}
          </Button>
        </div>
      </section>

      <section className={cardClass} aria-labelledby="konto-loeschen">
        <h2 id="konto-loeschen" className="font-semibold">
          {t('account.delete.title')}
        </h2>
        {user.role === 'superadmin' ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('account.delete.superadmin')}</p>
        ) : (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('account.delete.intro')}</p>
            {deleteError ? <Alert>{deleteError}</Alert> : null}
            <form
              onSubmit={(event) => {
                event.preventDefault()
                setConfirmDelete(true)
              }}
              className="space-y-3"
            >
              <Field
                label={t('account.delete.passwordLabel')}
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button type="submit" variant="danger">
                {t('account.delete.submit')}
              </Button>
            </form>
          </>
        )}
      </section>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('account.delete.confirmTitle')}
        description={t('account.delete.confirmDescription')}
        confirmLabel={t('account.delete.confirm')}
        destructive
        onConfirm={() => void deleteAccount()}
      />
    </AuthLayout>
  )
}
