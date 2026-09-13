import { Link } from '@tanstack/react-router'
import { type FormEvent, useCallback, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button.tsx'
import { ConfirmDialog } from '../components/ui/dialog.tsx'
import { currentIntlLocale } from '../i18n/index.ts'
import {
  type AdminAction,
  type AdminAuditEntry,
  type AdminStats,
  type AdminUser,
  ApiError,
  adminApi,
} from '../lib/api.ts'

const cardClass = 'rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'

// Formatters are looked up per call so they follow language changes; each locale builds them once.
const formatters = new Map<
  string,
  { number: Intl.NumberFormat; date: Intl.DateTimeFormat; dateTime: Intl.DateTimeFormat }
>()
function format() {
  const locale = currentIntlLocale()
  let entry = formatters.get(locale)
  if (!entry) {
    entry = {
      number: new Intl.NumberFormat(locale),
      date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }),
      dateTime: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }),
    }
    formatters.set(locale, entry)
  }
  return entry
}
const formatNumber = (value: number) => format().number.format(value)

type Access = 'checking' | 'allowed' | 'denied' | 'error'

function Stat({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className={cardClass}>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{formatNumber(value)}</p>
      {detail ? <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{detail}</p> : null}
    </div>
  )
}

function Overview({ stats }: { stats: AdminStats }) {
  const { t } = useTranslation('admin')
  return (
    <section aria-labelledby="admin-overview" className="space-y-3">
      <h2 id="admin-overview" className="text-lg font-semibold">
        {t('overview.heading')}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t('overview.accounts')}
          value={stats.users.total}
          detail={t('overview.accountsDetail', {
            verified: formatNumber(stats.users.verified),
            newAccounts: formatNumber(stats.users.newLast30Days),
          })}
        />
        <Stat label={t('overview.active')} value={stats.users.activeLast30Days} />
        <Stat
          label={t('overview.plans')}
          value={stats.plans.total}
          detail={t('overview.plansDetail', { shared: formatNumber(stats.shares.active) })}
        />
        <Stat
          label={t('overview.reminders')}
          value={stats.reminders.enabled}
          detail={t('overview.remindersDetail', { sent: formatNumber(stats.reminders.sentLast30Days) })}
        />
      </div>
      <div className={`${cardClass} overflow-x-auto`}>
        <h3 className="text-sm font-semibold">{t('overview.byPreset')}</h3>
        {stats.plans.byPreset.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{t('overview.byPresetEmpty')}</p>
        ) : (
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-zinc-600 dark:text-zinc-400">
              <tr>
                <th className="py-1 pr-4 font-medium">{t('overview.programme')}</th>
                <th className="py-1 pr-4 font-medium">{t('overview.regulations')}</th>
                <th className="py-1 text-right font-medium">{t('overview.plansColumn')}</th>
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
                  <td className="py-1.5 text-right tabular-nums">{formatNumber(row.plans)}</td>
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

function Accounts({ selfEmail, onChanged }: { selfEmail: string; onChanged: () => void }) {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const { t } = useTranslation('admin')

  const load = useCallback(
    async (value: string) => {
      try {
        setUsers(await adminApi.users(value))
      } catch {
        setMessage({ tone: 'error', text: t('accounts.loadError') })
      }
    },
    [t],
  )

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
          setMessage({ tone: 'ok', text: t('messages.verificationSent', { email: user.email }) })
          break
        case 'revoke_shares': {
          const { revoked } = await adminApi.revokeShares(user.id)
          setMessage({
            tone: 'ok',
            text: t('messages.revoked', { count: revoked, email: user.email }),
          })
          break
        }
        case 'sign_out': {
          const { sessions } = await adminApi.signOut(user.id)
          setMessage({
            tone: 'ok',
            text: t('messages.signedOut', { count: sessions, email: user.email }),
          })
          break
        }
        case 'delete_user':
          await adminApi.deleteUser(user.id)
          setMessage({ tone: 'ok', text: t('messages.deleted', { email: user.email }) })
          break
      }
    } catch (error) {
      const code = error instanceof ApiError ? error.code : ''
      setMessage({
        tone: 'error',
        text:
          code === 'cannot_modify_self'
            ? t('messages.cannotModifySelf')
            : code === 'already_verified'
              ? t('messages.alreadyVerified')
              : t('messages.failed'),
      })
    }
    await load(query.trim())
    onChanged()
  }

  return (
    <section aria-labelledby="admin-accounts" className="space-y-3">
      <h2 id="admin-accounts" className="text-lg font-semibold">
        {t('accounts.heading')}
      </h2>
      <form onSubmit={search} className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <label htmlFor={searchId} className="block text-sm font-medium">
            {t('accounts.search')}
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700"
          />
        </div>
        <Button type="submit">{t('accounts.submit')}</Button>
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
          <p className="p-4 text-sm">{t('loading', { ns: 'common' })}</p>
        ) : users.length === 0 ? (
          <p className="p-4 text-sm text-zinc-600 dark:text-zinc-400">{t('accounts.empty')}</p>
        ) : (
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="text-zinc-600 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2 font-medium">{t('accounts.columns.email')}</th>
                <th className="px-2 py-2 font-medium">{t('accounts.columns.created')}</th>
                <th className="px-2 py-2 font-medium">{t('accounts.columns.lastActive')}</th>
                <th className="px-2 py-2 text-right font-medium">{t('accounts.columns.plans')}</th>
                <th className="px-2 py-2 text-right font-medium">{t('accounts.columns.links')}</th>
                <th className="px-4 py-2 font-medium">{t('accounts.columns.actions')}</th>
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
                        {user.emailVerified ? t('accounts.verified') : t('accounts.unverified')}
                        {user.reminders ? ` · ${t('accounts.remindersOn')}` : ''}
                        {self ? ` · ${t('accounts.self')}` : ''}
                      </span>
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {format().date.format(new Date(user.createdAt))}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {user.lastActiveAt ? format().date.format(new Date(user.lastActiveAt)) : '–'}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{user.plans}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{user.activeShares}</td>
                    <td className="px-4 py-2">
                      {self ? (
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">
                          {t('accounts.selfActions')}
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {user.emailVerified ? null : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPending({ user, action: 'send_verification_email' })}
                            >
                              {t('accounts.actions.sendVerification')}
                            </Button>
                          )}
                          {user.activeShares > 0 ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPending({ user, action: 'revoke_shares' })}
                            >
                              {t('accounts.actions.revokeShares')}
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPending({ user, action: 'sign_out' })}
                          >
                            {t('accounts.actions.signOut')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-700 dark:text-red-400"
                            onClick={() => setPending({ user, action: 'delete_user' })}
                          >
                            {t('accounts.actions.delete')}
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
      <p className="text-xs text-zinc-600 dark:text-zinc-400">{t('accounts.footnote')}</p>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title={pending ? t(`confirm.${pending.action}.title`) : ''}
        description={pending ? t(`confirm.${pending.action}.description`, { email: pending.user.email }) : ''}
        confirmLabel={pending ? t(`confirm.${pending.action}.label`) : ''}
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
  const { t } = useTranslation('admin')
  return (
    <section aria-labelledby="admin-audit" className="space-y-3">
      <h2 id="admin-audit" className="text-lg font-semibold">
        {t('audit.heading')}
      </h2>
      <div className={cardClass}>
        {entries.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('audit.empty')}</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap justify-between gap-x-4">
                <span>
                  {t(`audit.actions.${entry.action}`)}{' '}
                  <span className="text-zinc-600 dark:text-zinc-400">
                    · {t('audit.account', { id: entry.targetUserId })}
                  </span>
                </span>
                <span className="text-xs text-zinc-600 tabular-nums dark:text-zinc-400">
                  {entry.adminEmail}, {format().dateTime.format(new Date(entry.createdAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-400">{t('audit.footnote')}</p>
      </div>
    </section>
  )
}

export function AdminPage() {
  const { t } = useTranslation('admin')
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
          {access === 'checking'
            ? t('loading', { ns: 'common' })
            : access === 'denied'
              ? t('access.notFound')
              : t('access.error')}
        </h1>
        {access === 'denied' ? (
          <p className="text-sm">{t('access.notFoundBody')}</p>
        ) : access === 'error' ? (
          <p className="text-sm">{t('access.errorBody')}</p>
        ) : null}
        {access !== 'checking' ? (
          <Link to="/" className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
            {t('access.home')}
          </Link>
        ) : null}
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6">
      <header>
        <p className="text-xs font-medium tracking-wide text-indigo-600 uppercase dark:text-indigo-400">
          {t('brand', { ns: 'common' })}
        </p>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('signedInAs', { email: selfEmail })}</p>
      </header>
      {stats ? <Overview stats={stats} /> : <p className="text-sm">{t('loadingStats')}</p>}
      <Accounts selfEmail={selfEmail} onChanged={() => void refresh().catch(() => {})} />
      <AuditLog entries={audit} />
    </main>
  )
}
