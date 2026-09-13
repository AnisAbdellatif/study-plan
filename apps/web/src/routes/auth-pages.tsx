import { Link, Navigate, useNavigate, useSearch } from '@tanstack/react-router'
import { type FormEvent, type ReactNode, useEffect, useId, useState } from 'react'
import { describeSyncState, useAccountSync } from '../components/account-sync.tsx'
import { Button } from '../components/ui/button.tsx'
import { ConfirmDialog } from '../components/ui/dialog.tsx'
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
const VERIFIED_CALLBACK = '/konto?verifiziert=1'

interface AuthError {
  status?: number
  code?: string
}

export function describeAuthError(error: AuthError): string {
  if (error.code === 'PASSWORD_TOO_SHORT')
    return `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`
  if (error.code?.startsWith('USER_ALREADY_EXISTS'))
    return 'Mit dieser E-Mail-Adresse gibt es schon ein Konto. Melde dich an oder setze dein Passwort zurück.'
  if (error.code === 'INVALID_TOKEN') return 'Der Link ist ungültig oder abgelaufen. Fordere einen neuen an.'
  switch (error.status) {
    case 401:
      return 'E-Mail-Adresse oder Passwort stimmen nicht.'
    case 403:
      return 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link, den wir dir geschickt haben.'
    case 429:
      return 'Zu viele Versuche. Bitte warte eine Minute und versuche es dann noch einmal.'
    default:
      return 'Das hat nicht geklappt. Bitte versuche es später noch einmal.'
  }
}

function AuthLayout({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[80dvh] max-w-md flex-col justify-center px-4 py-10">
      <Link
        to="/"
        className="text-xs font-medium tracking-wide text-indigo-600 uppercase dark:text-indigo-400"
      >
        Studienplaner
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
    <AuthLayout
      title="Anmelden"
      intro="Mit einem Konto ist dein Plan auf allen deinen Geräten verfügbar und nicht nur in diesem Browser."
    >
      <form onSubmit={submit} className={cardClass}>
        {error ? <Alert>{describeAuthError(error)}</Alert> : null}
        {error?.status === 403 ? (
          resent ? (
            <Alert tone="success">Wir haben dir eine neue Bestätigungs-E-Mail geschickt.</Alert>
          ) : (
            <Button size="sm" onClick={resend}>
              Bestätigungs-E-Mail erneut senden
            </Button>
          )
        ) : null}
        <Field
          label="E-Mail-Adresse"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Passwort"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? 'Wird angemeldet…' : 'Anmelden'}
        </Button>
      </form>
      <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
        <Link to="/passwort-vergessen" className={linkClass}>
          Passwort vergessen?
        </Link>
        <Link to="/registrieren" className={linkClass}>
          Noch kein Konto? Registrieren
        </Link>
      </div>
    </AuthLayout>
  )
}

export function SignUpPage() {
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
    })
    setPending(false)
    if (result.error) setError(result.error)
    else setSentTo(email)
  }

  if (sentTo) {
    return (
      <AuthLayout title="Bestätige deine E-Mail-Adresse">
        <div className={cardClass}>
          <p className="text-sm">
            Wir haben dir eine E-Mail an <strong>{sentTo}</strong> geschickt. Öffne den Link darin, dann ist
            dein Konto aktiv und du bist angemeldet. Der Link ist eine Stunde gültig.
          </p>
          {resent ? (
            <Alert tone="success">Wir haben dir die E-Mail noch einmal geschickt.</Alert>
          ) : (
            <Button
              size="sm"
              onClick={async () => {
                await authClient.sendVerificationEmail({ email: sentTo, callbackURL: VERIFIED_CALLBACK })
                setResent(true)
              }}
            >
              E-Mail erneut senden
            </Button>
          )}
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Konto erstellen"
      intro="Dein Plan aus diesem Browser lässt sich danach im Konto sichern. Wir brauchen nur deine E-Mail-Adresse und ein Passwort."
    >
      <form onSubmit={submit} className={cardClass}>
        {error ? <Alert>{describeAuthError(error)}</Alert> : null}
        <Field
          label="E-Mail-Adresse"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Passwort"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={128}
          hint={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen. Ein langer Satz ist leichter zu merken als ein kurzes, kompliziertes Passwort.`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Welche Daten wir speichern, steht in der{' '}
          <Link to="/datenschutz" className={linkClass}>
            Datenschutzerklärung
          </Link>
          .
        </p>
        <Button type="submit" variant="primary" className="w-full" disabled={pending}>
          {pending ? 'Wird erstellt…' : 'Konto erstellen'}
        </Button>
      </form>
      <p className="mt-4 text-sm">
        <Link to="/anmelden" className={linkClass}>
          Schon ein Konto? Anmelden
        </Link>
      </p>
    </AuthLayout>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    const result = await authClient.requestPasswordReset({ email, redirectTo: '/passwort-neu' })
    setPending(false)
    // Only rate limiting is reported. Everything else gets the same answer, so nobody can probe for accounts.
    if (result.error?.status === 429) setError(result.error)
    else setDone(true)
  }

  return (
    <AuthLayout title="Passwort vergessen">
      <form onSubmit={submit} className={cardClass}>
        {done ? (
          <Alert tone="success">
            Falls es ein Konto mit dieser Adresse gibt, haben wir dir einen Link zum Zurücksetzen geschickt.
            Er ist eine Stunde gültig.
          </Alert>
        ) : (
          <>
            {error ? <Alert>{describeAuthError(error)}</Alert> : null}
            <Field
              label="E-Mail-Adresse"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" variant="primary" className="w-full" disabled={pending}>
              Link anfordern
            </Button>
          </>
        )}
      </form>
      <p className="mt-4 text-sm">
        <Link to="/anmelden" className={linkClass}>
          Zurück zur Anmeldung
        </Link>
      </p>
    </AuthLayout>
  )
}

export function ResetPasswordPage() {
  const search = useSearch({ strict: false }) as { token?: unknown; error?: unknown }
  const token = typeof search.token === 'string' ? search.token : null
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)
  const [done, setDone] = useState(false)

  if (!token || search.error) {
    return (
      <AuthLayout title="Link ungültig">
        <div className={cardClass}>
          <Alert>{describeAuthError({ code: 'INVALID_TOKEN' })}</Alert>
          <Link to="/passwort-vergessen" className={linkClass}>
            Neuen Link anfordern
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
    <AuthLayout title="Neues Passwort festlegen">
      {done ? (
        <div className={cardClass}>
          <Alert tone="success">Dein Passwort ist geändert. Andere Anmeldungen wurden beendet.</Alert>
          <Link to="/anmelden" className={linkClass}>
            Jetzt anmelden
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className={cardClass}>
          {error ? (
            <Alert>
              {error.code === 'PASSWORDS_DIFFER'
                ? 'Die beiden Passwörter stimmen nicht überein.'
                : describeAuthError(error)}
            </Alert>
          ) : null}
          <Field
            label="Neues Passwort"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label="Passwort wiederholen"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            Passwort speichern
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}

type ReminderState = { status: 'loading' } | { status: 'ready'; enabled: boolean } | { status: 'error' }

function ReminderSettings() {
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
        E-Mail-Erinnerungen
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Wir schreiben dir 3 Tage vor dem letzten Tag zur Abmeldung und 7 Tage vor einer Prüfung. Grundlage
        sind die Prüfungstermine in deinen im Konto gespeicherten Plänen. Die E-Mails enthalten nur Modulnamen
        und Daten.
      </p>
      {state.status === 'error' ? (
        <Alert>
          Die Einstellung ließ sich nicht laden oder speichern. Bitte versuche es später noch einmal.
        </Alert>
      ) : null}
      {state.status === 'loading' ? (
        <p className="text-sm">Wird geladen…</p>
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
          <label htmlFor={checkboxId}>An Abmeldefristen und Prüfungen erinnern</label>
        </div>
      ) : null}
    </section>
  )
}

/** Shown only to accounts listed in ADMIN_EMAILS; everyone else gets a 404 from the check. */
function AdminLink() {
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
        Zur Verwaltung
      </Link>
    </p>
  )
}

export function UnsubscribePage() {
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
    <AuthLayout title="E-Mail-Erinnerungen ausschalten">
      {token === '' ? (
        <Alert>
          Der Link ist unvollständig. Öffne ihn direkt aus der E-Mail oder schalte die Erinnerungen im Konto
          aus.
        </Alert>
      ) : state === 'done' ? (
        <Alert tone="success">
          Erinnerungen sind ausgeschaltet. Auf der Kontoseite kannst du sie jederzeit wieder einschalten.
        </Alert>
      ) : (
        <div className="mt-6 space-y-4">
          {state === 'error' ? (
            <Alert>
              Der Link ist ungültig oder abgelaufen. Du kannst die Erinnerungen im Konto ausschalten.
            </Alert>
          ) : null}
          <p className="text-sm">Du bekommst dann keine Erinnerungen an Abmeldefristen und Prüfungen mehr.</p>
          <Button variant="primary" disabled={state === 'pending'} onClick={() => void unsubscribe()}>
            Erinnerungen ausschalten
          </Button>
        </div>
      )}
      <p className="mt-6 text-sm">
        <Link to="/konto" className={linkClass}>
          Zum Konto
        </Link>
      </p>
    </AuthLayout>
  )
}

export function AccountPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { verifiziert?: unknown }
  const { sync, state, user, sessionPending } = useAccountSync()
  const { plan } = useGuestState()
  const [password, setPassword] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [exportError, setExportError] = useState(false)

  if (sessionPending) {
    return (
      <AuthLayout title="Konto">
        <p className="mt-6 text-sm">Wird geladen…</p>
      </AuthLayout>
    )
  }
  if (!user) return <Navigate to="/anmelden" replace />

  const exportData = async () => {
    setExportError(false)
    try {
      const response = await fetch('/api/account/export', { credentials: 'same-origin' })
      if (!response.ok) throw new Error(String(response.status))
      const filename =
        /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ??
        'studienplaner-daten.json'
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
          ? 'Das Passwort stimmt nicht.'
          : describeAuthError(result.error),
      )
      return
    }
    sync.stop()
    void navigate({ to: '/' })
  }

  return (
    <AuthLayout title="Dein Konto">
      {search.verifiziert ? (
        <Alert tone="success">Deine E-Mail-Adresse ist bestätigt. Willkommen!</Alert>
      ) : null}

      <section className={cardClass} aria-labelledby="konto-plan">
        <h2 id="konto-plan" className="font-semibold">
          Plan
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Angemeldet als <strong className="text-zinc-900 dark:text-zinc-100">{user.email}</strong>.{' '}
          {describeSyncState(state, true)}.
        </p>
        <div className="flex flex-wrap gap-2">
          {state.kind === 'no_account_plan' && plan ? (
            <Button variant="primary" onClick={() => void sync.uploadLocal()}>
              Plan im Konto sichern
            </Button>
          ) : null}
          {state.kind === 'error' ? (
            <Button onClick={() => void sync.retry()}>Erneut versuchen</Button>
          ) : null}
          <Link to={plan ? '/' : '/start'} className={`${linkClass} self-center text-sm`}>
            {plan ? 'Zum Plan' : 'Plan anlegen'}
          </Link>
        </div>
      </section>

      <ReminderSettings />
      <AdminLink />

      <section className={cardClass} aria-labelledby="konto-daten">
        <h2 id="konto-daten" className="font-semibold">
          Deine Daten
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Lade alles herunter, was zu deinem Konto gespeichert ist: E-Mail-Adresse, Pläne mit Noten und aktive
          Anmeldungen.
        </p>
        {exportError ? <Alert>Der Download hat nicht geklappt. Bitte versuche es noch einmal.</Alert> : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportData}>Daten herunterladen (JSON)</Button>
          <Button variant="ghost" onClick={signOut}>
            Abmelden
          </Button>
        </div>
      </section>

      <section className={cardClass} aria-labelledby="konto-loeschen">
        <h2 id="konto-loeschen" className="font-semibold">
          Konto löschen
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Löscht dein Konto und alle Pläne darin endgültig vom Server. Der Plan in diesem Browser bleibt
          erhalten, bis du ihn selbst löschst.
        </p>
        {deleteError ? <Alert>{deleteError}</Alert> : null}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            setConfirmDelete(true)
          }}
          className="space-y-3"
        >
          <Field
            label="Passwort zur Bestätigung"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" variant="danger">
            Konto löschen…
          </Button>
        </form>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Konto endgültig löschen?"
        description="Dein Konto und alle im Konto gespeicherten Pläne werden sofort gelöscht. Das lässt sich nicht rückgängig machen."
        confirmLabel="Endgültig löschen"
        destructive
        onConfirm={() => void deleteAccount()}
      />
    </AuthLayout>
  )
}
