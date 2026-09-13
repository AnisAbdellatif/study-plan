import { type FormEvent, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button.tsx'
import { Dialog } from '../components/ui/dialog.tsx'
import { LoadingText } from '../components/ui/spinner.tsx'
import { type AdminUser, adminApi, PLAN_LIMIT_MAX, PLAN_LIMIT_MIN } from '../lib/api.ts'

const cardClass = 'rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'
const numberClass =
  'mt-1 h-10 w-28 rounded-lg bg-white px-3 text-sm tabular-nums ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-50 dark:bg-zinc-950 dark:ring-zinc-700'

type Message = { tone: 'ok' | 'error'; text: string }

/** The global number of plans per account. Accounts with their own limit keep it. */
export function PlanLimitSection({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation(['admin', 'common'])
  const inputId = useId()
  const hintId = useId()
  const [value, setValue] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  useEffect(() => {
    let active = true
    adminApi
      .settings()
      .then((settings) => {
        if (!active) return
        setValue(String(settings.maxPlansPerUser))
        setStatus('ready')
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => {
      active = false
    }
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage(null)
    try {
      const saved = await adminApi.updateSettings({ maxPlansPerUser: Number(value) })
      setMessage({ tone: 'ok', text: t('planLimits.saved', { limit: saved.maxPlansPerUser }) })
      onChanged()
    } catch {
      setMessage({ tone: 'error', text: t('messages.failed') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="admin-plan-limits" className="space-y-3">
      <h2 id="admin-plan-limits" className="text-lg font-semibold">
        {t('planLimits.heading')}
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('planLimits.intro')}</p>
      <div className={`${cardClass} space-y-2`}>
        {status === 'loading' ? (
          <LoadingText>{t('common:loading')}</LoadingText>
        ) : status === 'error' ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {t('planLimits.loadError')}
          </p>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor={inputId} className="block text-sm font-medium">
                {t('planLimits.label')}
              </label>
              <input
                id={inputId}
                type="number"
                inputMode="numeric"
                min={PLAN_LIMIT_MIN}
                max={PLAN_LIMIT_MAX}
                step={1}
                required
                aria-describedby={hintId}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className={numberClass}
              />
            </div>
            <Button type="submit" variant="primary" loading={saving}>
              {t('planLimits.save')}
            </Button>
            <p id={hintId} className="basis-full text-xs text-zinc-600 dark:text-zinc-400">
              {t('planLimits.hint', { min: PLAN_LIMIT_MIN, max: PLAN_LIMIT_MAX })}
            </p>
          </form>
        )}
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
      </div>
    </section>
  )
}

/** Sets or clears one account's own plan limit. */
export function PlanLimitDialog({
  user,
  defaultLimit,
  onClose,
  onSaved,
}: {
  user: AdminUser | null
  /** The global limit, or null while it is unknown. */
  defaultLimit: number | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation(['admin', 'common'])
  const inputId = useId()
  const choiceName = useId()
  const [useDefault, setUseDefault] = useState(true)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!user) return
    setUseDefault(user.planLimit === null)
    setValue(String(user.planLimit ?? defaultLimit ?? PLAN_LIMIT_MIN))
    setFailed(false)
  }, [user, defaultLimit])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) return
    setSaving(true)
    setFailed(false)
    try {
      await adminApi.setPlanLimit(user.id, useDefault ? null : Number(value))
      onSaved()
      onClose()
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={user !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('planLimits.dialogTitle', { email: user?.email ?? '' })}
      description={t('planLimits.dialogDescription', { used: user?.plans ?? 0 })}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={choiceName}
            checked={useDefault}
            onChange={() => setUseDefault(true)}
            className="size-4 accent-indigo-600"
          />
          {defaultLimit === null
            ? t('planLimits.useDefaultUnknown')
            : t('planLimits.useDefault', { limit: defaultLimit })}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={choiceName}
              checked={!useDefault}
              onChange={() => setUseDefault(false)}
              className="size-4 accent-indigo-600"
            />
            {t('planLimits.own')}
          </label>
          <label htmlFor={inputId} className="sr-only">
            {t('planLimits.ownLabel')}
          </label>
          <input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={PLAN_LIMIT_MIN}
            max={PLAN_LIMIT_MAX}
            step={1}
            required={!useDefault}
            disabled={useDefault}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className={`${numberClass} mt-0`}
          />
        </div>
        {failed ? (
          <p role="alert" className="text-red-700 dark:text-red-400">
            {t('messages.failed')}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button type="submit" variant="primary" loading={saving}>
            {t('common:actions.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
