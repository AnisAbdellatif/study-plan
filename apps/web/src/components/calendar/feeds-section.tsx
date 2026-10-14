import {
  type CalendarDisplay,
  type CalendarFeedView,
  type CalendarSelection,
  type CalendarSourceView,
  calendarColor,
  calendarSubjects,
  groupedEvents,
  linkSettings,
  mixedFeedEvents,
} from '@study-plan/shared'
import {
  CalendarPlus,
  Check,
  Copy,
  EllipsisVertical,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { type FormEvent, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { calendarApi } from '../../lib/api.ts'
import { cn } from '../../lib/cn.ts'
import { Button } from '../ui/button.tsx'
import { ConfirmDialog, Dialog } from '../ui/dialog.tsx'
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from '../ui/menu.tsx'
import { LinkBadge, LinkChip, linkName } from './links.tsx'

/** Most calendar apps open webcal:// links in their subscribe dialog. */
const webcalUrl = (url: string) => url.replace(/^https?:/, 'webcal:')
const googleUrl = (url: string) =>
  `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalUrl(url))}`

/** Limits of the API, see apps/api/src/routes/calendar.ts. */
const MAX_FEEDS = 30
const MAX_NAME_LENGTH = 80
const linkButtonClass =
  'inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-sm font-medium text-zinc-900 shadow-xs ring-1 ring-zinc-300 ring-inset hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 sm:h-8 sm:px-2.5 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800'

/** What every part of the feeds section needs to know about the student's links. */
export interface LinkContext {
  sources: CalendarSourceView[]
  display: CalendarDisplay
  /** The current, possibly unsaved, choices per link. */
  selections: Record<string, CalendarSelection>
}

const settingsOf = (context: LinkContext, id: string) => {
  const selection = context.selections[id]
  return selection ? linkSettings(context.display, selection) : undefined
}

/** The subjects of a link the student keeps. */
const keptSubjects = (context: LinkContext, source: CalendarSourceView) => {
  const selection = context.selections[source.id]
  const events = selection ? groupedEvents(source.events, selection) : source.events
  return calendarSubjects(events).filter((subject) => !selection?.excludedSubjects.includes(subject))
}

function feedDates(context: LinkContext, feed: Pick<CalendarFeedView, 'sources' | 'subjects'>) {
  const links = feed.sources.flatMap((id) => {
    const source = context.sources.find((candidate) => candidate.id === id)
    const settings = settingsOf(context, id)
    return source && settings ? [{ events: source.events, settings }] : []
  })
  return mixedFeedEvents(links, feed.subjects)
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((item) => b.includes(item))

interface FeedsSectionProps {
  feeds: CalendarFeedView[]
  context: LinkContext
  onFeedsChange: (feeds: CalendarFeedView[]) => void
}

export function FeedsSection({ feeds, context, onFeedsChange }: FeedsSectionProps) {
  const { t } = useTranslation('calendar')
  const [dialog, setDialog] = useState<{ feed: CalendarFeedView | null } | null>(null)
  const [busy, setBusy] = useState<'subjects' | 'mix' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { sources } = context
  const allIds = sources.map((source) => source.id)

  const run = async (kind: 'subjects' | 'mix', action: () => Promise<void>) => {
    setBusy(kind)
    setError(null)
    try {
      await action()
    } catch {
      setError(t('feeds.error'))
    } finally {
      setBusy(null)
    }
  }

  // One calendar per subject of each link, unless it is there already.
  const missingSubjects = sources.flatMap((source) =>
    keptSubjects(context, source)
      .filter(
        (subject) =>
          !feeds.some(
            (feed) =>
              sameSet(feed.sources, [source.id]) &&
              feed.subjects?.length === 1 &&
              feed.subjects[0] === subject,
          ),
      )
      .map((subject) => ({ source, subject })),
  )
  const addPerSubject = () =>
    run('subjects', async () => {
      let next = feeds
      for (const { source, subject } of missingSubjects.slice(0, MAX_FEEDS - feeds.length)) {
        const shortName = context.selections[source.id]?.subjects[subject]?.shortName
        const name = (shortName || subject).slice(0, MAX_NAME_LENGTH)
        const created = await calendarApi.createFeed({ name, sources: [source.id], subjects: [subject] })
        next = [...next, created]
        onFeedsChange(next)
      }
    })

  const hasMix = feeds.some((feed) => sameSet(feed.sources, allIds) && feed.subjects === null)
  const addMix = () =>
    run('mix', async () => {
      const created = await calendarApi.createFeed({
        name: t('feeds.mixName'),
        sources: allIds,
        subjects: null,
      })
      onFeedsChange([...feeds, created])
    })
  const full = feeds.length >= MAX_FEEDS

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
              context={context}
              onEdit={() => setDialog({ feed })}
              onReplace={(next) => onFeedsChange(feeds.map((item) => (item.id === next.id ? next : item)))}
              onDelete={() => onFeedsChange(feeds.filter((item) => item.id !== feed.id))}
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy !== null || full} onClick={() => setDialog({ feed: null })}>
          <Plus aria-hidden className="size-4" />
          {t('feeds.add')}
        </Button>
        {sources.length > 1 && !hasMix ? (
          <Button loading={busy === 'mix'} disabled={busy !== null || full} onClick={() => void addMix()}>
            <Layers aria-hidden className="size-4" />
            {t('feeds.mixAll')}
          </Button>
        ) : null}
        <Button
          loading={busy === 'subjects'}
          disabled={busy !== null || missingSubjects.length === 0 || full}
          title={missingSubjects.length === 0 ? t('feeds.perSubjectDone') : undefined}
          onClick={() => void addPerSubject()}
        >
          <CalendarPlus aria-hidden className="size-4" />
          {t('feeds.perSubject')}
        </Button>
      </div>
      {full ? <p className="text-xs text-zinc-600 dark:text-zinc-400">{t('feeds.limit')}</p> : null}
      {dialog ? (
        <FeedDialog
          feed={dialog.feed}
          context={context}
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
  context,
  onEdit,
  onReplace,
  onDelete,
}: {
  feed: CalendarFeedView
  context: LinkContext
  onEdit: () => void
  onReplace: (feed: CalendarFeedView) => void
  onDelete: () => void
}) {
  const { t } = useTranslation('calendar')
  const inputId = useId()
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState<'newLink' | 'delete' | null>(null)
  const [error, setError] = useState(false)
  const count = useMemo(() => feedDates(context, feed).length, [context, feed])
  const { sources } = context
  const subject = feed.subjects?.length === 1 ? feed.subjects[0] : undefined
  const onlySource = feed.sources.length === 1 ? feed.sources[0] : undefined
  const color =
    subject && onlySource
      ? calendarColor(context.selections[onlySource]?.subjects[subject]?.color)
      : undefined

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
          {sources.length > 1 ? (
            <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={t('feeds.fromLinks')}>
              {feed.sources.map((id) => {
                const index = sources.findIndex((source) => source.id === id)
                return index === -1 ? null : (
                  <li key={id} className="max-w-full">
                    <LinkChip index={index} name={linkName(t, sources, id)} />
                  </li>
                )
              })}
            </ul>
          ) : null}
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
  context,
  onClose,
  onSaved,
}: {
  feed: CalendarFeedView | null
  context: LinkContext
  onClose: () => void
  onSaved: (feed: CalendarFeedView) => void
}) {
  const { t } = useTranslation(['calendar', 'common'])
  const nameId = useId()
  const { sources } = context
  const [name, setName] = useState(feed?.name ?? '')
  // A new calendar starts with every link: making mixed calendars is what this dialog is for.
  const [links, setLinks] = useState<string[]>(feed?.sources ?? sources.map((source) => source.id))
  const [all, setAll] = useState(feed ? feed.subjects === null : true)
  const [chosen, setChosen] = useState<string[]>(feed?.subjects ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Subjects of the chosen links, each with the links that have it; subjects the feed names stay listed.
  const options = useMemo(() => {
    const byName = new Map<string, number[]>()
    sources.forEach((source, index) => {
      if (!links.includes(source.id)) return
      for (const subject of keptSubjects(context, source))
        byName.set(subject, [...(byName.get(subject) ?? []), index])
    })
    for (const subject of chosen) if (!byName.has(subject)) byName.set(subject, [])
    return [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'))
  }, [sources, links, chosen, context])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (links.length === 0) {
      setError(t('feedDialog.pickLink'))
      return
    }
    if (!all && chosen.length === 0) {
      setError(t('feedDialog.pickOne'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const body = { name: name.trim(), sources: links, subjects: all ? null : chosen }
      onSaved(feed ? await calendarApi.updateFeed(feed.id, body) : await calendarApi.createFeed(body))
    } catch {
      setError(t('feeds.error'))
      setBusy(false)
    }
  }

  const subjectLabel = (subject: string, indexes: number[]) => {
    const [first] = indexes
    const source = first === undefined ? undefined : sources[first]
    return (source && context.selections[source.id]?.subjects[subject]?.shortName) || subject
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
        {sources.length > 1 ? (
          <fieldset className="space-y-2">
            <legend className="font-medium">{t('feedDialog.links')}</legend>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{t('feedDialog.linksHint')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {sources.map((source, index) => {
                const checked = links.includes(source.id)
                return (
                  <label
                    key={source.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 ring-1 ring-inset',
                      checked
                        ? 'bg-indigo-50 ring-indigo-300 dark:bg-indigo-950/40 dark:ring-indigo-800'
                        : 'ring-zinc-300 dark:ring-zinc-700',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-indigo-600"
                      checked={checked}
                      onChange={(event) =>
                        setLinks((current) =>
                          event.target.checked
                            ? sources
                                .map((item) => item.id)
                                .filter((id) => id === source.id || current.includes(id))
                            : current.filter((id) => id !== source.id),
                        )
                      }
                    />
                    <LinkBadge index={index} />
                    <span className="min-w-0 truncate">{linkName(t, sources, source.id)}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        ) : null}
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
            {options.map(([subject, indexes]) => {
              const [first] = indexes
              const source = first === undefined ? undefined : sources[first]
              const color = source
                ? calendarColor(context.selections[source.id]?.subjects[subject]?.color)
                : undefined
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
                    <span className={cn('min-w-0 flex-1', all && 'text-zinc-500')}>
                      {subjectLabel(subject, indexes)}
                    </span>
                    {sources.length > 1 ? (
                      <span className="flex shrink-0 gap-1">
                        {indexes.map((index) => (
                          <LinkBadge key={index} index={index} className="size-4 text-[0.6rem]" />
                        ))}
                      </span>
                    ) : null}
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
