import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { type FormEvent, type ReactNode, useCallback, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BrandMark } from '../components/brand-logo.tsx'
import { AdminPresetsSection } from '../components/presets/admin-presets-section.tsx'
import { Button } from '../components/ui/button.tsx'
import { ConfirmDialog } from '../components/ui/dialog.tsx'
import { LoadingText, Spinner } from '../components/ui/spinner.tsx'
import { currentIntlLocale } from '../i18n/index.ts'
import {
  type AdminAction,
  type AdminAuditEntry,
  type AdminStats,
  type AdminUser,
  ApiError,
  adminApi,
  type UserRole,
} from '../lib/api.ts'
import { MailSection } from './admin-mail-section.tsx'
import { PlanLimitDialog, PlanLimitSection } from './admin-plan-limits.tsx'

const cardClass = 'rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'
const inputClass =
  'mt-1 h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700'

// Same look as the back link on the legal pages, see apps/web/src/legal/legal-page.tsx.
const backLinkClass =
  'inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-zinc-900 ring-1 ring-zinc-300 ring-inset hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800'

/** Audit entries whose target is a preset rather than an account. */
const PRESET_ACTIONS = new Set<AdminAuditEntry['action']>(['create_preset', 'update_preset', 'delete_preset'])

type ViewerRole = Exclude<UserRole, 'user'>

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

type Message = { tone: 'ok' | 'error'; text: string }

function StatusMessage({ message }: { message: Message | null }) {
  if (!message) return null
  return (
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
  )
}

function RoleBadge({ role }: { role: UserRole }) {
  const { t } = useTranslation('admin')
  if (role === 'user') return null
  return (
    <span
      className={
        role === 'superadmin'
          ? 'ml-2 rounded bg-indigo-600 px-1.5 py-0.5 text-xs font-medium text-white dark:bg-indigo-400 dark:text-zinc-950'
          : 'ml-2 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-medium text-indigo-800 dark:bg-indigo-400/20 dark:text-indigo-200'
      }
    >
      {t(`roles.${role}`)}
    </span>
  )
}

/**
 * What the viewer may do with an account, mirroring the API: nobody touches the superadmin or their own account,
 * and only the superadmin manages admins.
 */
function accessTo(viewer: ViewerRole, target: AdminUser, selfEmail: string) {
  if (target.email.toLowerCase() === selfEmail.toLowerCase()) return 'self'
  if (target.role === 'superadmin') return 'protected'
  if (target.role === 'admin' && viewer !== 'superadmin') return 'superadminOnly'
  return 'manage'
}

const ERROR_MESSAGES = {
  cannot_modify_self: 'messages.cannotModifySelf',
  already_verified: 'messages.alreadyVerified',
  protected_account: 'messages.protectedAccount',
  requires_superadmin: 'messages.requiresSuperadmin',
  not_verified: 'messages.notVerified',
  user_exists: 'messages.userExists',
  invalid_request: 'messages.invalid',
} as const

const isKnownError = (code: string): code is keyof typeof ERROR_MESSAGES =>
  Object.hasOwn(ERROR_MESSAGES, code)

function useErrorMessage() {
  const { t } = useTranslation('admin')
  return (error: unknown): Message => {
    const key =
      error instanceof ApiError && isKnownError(error.code) ? ERROR_MESSAGES[error.code] : 'messages.failed'
    return { tone: 'error', text: t(key) }
  }
}

/** Runs a confirmed account action and reports the outcome; the dialog is rendered by the caller. */
function useAccountActions(onChanged: () => void) {
  const { t } = useTranslation('admin')
  const describeError = useErrorMessage()
  const [message, setMessage] = useState<Message | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  // Set while a confirmed action runs; the dialog is already closed then, so the section shows progress.
  const [running, setRunning] = useState<PendingAction | null>(null)

  const run = async ({ user, action }: PendingAction) => {
    setMessage(null)
    setRunning({ user, action })
    try {
      switch (action) {
        case 'send_verification_email':
          await adminApi.sendVerificationEmail(user.id)
          setMessage({ tone: 'ok', text: t('messages.verificationSent', { email: user.email }) })
          break
        case 'revoke_shares': {
          const { revoked } = await adminApi.revokeShares(user.id)
          setMessage({ tone: 'ok', text: t('messages.revoked', { count: revoked, email: user.email }) })
          break
        }
        case 'sign_out': {
          const { sessions } = await adminApi.signOut(user.id)
          setMessage({ tone: 'ok', text: t('messages.signedOut', { count: sessions, email: user.email }) })
          break
        }
        case 'delete_user':
          await adminApi.deleteUser(user.id)
          setMessage({ tone: 'ok', text: t('messages.deleted', { email: user.email }) })
          break
        case 'grant_admin':
          await adminApi.setRole(user.id, 'admin')
          setMessage({ tone: 'ok', text: t('messages.granted', { email: user.email }) })
          break
        case 'revoke_admin':
          await adminApi.setRole(user.id, 'user')
          setMessage({ tone: 'ok', text: t('messages.revokedAdmin', { email: user.email }) })
          break
      }
    } catch (error) {
      setMessage(describeError(error))
    } finally {
      setRunning(null)
    }
    onChanged()
  }

  const dialog = (
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
  )

  const progress = running ? (
    <LoadingText>{t('messages.working', { email: running.user.email })}</LoadingText>
  ) : null

  return { message, setMessage, request: setPending, dialog, progress, busy: running !== null }
}

function ActionButton({
  children,
  danger = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className={danger ? 'text-red-700 dark:text-red-400' : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

interface SectionProps {
  viewer: ViewerRole
  selfEmail: string
  version: number
  onChanged: () => void
}

function Accounts({ viewer, selfEmail, version, onChanged }: SectionProps) {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [limitFor, setLimitFor] = useState<AdminUser | null>(null)
  const [defaultLimit, setDefaultLimit] = useState<number | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new version reloads the global limit after a change.
  useEffect(() => {
    let active = true
    adminApi
      .settings()
      .then((settings) => {
        if (active) setDefaultLimit(settings.maxPlansPerUser)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [version])
  const { message, setMessage, request, dialog, progress, busy } = useAccountActions(onChanged)
  const { t } = useTranslation('admin')

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new version reloads the list after a change.
  useEffect(() => {
    let active = true
    setSearching(true)
    adminApi
      .users(activeQuery)
      .then((next) => {
        if (active) setUsers(next)
      })
      .catch(() => {
        if (active) setMessage({ tone: 'error', text: t('accounts.loadError') })
      })
      .finally(() => {
        if (active) setSearching(false)
      })
    return () => {
      active = false
    }
  }, [activeQuery, version, setMessage, t])

  const search = (event: FormEvent) => {
    event.preventDefault()
    setMessage(null)
    setActiveQuery(query.trim())
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
            className={inputClass}
          />
        </div>
        <Button type="submit" loading={searching}>
          {t('accounts.submit')}
        </Button>
      </form>
      {progress}
      <StatusMessage message={message} />
      <div className={`${cardClass} overflow-x-auto p-0`}>
        {users === null ? (
          <LoadingText className="p-4">{t('loading', { ns: 'common' })}</LoadingText>
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
                const access = accessTo(viewer, user, selfEmail)
                return (
                  <tr key={user.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                    <td className="px-4 py-2">
                      <span className="font-medium break-all">{user.email}</span>
                      <RoleBadge role={user.role} />
                      <span className="block text-xs text-zinc-600 dark:text-zinc-400">
                        {user.emailVerified ? t('accounts.verified') : t('accounts.unverified')}
                        {user.reminders ? ` · ${t('accounts.remindersOn')}` : ''}
                        {access === 'self' ? ` · ${t('accounts.self')}` : ''}
                      </span>
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {format().date.format(new Date(user.createdAt))}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {user.lastActiveAt ? format().date.format(new Date(user.lastActiveAt)) : '–'}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {user.plans} / {user.planLimit ?? defaultLimit ?? '–'}
                      {user.planLimit !== null ? (
                        <span className="ml-1 text-xs text-zinc-600 dark:text-zinc-400">
                          {t('planLimits.custom')}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{user.activeShares}</td>
                    <td className="px-4 py-2">
                      {access === 'manage' ? (
                        <div className="flex flex-wrap gap-1">
                          {user.emailVerified ? null : (
                            <ActionButton
                              disabled={busy}
                              onClick={() => request({ user, action: 'send_verification_email' })}
                            >
                              {t('accounts.actions.sendVerification')}
                            </ActionButton>
                          )}
                          {user.activeShares > 0 ? (
                            <ActionButton
                              disabled={busy}
                              onClick={() => request({ user, action: 'revoke_shares' })}
                            >
                              {t('accounts.actions.revokeShares')}
                            </ActionButton>
                          ) : null}
                          <ActionButton disabled={busy} onClick={() => setLimitFor(user)}>
                            {t('accounts.actions.planLimit')}
                          </ActionButton>
                          <ActionButton disabled={busy} onClick={() => request({ user, action: 'sign_out' })}>
                            {t('accounts.actions.signOut')}
                          </ActionButton>
                          {viewer === 'superadmin' && user.role === 'user' && user.emailVerified ? (
                            <ActionButton
                              disabled={busy}
                              onClick={() => request({ user, action: 'grant_admin' })}
                            >
                              {t('accounts.actions.grantAdmin')}
                            </ActionButton>
                          ) : null}
                          {viewer === 'superadmin' && user.role === 'admin' ? (
                            <ActionButton
                              disabled={busy}
                              onClick={() => request({ user, action: 'revoke_admin' })}
                            >
                              {t('accounts.actions.revokeAdmin')}
                            </ActionButton>
                          ) : null}
                          <ActionButton
                            disabled={busy}
                            danger
                            onClick={() => request({ user, action: 'delete_user' })}
                          >
                            {t('accounts.actions.delete')}
                          </ActionButton>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-600 dark:text-zinc-400">
                          {access === 'self'
                            ? t('accounts.selfActions')
                            : access === 'protected'
                              ? t('accounts.protected')
                              : t('accounts.superadminOnly')}
                        </span>
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
      <PlanLimitDialog
        user={limitFor}
        defaultLimit={defaultLimit}
        onClose={() => setLimitFor(null)}
        onSaved={onChanged}
      />
      {dialog}
    </section>
  )
}

function CreateAdminForm({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation('admin')
  const describeError = useErrorMessage()
  const ids = { email: useId(), name: useId(), password: useId(), hint: useId() }
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      await adminApi.createAdmin({
        email: email.trim(),
        password,
        ...(name.trim() ? { name: name.trim() } : {}),
      })
      setMessage({ tone: 'ok', text: t('messages.created', { email: email.trim().toLowerCase() }) })
      setEmail('')
      setName('')
      setPassword('')
      onCreated()
    } catch (error) {
      setMessage(describeError(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className={`${cardClass} space-y-3`}>
      <h3 className="text-sm font-semibold">{t('team.createHeading')}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={ids.email} className="block text-sm font-medium">
            {t('team.email')}
          </label>
          <input
            id={ids.email}
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={ids.name} className="block text-sm font-medium">
            {t('team.name')}
          </label>
          <input
            id={ids.name}
            type="text"
            autoComplete="off"
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor={ids.password} className="block text-sm font-medium">
            {t('team.password')}
          </label>
          <input
            id={ids.password}
            type="password"
            required
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
            aria-describedby={ids.hint}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
        </div>
      </div>
      <p id={ids.hint} className="text-xs text-zinc-600 dark:text-zinc-400">
        {t('team.passwordHint')}
      </p>
      <StatusMessage message={message} />
      <Button type="submit" variant="primary" loading={busy}>
        {busy ? t('team.creating') : t('team.submit')}
      </Button>
    </form>
  )
}

/** Superadmin only: the admin team, with creating, demoting and deleting admins. */
function AdminTeam({ viewer, selfEmail, version, onChanged }: SectionProps) {
  const { t } = useTranslation('admin')
  const [admins, setAdmins] = useState<AdminUser[] | null>(null)
  const { message, setMessage, request, dialog, progress, busy } = useAccountActions(onChanged)

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new version reloads the list after a change.
  useEffect(() => {
    let active = true
    adminApi
      .users('', { adminsOnly: true })
      .then((next) => {
        if (active) setAdmins(next)
      })
      .catch(() => {
        if (active) setMessage({ tone: 'error', text: t('team.loadError') })
      })
    return () => {
      active = false
    }
  }, [version, setMessage, t])

  return (
    <section aria-labelledby="admin-team" className="space-y-3">
      <h2 id="admin-team" className="text-lg font-semibold">
        {t('team.heading')}
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('team.intro')}</p>
      {progress}
      <StatusMessage message={message} />
      <div className={cardClass}>
        {admins === null ? (
          <LoadingText>{t('loading', { ns: 'common' })}</LoadingText>
        ) : (
          <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            {admins.map((admin) => {
              const access = accessTo(viewer, admin, selfEmail)
              return (
                <li key={admin.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium break-all">{admin.email}</span>
                    <RoleBadge role={admin.role} />
                    {access === 'self' ? (
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        {' '}
                        · {t('accounts.self')}
                      </span>
                    ) : null}
                  </span>
                  {access === 'manage' ? (
                    <span className="flex flex-wrap gap-1">
                      <ActionButton
                        disabled={busy}
                        onClick={() => request({ user: admin, action: 'revoke_admin' })}
                      >
                        {t('accounts.actions.revokeAdmin')}
                      </ActionButton>
                      <ActionButton
                        disabled={busy}
                        danger
                        onClick={() => request({ user: admin, action: 'delete_user' })}
                      >
                        {t('accounts.actions.delete')}
                      </ActionButton>
                    </span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
        {admins !== null && admins.length <= 1 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('team.empty')}</p>
        ) : null}
      </div>
      <CreateAdminForm onCreated={onChanged} />
      {dialog}
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
                    ·{' '}
                    {entry.action === 'update_settings'
                      ? t('audit.settings')
                      : PRESET_ACTIONS.has(entry.action)
                        ? t('audit.preset', { id: entry.targetUserId })
                        : t('audit.account', { id: entry.targetUserId })}
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
  const [viewer, setViewer] = useState<ViewerRole>('admin')
  const [version, setVersion] = useState(0)
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [audit, setAudit] = useState<AdminAuditEntry[]>([])

  const refresh = useCallback(async () => {
    const [nextStats, nextAudit] = await Promise.all([adminApi.stats(), adminApi.audit()])
    setStats(nextStats)
    setAudit(nextAudit)
  }, [])

  const changed = useCallback(() => {
    setVersion((current) => current + 1)
    void refresh().catch(() => {})
  }, [refresh])

  useEffect(() => {
    let active = true
    adminApi
      .me()
      .then(async (me) => {
        if (!active) return
        setSelfEmail(me.email)
        setViewer(me.role === 'superadmin' ? 'superadmin' : 'admin')
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
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          {access === 'checking' ? <Spinner className="size-5 text-indigo-600 dark:text-indigo-400" /> : null}
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

  const sectionProps = { viewer, selfEmail, version, onChanged: changed }
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6">
      <header>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <BrandMark />
          <Link to="/" className={backLinkClass}>
            <ArrowLeft aria-hidden className="size-4" />
            {t('backToHome')}
          </Link>
        </div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t('signedInAs', { email: selfEmail })}
          <RoleBadge role={viewer} />
        </p>
      </header>
      {stats ? <Overview stats={stats} /> : <LoadingText>{t('loadingStats')}</LoadingText>}
      <MailSection onChanged={changed} />
      <AdminPresetsSection onChanged={changed} />
      <PlanLimitSection onChanged={changed} />
      {viewer === 'superadmin' ? <AdminTeam {...sectionProps} /> : null}
      <Accounts {...sectionProps} />
      <AuditLog entries={audit} />
    </main>
  )
}
