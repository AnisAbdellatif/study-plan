import { type FormEvent, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button.tsx'
import { LoadingText } from '../components/ui/spinner.tsx'
import { type AdminChatSettings, adminApi, CHAT_LIMIT_MAX, CHAT_LIMIT_MIN } from '../lib/api.ts'

const cardClass = 'rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'

type Message = { tone: 'ok' | 'error'; text: string }

/** Switches the study assistant on or off and sets its daily message limit. The API key stays in the server env. */
export function ChatSettingsSection({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation(['admin', 'common'])
  const enabledId = useId()
  const limitId = useId()
  const hintId = useId()
  const [settings, setSettings] = useState<AdminChatSettings | 'loading' | 'error'>('loading')
  const [enabled, setEnabled] = useState(true)
  const [limit, setLimit] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  useEffect(() => {
    let active = true
    adminApi
      .chatSettings()
      .then((next) => {
        if (!active) return
        setSettings(next)
        setEnabled(next.enabled)
        setLimit(String(next.dailyLimit))
      })
      .catch(() => {
        if (active) setSettings('error')
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
      const saved = await adminApi.updateChatSettings({ enabled, dailyLimit: Number(limit) })
      setSettings(saved)
      setMessage({ tone: 'ok', text: t('chat.saved') })
      onChanged()
    } catch {
      setMessage({ tone: 'error', text: t('messages.failed') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="admin-chat" className="space-y-3">
      <h2 id="admin-chat" className="text-lg font-semibold">
        {t('chat.heading')}
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('chat.intro')}</p>
      <div className={`${cardClass} space-y-3 text-sm`}>
        {settings === 'loading' ? (
          <LoadingText>{t('common:loading')}</LoadingText>
        ) : settings === 'error' ? (
          <p role="alert" className="text-red-700 dark:text-red-400">
            {t('chat.loadError')}
          </p>
        ) : (
          <>
            {settings.configured ? (
              <p className="text-zinc-600 dark:text-zinc-400">{t('chat.model', { model: settings.model })}</p>
            ) : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
                {t('chat.notConfigured')}
              </p>
            )}
            <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-4">
              <div className="flex items-center gap-2 self-center">
                <input
                  id={enabledId}
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => setEnabled(event.target.checked)}
                  className="size-4 accent-indigo-600"
                />
                <label htmlFor={enabledId}>{t('chat.enabled')}</label>
              </div>
              <div>
                <label htmlFor={limitId} className="block font-medium">
                  {t('chat.dailyLimit')}
                </label>
                <input
                  id={limitId}
                  type="number"
                  inputMode="numeric"
                  min={CHAT_LIMIT_MIN}
                  max={CHAT_LIMIT_MAX}
                  step={1}
                  required
                  aria-describedby={hintId}
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  className="mt-1 h-10 w-28 rounded-lg bg-white px-3 tabular-nums ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700"
                />
              </div>
              <Button type="submit" variant="primary" loading={saving}>
                {t('chat.save')}
              </Button>
              <p id={hintId} className="basis-full text-xs text-zinc-600 dark:text-zinc-400">
                {t('chat.hint', { min: CHAT_LIMIT_MIN, max: CHAT_LIMIT_MAX })}
              </p>
            </form>
          </>
        )}
        {message ? (
          <p
            role="status"
            className={
              message.tone === 'ok'
                ? 'text-emerald-800 dark:text-emerald-300'
                : 'text-red-700 dark:text-red-400'
            }
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </section>
  )
}
