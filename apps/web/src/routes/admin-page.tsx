import { Link } from '@tanstack/react-router'
import { type FormEvent, useCallback, useEffect, useId, useState } from 'react'
import { Button } from '../components/ui/button.tsx'
import { ConfirmDialog } from '../components/ui/dialog.tsx'
import {
  type AdminAction,
  type AdminAuditEntry,
  type AdminStats,
  type AdminUser,
  ApiError,
  adminApi,
} from '../lib/api.ts'

const cardClass = 'rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'
const numberFormat = new Intl.NumberFormat('de-DE')
const dateFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' })
const dateTimeFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' })

const ACTION_LABEL: Record<AdminAction, string> = {
  send_verification_email: 'Bestätigungs-E-Mail gesendet',
  revoke_shares: 'Geteilte Links deaktiviert',
  sign_out: 'Überall abgemeldet',
  delete_user: 'Konto gelöscht',
}

type Access = 'checking' | 'allowed' | 'denied' | 'error'

function Stat({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className={cardClass}>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{numberFormat.format(value)}</p>
      {detail ? <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{detail}</p> : null}
    </div>
  )
}

function Overview({ stats }: { stats: AdminStats }) {
  return (
    <section aria-labelledby="admin-overview" className="space-y-3">
      <h2 id="admin-overview" className="text-lg font-semibold">
        Überblick
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Konten"
          value={stats.users.total}
          detail={`${numberFormat.format(stats.users.verified)} bestätigt, ${numberFormat.format(stats.users.newLast30Days)} neu in 30 Tagen`}
        />
        <Stat label="Aktiv in 30 Tagen" value={stats.users.activeLast30Days} />
        <Stat
          label="Pläne im Konto"
          value={stats.plans.total}
          detail={`${numberFormat.format(stats.shares.active)} davon mit aktivem Link geteilt`}
        />
        <Stat
          label="Erinnerungen eingeschaltet"
          value={stats.reminders.enabled}
          detail={`${numberFormat.format(stats.reminders.sentLast30Days)} Erinnerungen in 30 Tagen verschickt`}
        />
      </div>
      <div className={`${cardClass} overflow-x-auto`}>
        <h3 className="text-sm font-semibold">Pläne je Vorlage</h3>
        {stats.plans.byPreset.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Noch keine Pläne im Konto gespeichert.
          </p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-zinc-600 dark:text-zinc-400">
              <tr>
                <th className="py-1 pr-4 font-medium">Studiengang</th>
                <th className="py-1 pr-4 font-medium">Prüfungsordnung</th>
                <th className="py-1 text-right font-medium">Pläne</th>
              </tr>
            </thead>
            <tbody>
              {stats.plans.byPreset.map((row) => (
                <tr
                  key={`${row.presetId}|${row.poVersion}`}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                >
                  <td className="py-1.5 pr-4">
                    {row.programmeName}
                    <span className="block text-xs text-zinc-600 dark:text-zinc-400">
                      {row.universityName}
                    </span>
                  </td>
                  <td className="py-1.5 pr-4">{row.poVersion}</td>
                  <td className="py-1.5 text-right tabular-nums">{numberFormat.format(row.plans)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

interface PendingAction {
  user: AdminUser
  action: AdminAction
}

const CONFIRM: Record<AdminAction, { title: string; description: (email: string) => string; label: string }> =
  {
    send_verification_email: {
      title: 'Bestätigungs-E-Mail senden?',
      description: (email) => `${email} bekommt einen neuen Link zur Bestätigung der E-Mail-Adresse.`,
      label: 'Senden',
    },
    revoke_shares: {
      title: 'Geteilte Links deaktivieren?',
      description: (email) => `Alle aktiven Links von ${email} funktionieren danach nicht mehr.`,
      label: 'Deaktivieren',
    },
    sign_out: {
      title: 'Überall abmelden?',
      description: (email) => `${email} wird auf allen Geräten abgemeldet und muss sich neu anmelden.`,
      label: 'Abmelden',
    },
    delete_user: {
      title: 'Konto endgültig löschen?',
      description: (email) =>
        `Das Konto ${email} wird mit allen Plänen, Links und Einstellungen gelöscht. Das lässt sich nicht rückgängig machen.`,
      label: 'Endgültig löschen',
    },
  }

function Accounts({ selfEmail, onChanged }: { selfEmail: string; onChanged: () => void }) {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)

  const load = useCallback(async (value: string) => {
    try {
      setUsers(await adminApi.users(value))
    } catch {
      setMessage({ tone: 'error', text: 'Die Konten ließen sich nicht laden.' })
    }
  }, [])

  useEffect(() => {
    void load('')
  }, [load])

  const search = (event: FormEvent) => {
    event.preventDefault()
    setMessage(null)
    void load(query.trim())
  }

  const run = async ({ user, action }: PendingAction) => {
    setMessage(null)
    try {
      switch (action) {
        case 'send_verification_email':
          await adminApi.sendVerificationEmail(user.id)
          setMessage({ tone: 'ok', text: `Bestätigungs-E-Mail an ${user.email} gesendet.` })
          break
        case 'revoke_shares': {
          const { revoked } = await adminApi.revokeShares(user.id)
          setMessage({
            tone: 'ok',
            text: `${revoked} ${revoked === 1 ? 'Link' : 'Links'} von ${user.email} deaktiviert.`,
          })
          break
        }
        case 'sign_out': {
          const { sessions } = await adminApi.signOut(user.id)
          setMessage({
            tone: 'ok',
            text: `${user.email} auf ${sessions} ${sessions === 1 ? 'Gerät' : 'Geräten'} abgemeldet.`,
          })
          break
        }
        case 'delete_user':
          await adminApi.deleteUser(user.id)
          setMessage({ tone: 'ok', text: `Konto ${user.email} gelöscht.` })
          break
      }
    } catch (error) {
      const code = error instanceof ApiError ? error.code : ''
      setMessage({
        tone: 'error',
        text:
          code === 'cannot_modify_self'
            ? 'Dein eigenes Konto verwaltest du auf der Kontoseite.'
            : code === 'already_verified'
              ? 'Die E-Mail-Adresse ist schon bestätigt.'
              : 'Das hat nicht geklappt. Bitte versuche es noch einmal.',
      })
    }
    await load(query.trim())
    onChanged()
  }

  return (
    <section aria-labelledby="admin-accounts" className="space-y-3">
      <h2 id="admin-accounts" className="text-lg font-semibold">
        Konten
      </h2>
      <form onSubmit={search} className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <label htmlFor={searchId} className="block text-sm font-medium">
            E-Mail-Adresse enthält
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700"
          />
        </div>
        <Button type="submit">Suchen</Button>
      </form>
      {message ? (
        <p
          role="status"
          className={
            message.tone === 'ok'
              ? 'text-sm text-emerald-800 dark:text-emerald-300'
              : 'text-sm text-red-700 dark:text-red-400'
          }
        >
          {message.text}
        </p>
      ) : null}
      <div className={`${cardClass} overflow-x-auto p-0`}>
        {users === null ? (
          <p className="p-4 text-sm">Wird geladen…</p>
        ) : users.length === 0 ? (
          <p className="p-4 text-sm text-zinc-600 dark:text-zinc-400">Keine Konten gefunden.</p>
        ) : (
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="text-zinc-600 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2 font-medium">E-Mail-Adresse</th>
                <th className="px-2 py-2 font-medium">Angelegt</th>
                <th className="px-2 py-2 font-medium">Zuletzt aktiv</th>
                <th className="px-2 py-2 text-right font-medium">Pläne</th>
                <th className="px-2 py-2 text-right font-medium">Links</th>
                <th className="px-4 py-2 font-medium">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const self = user.email.toLowerCase() === selfEmail.toLowerCase()
                return (
                  <tr key={user.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                    <td className="px-4 py-2">
                      <span className="font-medium break-all">{user.email}</span>
                      <span className="block text-xs text-zinc-600 dark:text-zinc-400">
                        {user.emailVerified ? 'bestätigt' : 'nicht bestätigt'}
                        {user.reminders ? ' · Erinnerungen an' : ''}
                        {self ? ' · du' : ''}
                      </span>
                    </td>
                    <td className="px-2 py-2 tabular-nums">{dateFormat.format(new Date(user.createdAt))}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {user.lastActiveAt ? dateFormat.format(new Date(user.lastActiveAt)) : '–'}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{user.plans}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{user.activeShares}</td>
                    <td className="px-4 py-2">
                      {self ? (
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">über die Kontoseite</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {user.emailVerified ? null : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPending({ user, action: 'send_verification_email' })}
                            >
                              Bestätigung senden
                            </Button>
                          )}
                          {user.activeShares > 0 ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPending({ user, action: 'revoke_shares' })}
                            >
                              Links deaktivieren
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPending({ user, action: 'sign_out' })}
                          >
                            Abmelden
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-700 dark:text-red-400"
                            onClick={() => setPending({ user, action: 'delete_user' })}
                          >
                            Löschen…
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Zeigt die 25 neuesten passenden Konten. Noten und Planinhalte sind hier bewusst nicht einsehbar.
      </p>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title={pending ? CONFIRM[pending.action].title : ''}
        description={pending ? CONFIRM[pending.action].description(pending.user.email) : ''}
        confirmLabel={pending ? CONFIRM[pending.action].label : ''}
        destructive={pending?.action === 'delete_user'}
        onConfirm={() => {
          if (pending) void run(pending)
          setPending(null)
        }}
      />
    </section>
  )
}

function AuditLog({ entries }: { entries: AdminAuditEntry[] }) {
  return (
    <section aria-labelledby="admin-audit" className="space-y-3">
      <h2 id="admin-audit" className="text-lg font-semibold">
        Protokoll
      </h2>
      <div className={cardClass}>
        {entries.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Noch keine Aktionen.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-x-4">
                <span>
                  {ACTION_LABEL[entry.action]}{' '}
                  <span className="text-zinc-600 dark:text-zinc-400">· Konto {entry.targetUserId}</span>
                </span>
                <span className="text-xs text-zinc-600 tabular-nums dark:text-zinc-400">
                  {entry.adminEmail}, {dateTimeFormat.format(new Date(entry.createdAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">
          Die letzten 50 Aktionen. Einträge werden nach einem Jahr gelöscht.
        </p>
      </div>
    </section>
  )
}

export function AdminPage() {
  const [access, setAccess] = useState<Access>('checking')
  const [selfEmail, setSelfEmail] = useState('')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [audit, setAudit] = useState<AdminAuditEntry[]>([])

  const refresh = useCallback(async () => {
    const [nextStats, nextAudit] = await Promise.all([adminApi.stats(), adminApi.audit()])
    setStats(nextStats)
    setAudit(nextAudit)
  }, [])

  useEffect(() => {
    let active = true
    adminApi
      .me()
      .then(async (me) => {
        if (!active) return
        setSelfEmail(me.email)
        setAccess('allowed')
        await refresh()
      })
      .catch((error: unknown) => {
        if (!active) return
        setAccess(
          error instanceof ApiError && (error.status === 401 || error.status === 404) ? 'denied' : 'error',
        )
      })
    return () => {
      active = false
    }
  }, [refresh])

  if (access !== 'allowed') {
    return (
      <main className="mx-auto max-w-md space-y-3 px-4 py-10">
        <h1 className="text-xl font-semibold">
          {access === 'checking' ? 'Wird geladen…' : access === 'denied' ? 'Seite nicht gefunden' : 'Fehler'}
        </h1>
        {access === 'denied' ? (
          <p className="text-sm">Diese Seite gibt es nicht oder du hast keinen Zugriff.</p>
        ) : access === 'error' ? (
          <p className="text-sm">Die Verwaltung ist gerade nicht erreichbar.</p>
        ) : null}
        {access !== 'checking' ? (
          <Link to="/" className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
            Zur Startseite
          </Link>
        ) : null}
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6">
      <header>
        <p className="text-xs font-medium tracking-wide text-indigo-600 uppercase dark:text-indigo-400">
          Studienplaner
        </p>
        <h1 className="text-xl font-semibold">Verwaltung</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Angemeldet als {selfEmail}</p>
      </header>
      {stats ? <Overview stats={stats} /> : <p className="text-sm">Zahlen werden geladen…</p>}
      <Accounts selfEmail={selfEmail} onChanged={() => void refresh().catch(() => {})} />
      <AuditLog entries={audit} />
    </main>
  )
}
