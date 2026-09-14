import { Link } from '@tanstack/react-router'
import { MessageCircle, RotateCcw, Send } from 'lucide-react'
import { type FormEvent, type KeyboardEvent, lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentLocale } from '../i18n/index.ts'
import { ApiError, type ChatReply, type ChatStatus, chatApi } from '../lib/api.ts'
import { cn } from '../lib/cn.ts'
import { useAccountSync } from './account-sync.tsx'
import { Button } from './ui/button.tsx'
import { LoadingText } from './ui/spinner.tsx'

function PlainAnswer({ children }: { children: string }) {
  return <p className="break-words whitespace-pre-line">{children}</p>
}

// If the chunk cannot load (offline, or a deploy replaced it), answers stay readable as plain text.
const ChatMarkdown = lazy(() => import('./chat-markdown.tsx').catch(() => ({ default: PlainAnswer })))

/** Set once the student confirmed what the assistant sends where. */
export const ASSISTANT_CONSENT_KEY = 'study-plan:assistant-consent'
/** Earlier messages sent along with a question; the API accepts at most 20. */
const HISTORY_LIMIT = 20
const MAX_LENGTH = 4000

const SUGGESTIONS = ['summer', 'grade', 'thesis'] as const

interface Entry {
  role: 'user' | 'assistant'
  content: string
  modules?: ChatReply['modules']
}

const linkClass = 'font-medium text-indigo-700 underline-offset-4 hover:underline dark:text-indigo-300'

function readConsent(): boolean {
  try {
    return window.localStorage.getItem(ASSISTANT_CONSENT_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Questions about the programme of the open plan. The conversation lives only in this component: nothing is stored,
 * and the server sends the language model the programme data, never grades or other personal plan data.
 */
export function StudyAssistant({
  onOpenModule,
  className,
  layout = 'panel',
  showTitle = true,
}: {
  /** Opens a module named in an answer, e.g. in the board's details dialog. */
  onOpenModule: (code: string) => void
  className?: string
  /**
   * `panel`: fills a box of fixed height and the conversation scrolls inside it (dialog). `page`: the conversation is
   * part of the page, so only the page scrolls, and the question box sticks above the phone's bottom bar.
   */
  layout?: 'panel' | 'page'
  /** Off where the surrounding dialog already names the assistant. */
  showTitle?: boolean
}) {
  const { t } = useTranslation(['board', 'common'])
  const { user, sync, sessionPending } = useAccountSync()
  const userId = user?.id ?? null
  const planId = userId ? sync.linkedPlanId() : null
  const inputId = useId()
  const logRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<ChatStatus | 'loading' | 'error'>('loading')
  const [consented, setConsented] = useState(readConsent)
  const [entries, setEntries] = useState<Entry[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let active = true
    setStatus('loading')
    chatApi
      .status()
      .then((next) => {
        if (active) setStatus(next)
      })
      .catch(() => {
        if (active) setStatus('error')
      })
    return () => {
      active = false
    }
  }, [userId])

  // Another plan can be another programme, so a switch starts a new conversation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: planId is the trigger, not a value used inside
  useEffect(() => {
    setEntries([])
    setError(null)
  }, [planId])

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever a message or the progress line appears
  useEffect(() => {
    if (entries.length === 0) return
    if (layout === 'page') {
      // The end marker's scroll margin keeps the newest message clear of the sticky question box.
      const end = endRef.current
      if (end && typeof end.scrollIntoView === 'function') end.scrollIntoView({ block: 'nearest' })
      return
    }
    const log = logRef.current
    if (log && typeof log.scrollTo === 'function') log.scrollTo({ top: log.scrollHeight })
  }, [entries, sending, layout])

  const title = showTitle ? (
    <p className="flex items-center gap-2 font-semibold">
      <MessageCircle aria-hidden className="size-4 text-indigo-600 dark:text-indigo-400" />
      {t('assistant.title')}
    </p>
  ) : null

  const shell = (children: React.ReactNode) => (
    <div className={cn('space-y-3 text-sm', className)}>
      {title}
      {children}
    </div>
  )

  if (sessionPending) return shell(<LoadingText>{t('common:loading')}</LoadingText>)
  if (!user) {
    return shell(
      <>
        <p>{t('assistant.signedOut')}</p>
        <p className="flex gap-4">
          <Link to="/sign-in" className={linkClass}>
            {t('assistant.signIn')}
          </Link>
          <Link to="/sign-up" className={linkClass}>
            {t('assistant.signUp')}
          </Link>
        </p>
      </>,
    )
  }
  if (!planId) return shell(<p>{t('assistant.saveFirst')}</p>)
  if (status === 'loading') return shell(<LoadingText>{t('common:loading')}</LoadingText>)
  if (status === 'error') return shell(<p role="alert">{t('assistant.statusError')}</p>)
  if (!status.available) return shell(<p>{t('assistant.unavailable')}</p>)

  if (!consented) {
    return shell(
      <div className="space-y-3 rounded-lg bg-indigo-50 p-3 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:ring-indigo-900">
        <p className="font-medium">{t('assistant.consentTitle')}</p>
        <p>{t('assistant.consentText')}</p>
        <p>
          <Link to="/privacy" target="_blank" rel="noopener" className={linkClass}>
            {t('assistant.privacyLink')}
          </Link>
        </p>
        <Button
          variant="primary"
          onClick={() => {
            try {
              window.localStorage.setItem(ASSISTANT_CONSENT_KEY, '1')
            } catch {
              // Without storage the notice returns on the next visit.
            }
            setConsented(true)
          }}
        >
          {t('assistant.consentAccept')}
        </Button>
      </div>,
    )
  }

  const send = async (question: string) => {
    const text = question.trim()
    if (!text || sending) return
    const history: Entry[] = [...entries, { role: 'user', content: text }]
    setEntries(history)
    setDraft('')
    setSending(true)
    setError(null)
    try {
      const reply = await chatApi.send({
        planId,
        locale: currentLocale(),
        messages: history.slice(-HISTORY_LIMIT).map(({ role, content }) => ({ role, content })),
      })
      setEntries([...history, { role: 'assistant', content: reply.reply, modules: reply.modules }])
      setStatus((current) =>
        typeof current === 'object' ? { ...current, remaining: reply.remaining } : current,
      )
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : ''
      if (code === 'chat_quota_exceeded') {
        setError(t('assistant.quota', { limit: status.dailyLimit }))
        setStatus((current) => (typeof current === 'object' ? { ...current, remaining: 0 } : current))
      } else {
        setError(code === 'chat_unavailable' ? t('assistant.unavailable') : t('assistant.failed'))
      }
      // The question stays in the box, so trying again is one tap.
      setEntries(entries)
      setDraft(text)
    } finally {
      setSending(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void send(draft)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void send(draft)
    }
  }

  const exhausted = status.remaining <= 0

  return (
    <div className={cn('flex flex-col gap-3 text-sm', layout === 'panel' && 'min-h-0', className)}>
      <div className={cn('flex min-h-8 items-center gap-2', showTitle ? 'justify-between' : 'justify-end')}>
        {title}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-600 tabular-nums dark:text-zinc-400">
            {t('assistant.remaining', { count: status.remaining })}
          </span>
          {entries.length > 0 ? (
            <Button size="sm" variant="ghost" disabled={sending} onClick={() => setEntries([])}>
              <RotateCcw aria-hidden className="size-4" />
              {t('assistant.newConversation')}
            </Button>
          ) : null}
        </div>
      </div>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label={t('assistant.title')}
        className={cn(
          'space-y-3 rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200 dark:bg-zinc-950/60 dark:ring-zinc-800',
          layout === 'panel' && 'min-h-0 flex-1 overflow-y-auto',
        )}
      >
        {entries.length === 0 ? (
          <div className="space-y-3">
            <p className="text-zinc-700 dark:text-zinc-300">{t('assistant.intro')}</p>
            <div className="flex flex-col items-start gap-2">
              {SUGGESTIONS.map((key) => (
                <Button
                  key={key}
                  size="sm"
                  disabled={exhausted}
                  className="h-auto min-h-10 py-2 text-left whitespace-normal sm:min-h-8"
                  onClick={() => void send(t(`assistant.suggestions.${key}`))}
                >
                  {t(`assistant.suggestions.${key}`)}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          entries.map((entry, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: messages are only appended and never reordered
              key={index}
              className={cn('flex flex-col gap-1.5', entry.role === 'user' ? 'items-end' : 'items-start')}
            >
              <span className="sr-only">
                {entry.role === 'user' ? t('assistant.you') : t('assistant.assistantName')}:
              </span>
              {entry.role === 'user' ? (
                <p className="max-w-[90%] rounded-2xl bg-indigo-600 px-3 py-2 break-words whitespace-pre-line text-white">
                  {entry.content}
                </p>
              ) : (
                <div className="max-w-[90%] min-w-0 rounded-2xl bg-white px-3 py-2 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
                  <Suspense fallback={<p className="break-words whitespace-pre-line">{entry.content}</p>}>
                    <ChatMarkdown>{entry.content}</ChatMarkdown>
                  </Suspense>
                </div>
              )}
              {entry.modules && entry.modules.length > 0 ? (
                <ul className="flex max-w-[90%] flex-wrap gap-1.5" aria-label={t('assistant.modules')}>
                  {entry.modules.map((module) => (
                    <li key={module.code}>
                      <Button size="sm" onClick={() => onOpenModule(module.code)}>
                        {module.name}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
        {sending ? <LoadingText>{t('assistant.thinking')}</LoadingText> : null}
        <div ref={endRef} aria-hidden className="scroll-mb-48" />
      </div>

      <div
        className={cn(
          'flex flex-col gap-3',
          // Sticks to the top edge of the bottom bar (3.5rem buttons, 1px border, safe area).
          layout === 'page' &&
            'sticky bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-20 -mx-4 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95',
        )}
      >
        {error ? (
          <p role="alert" className="text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <form onSubmit={submit} className="flex items-end gap-2">
          <label htmlFor={inputId} className="sr-only">
            {t('assistant.inputLabel')}
          </label>
          <textarea
            id={inputId}
            rows={2}
            maxLength={MAX_LENGTH}
            value={draft}
            disabled={exhausted}
            placeholder={t('assistant.placeholder')}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            className="min-h-11 flex-1 resize-none rounded-lg bg-white px-3 py-2 text-base ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 disabled:opacity-50 sm:text-sm dark:bg-zinc-950 dark:ring-zinc-700"
          />
          <Button
            type="submit"
            variant="primary"
            loading={sending}
            disabled={exhausted || draft.trim() === ''}
          >
            <Send aria-hidden className="size-4" />
            {t('assistant.send')}
          </Button>
        </form>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">{t('assistant.disclaimer')}</p>
      </div>
    </div>
  )
}
