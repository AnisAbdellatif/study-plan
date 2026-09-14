import { type FormEvent, useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button.tsx'
import { LoadingText } from '../components/ui/spinner.tsx'
import { currentIntlLocale } from '../i18n/index.ts'
import {
  type AdminChatSettings,
  ApiError,
  adminApi,
  CHAT_LIMIT_MAX,
  CHAT_LIMIT_MIN,
  type ChatModelInfo,
} from '../lib/api.ts'

const cardClass = 'rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'
const inputClass =
  'mt-1 h-10 rounded-lg bg-white px-3 ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-50 dark:bg-zinc-950 dark:ring-zinc-700'
const linkClass = 'font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300'

/** API errors about a model id that get their own explanation. */
const MODEL_ERRORS = [
  'unknown_model',
  'model_unavailable',
  'model_without_tools',
  'model_check_failed',
  'invalid_request',
] as const
type ModelError = (typeof MODEL_ERRORS)[number]
const isModelError = (code: string): code is ModelError => (MODEL_ERRORS as readonly string[]).includes(code)

type Message = { tone: 'ok' | 'error'; text: string }

/**
 * Switches the study assistant on or off, sets its daily message limit and its model. A new model is checked with
 * OpenRouter before it is saved, and one that costs money needs a second confirmation. The API key stays in the
 * server env.
 */
export function ChatSettingsSection({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation(['admin', 'common'])
  const enabledId = useId()
  const limitId = useId()
  const hintId = useId()
  const modelId = useId()
  const modelHintId = useId()
  const [settings, setSettings] = useState<AdminChatSettings | 'loading' | 'error'>('loading')
  const [enabled, setEnabled] = useState(true)
  const [limit, setLimit] = useState('')
  const [model, setModel] = useState('')
  /** A checked model that is not free, waiting for the admin to confirm it. */
  const [paidModel, setPaidModel] = useState<ChatModelInfo | null>(null)
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
        setModel(next.customModel ?? '')
      })
      .catch(() => {
        if (active) setSettings('error')
      })
    return () => {
      active = false
    }
  }, [])

  const price = (value: number) =>
    new Intl.NumberFormat(currentIntlLocale(), {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 3,
    }).format(value)

  const save = async (acceptPaid: boolean) => {
    if (typeof settings !== 'object') return
    const nextModel = model.trim() || null
    setSaving(true)
    setMessage(null)
    try {
      let checked: ChatModelInfo | null = null
      if (nextModel !== null && nextModel !== settings.customModel) {
        checked = await adminApi.checkChatModel(nextModel)
        if (!checked.free && !acceptPaid) {
          setPaidModel(checked)
          return
        }
      }
      const saved = await adminApi.updateChatSettings({
        enabled,
        dailyLimit: Number(limit),
        model: nextModel,
        acceptPaid,
      })
      setSettings(saved)
      setModel(saved.customModel ?? '')
      setPaidModel(null)
      setMessage({ tone: 'ok', text: checked?.free ? t('chat.savedFreeModel') : t('chat.saved') })
      onChanged()
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : ''
      setPaidModel(null)
      setMessage({
        tone: 'error',
        text: isModelError(code) ? t(`chat.modelErrors.${code}`, { model: nextModel }) : t('messages.failed'),
      })
    } finally {
      setSaving(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void save(false)
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
            <form onSubmit={submit} className="flex flex-wrap items-end gap-4">
              <div className="basis-full">
                <label htmlFor={modelId} className="block font-medium">
                  {t('chat.modelLabel')}
                </label>
                <input
                  id={modelId}
                  type="text"
                  value={model}
                  maxLength={200}
                  disabled={!settings.configured}
                  placeholder={settings.defaultModel ?? ''}
                  spellCheck={false}
                  autoCapitalize="none"
                  autoComplete="off"
                  aria-describedby={modelHintId}
                  onChange={(event) => {
                    setModel(event.target.value)
                    setPaidModel(null)
                  }}
                  className={`${inputClass} w-full max-w-md font-mono text-sm`}
                />
                <p id={modelHintId} className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  {t('chat.modelHint', { model: settings.defaultModel ?? '–' })}{' '}
                  <a
                    href="https://openrouter.ai/models"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkClass}
                  >
                    {t('chat.modelsLink')}
                  </a>
                </p>
              </div>
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
                  className={`${inputClass} w-28 tabular-nums`}
                />
              </div>
              <Button type="submit" variant="primary" loading={saving && !paidModel}>
                {t('chat.save')}
              </Button>
              <p id={hintId} className="basis-full text-xs text-zinc-600 dark:text-zinc-400">
                {t('chat.hint', { min: CHAT_LIMIT_MIN, max: CHAT_LIMIT_MAX })}
              </p>
            </form>
            {paidModel ? (
              <div
                role="alert"
                className="space-y-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-950 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900"
              >
                <p className="font-medium">{t('chat.paidTitle', { name: paidModel.name })}</p>
                <p>
                  {paidModel.pricing
                    ? t('chat.paidPricing', {
                        prompt: price(paidModel.pricing.prompt),
                        completion: price(paidModel.pricing.completion),
                      })
                    : t('chat.paidNoPricing')}
                </p>
                <p>{t('chat.paidNote')}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" loading={saving} onClick={() => void save(true)}>
                    {t('chat.usePaid')}
                  </Button>
                  <Button variant="ghost" disabled={saving} onClick={() => setPaidModel(null)}>
                    {t('common:actions.cancel')}
                  </Button>
                </div>
              </div>
            ) : null}
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
