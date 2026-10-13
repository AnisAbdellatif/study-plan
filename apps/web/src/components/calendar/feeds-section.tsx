import {
  type CalendarEvent,
  type CalendarFeedView,
  type CalendarSettings,
  calendarColor,
  calendarSubjects,
  feedEvents,
} from '@study-plan/shared'
import { CalendarPlus, Check, Copy, EllipsisVertical, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { type FormEvent, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { calendarApi } from '../../lib/api.ts'
import { Button } from '../ui/button.tsx'
import { ConfirmDialog, Dialog } from '../ui/dialog.tsx'
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from '../ui/menu.tsx'

/** Most calendar apps open webcal:// links in their subscribe dialog. */
const webcalUrl = (url: string) => url.replace(/^https?:/, 'webcal:')
const googleUrl = (url: string) =>
  `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl(url))}`

/** Limits of the API, see apps/api/src/routes/calendar.ts. */
const MAX_FEEDS = 30
const MAX_NAME_LENGTH = 80
const linkButtonClass =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-zinc-900 shadow-xs ring-1 ring-zinc-300 ring-inset hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 sm:h-8 sm:px-2.5 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800'

interface FeedsSectionProps {
  feeds: CalendarFeedView[]
  events: readonly CalendarEvent[]
  settings: CalendarSettings
  onFeedsChange: (feeds: CalendarFeedView[]) => void
}

export function FeedsSection({ feeds, events, settings, onFeedsChange }: FeedsSectionProps) {
  const { t } = useTranslation('calendar')
  const subjects = useMemo(
    () => calendarSubjects(events).filter((subject) => !settings.excludedSubjects.includes(subject)),
    [events, settings.excludedSubjects],
  )
  const [dialog, setDialog] = useState<{ feed: CalendarFeedView | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch {
      setError(t('feeds.error'))
    } finally {
      setBusy(false)
    }
  }

  const missingSubjects = subjects.filter(
    (subject) => !feeds.some((feed) => feed.subjects?.length === 1 && feed.subjects[0] === subject),
  )
  const addPerSubject = () =>
    run(async () => {
      let next = feeds
      for (const subject of missingSubjects.slice(0, MAX_FEEDS - feeds.length)) {
        const name = (settings.subjects[subject]?.shortName || subject).slice(0, MAX_NAME_LENGTH)
        const created = await calendarApi.createFeed({ name, subjects: [subject] })
        next = [...next, created]
        onFeedsChange(next)
      }
    })

  return (
    <div className="space-y-3">
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900"
        >
          {error}
        </p>
      ) : null}
      <ul className="space-y-3">
        {feeds.map((feed) => (
          <li key={feed.id}>
            <FeedCard
              feed={feed}
              events={events}
              settings={settings}
              onEdit={() => setDialog({ feed })}
              onReplace={(next) => onFeedsChange(feeds.map((item) => (item.id === next.id ? next : item)))}
              onDelete={() => onFeedsChange(feeds.filter((item) => item.id !== feed.id))}
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || feeds.length >= MAX_FEEDS} onClick={() => setDialog({ feed: null })}>
          <Plus aria-hidden className="size-4" />
          {t('feeds.add')}
        </Button>
        <Button
          loading={busy}
          disabled={missingSubjects.length === 0 || feeds.length >= MAX_FEEDS}
          title={missingSubjects.length === 0 ? t('feeds.perSubjectDone') : undefined}
          onClick={() => void addPerSubject()}
        >
          <CalendarPlus aria-hidden className="size-4" />
          {t('feeds.perSubject')}
        </Button>
      </div>
      {feeds.length >= MAX_FEEDS ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">{t('feeds.limit')}</p>
      ) : null}
      {dialog ? (
        <FeedDialog
          feed={dialog.feed}
          subjects={subjects}
          settings={settings}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            onFeedsChange(
              feeds.some((item) => item.id === saved.id)
                ? feeds.map((item) => (item.id === saved.id ? saved : item))
                : [...feeds, saved],
            )
            setDialog(null)
          }}
        />
      ) : null}
    </div>
  )
}

function FeedCard({
  feed,
  events,
  settings,
  onEdit,
  onReplace,
  onDelete,
}: {
  feed: CalendarFeedView
  events: readonly CalendarEvent[]
  settings: CalendarSettings
  onEdit: () => void
  onReplace: (feed: CalendarFeedView) => void
  onDelete: () => void
}) {
  const { t } = useTranslation('calendar')
  const inputId = useId()
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState<'newLink' | 'delete' | null>(null)
  const [error, setError] = useState(false)
  const count = useMemo(
    () => feedEvents(events, settings, feed.subjects).length,
    [events, settings, feed.subjects],
  )
  const single = feed.subjects?.length === 1 ? feed.subjects[0] : undefined
  const color = single ? calendarColor(settings.subjects[single]?.color) : undefined

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feed.url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      document.getElementById(inputId)?.focus()
    }
  }

  const act = async (action: () => Promise<void>) => {
    setError(false)
    try {
      await action()
    } catch {
      setError(true)
    }
  }

  return (
    <article className="rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="flex items-start gap-2">
        {color ? (
          <span
            aria-hidden
            className="mt-1.5 size-3 shrink-0 rounded-full"
            style={{ backgroundColor: color.hex }}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="font-medium break-words">{feed.name}</h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {feed.subjects === null
              ? t('feeds.all')
              : t('feeds.subjectCount', { count: feed.subjects.length })}{' '}
            · {t('feeds.eventCount', { count })}
          </p>
        </div>
        <MenuRoot>
          <MenuTrigger
            render={
              <Button variant="ghost" size="icon" aria-label={t('feeds.actionsFor', { name: feed.name })} />
            }
          >
            <EllipsisVertical aria-hidden className="size-4" />
          </MenuTrigger>
          <MenuContent>
            <MenuItem onClick={onEdit}>
              <Pencil aria-hidden className="size-4" />
              {t('feeds.edit')}
            </MenuItem>
            <MenuItem onClick={() => setConfirm('newLink')}>
              <RefreshCw aria-hidden className="size-4" />
              {t('feeds.newLink')}
            </MenuItem>
            <MenuItem onClick={() => setConfirm('delete')} className="text-red-700 dark:text-red-400">
              <Trash2 aria-hidden className="size-4" />
              {t('feeds.delete')}
            </MenuItem>
          </MenuContent>
        </MenuRoot>
      </div>
      <label htmlFor={inputId} className="sr-only">
        {t('feeds.linkLabel', { name: feed.name })}
      </label>
      <div className="mt-3 flex gap-2">
        <input
          id={inputId}
          readOnly
          value={feed.url}
          onFocus={(event) => event.target.select()}
          className="h-10 min-w-0 flex-1 rounded-lg bg-zinc-50 px-3 font-mono text-xs ring-1 ring-zinc-300 ring-inset sm:h-8 dark:bg-zinc-950 dark:ring-zinc-700"
        />
        <Button
          size="sm"
          onClick={() => void copy()}
          aria-label={copied ? t('feeds.copied') : t('feeds.copy')}
        >
          {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          <span className="hidden sm:inline">{copied ? t('feeds.copied') : t('feeds.copy')}</span>
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <a href={webcalUrl(feed.url)} className={linkButtonClass}>
          {t('feeds.subscribe')}
        </a>
        <a href={googleUrl(feed.url)} target="_blank" rel="noreferrer noopener" className={linkButtonClass}>
          {t('feeds.google')}
        </a>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {t('feeds.error')}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirm === 'newLink'}
        onOpenChange={(open) => setConfirm(open ? 'newLink' : null)}
        title={t('feeds.newLinkTitle')}
        description={t('feeds.newLinkBody')}
        confirmLabel={t('feeds.newLinkConfirm')}
        onConfirm={() => void act(async () => onReplace(await calendarApi.newLink(feed.id)))}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => setConfirm(open ? 'delete' : null)}
        title={t('feeds.deleteTitle', { name: feed.name })}
        description={t('feeds.deleteBody')}
        confirmLabel={t('feeds.deleteConfirm')}
        destructive
        onConfirm={() =>
          void act(async () => {
            await calendarApi.deleteFeed(feed.id)
            onDelete()
          })
        }
      />
    </article>
  )
}

function FeedDialog({
  feed,
  subjects,
  settings,
  onClose,
  onSaved,
}: {
  feed: CalendarFeedView | null
  subjects: string[]
  settings: CalendarSettings
  onClose: () => void
  onSaved: (feed: CalendarFeedView) => void
}) {
  const { t } = useTranslation(['calendar', 'common'])
  const nameId = useId()
  const [name, setName] = useState(feed?.name ?? '')
  const [all, setAll] = useState(feed ? feed.subjects === null : false)
  const [chosen, setChosen] = useState<string[]>(feed?.subjects ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Subjects the feed names but the student left out stay listed, so saving keeps them.
  const options = [...new Set([...subjects, ...chosen])]

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!all && chosen.length === 0) {
      setError(t('feedDialog.pickOne'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const body = { name: name.trim(), subjects: all ? null : chosen }
      onSaved(feed ? await calendarApi.updateFeed(feed.id, body) : await calendarApi.createFeed(body))
    } catch {
      setError(t('feeds.error'))
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={feed ? t('feedDialog.editTitle') : t('feedDialog.createTitle')}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4 text-sm">
        <div>
          <label htmlFor={nameId} className="block font-medium">
            {t('feedDialog.name')}
          </label>
          <input
            id={nameId}
            required
            maxLength={MAX_NAME_LENGTH}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg bg-white px-3 ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700"
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="font-medium">{t('feedDialog.subjects')}</legend>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="feed-subjects"
              className="mt-0.5 size-4 accent-indigo-600"
              checked={all}
              onChange={() => setAll(true)}
            />
            {t('feedDialog.all')}
          </label>
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="feed-subjects"
              className="mt-0.5 size-4 accent-indigo-600"
              checked={!all}
              onChange={() => setAll(false)}
            />
            {t('feedDialog.pick')}
          </label>
          <ul className="space-y-1.5 pl-6">
            {options.map((subject) => {
              const color = calendarColor(settings.subjects[subject]?.color)
              return (
                <li key={subject}>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-indigo-600"
                      disabled={all}
                      checked={chosen.includes(subject)}
                      onChange={(event) =>
                        setChosen((current) =>
                          event.target.checked
                            ? [...current, subject]
                            : current.filter((item) => item !== subject),
                        )
                      }
                    />
                    <span
                      aria-hidden
                      className="mt-1 size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color?.hex ?? 'transparent' }}
                    />
                    <span className={all ? 'text-zinc-500' : undefined}>
                      {settings.subjects[subject]?.shortName || subject}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>
        {error ? (
          <p role="alert" className="text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button type="submit" variant="primary" loading={busy}>
            {t('feedDialog.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
