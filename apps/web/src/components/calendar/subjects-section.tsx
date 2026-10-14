import {
  CALENDAR_COLORS,
  type CalendarEvent,
  type CalendarSettings,
  calendarColor,
  calendarSubjects,
  eventTitle,
  groupedEvents,
  isPresetColor,
  type SubjectSettings,
  slotKey,
  withSubjectColors,
} from '@study-plan/shared'
import { ArrowRightLeft, ChevronRight, Merge, Pipette } from 'lucide-react'
import { type FormEvent, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn.ts'
import { Button } from '../ui/button.tsx'
import { Dialog } from '../ui/dialog.tsx'
import {
  abbreviate,
  type CourseGroup,
  formatEventDay,
  formatEventStart,
  formatTime,
  groupEvents,
  parseSlot,
  type SlotGroup,
  type SubjectGroup,
} from './format.ts'

const checkboxClass = 'mt-0.5 size-4 shrink-0 accent-indigo-600'
const inputClass =
  'mt-1 h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-zinc-300 ring-inset focus-visible:outline-2 focus-visible:outline-indigo-500 dark:bg-zinc-950 dark:ring-zinc-700'

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

const toggle = (list: readonly string[], value: string, keep: boolean): string[] =>
  keep ? list.filter((item) => item !== value) : list.includes(value) ? [...list] : [...list, value]

interface SectionProps {
  events: readonly CalendarEvent[]
  settings: CalendarSettings
  onChange: (settings: CalendarSettings) => void
}

/** Moving courses between subjects: the subjects there are, and the one each course has in Stud.IP. */
interface Grouping {
  subjects: string[]
  /** The subject read from a course's title. */
  automatic: ReadonlyMap<string, string>
  /** Puts courses into a subject; the one they have in Stud.IP needs no entry. */
  assign: (courses: readonly string[], subject: string) => void
}

/**
 * Every subject with its courses, weekly slots and single dates, each with a checkbox. `events` are the link's dates
 * as Stud.IP sends them; the student's grouping of courses into subjects is applied here.
 */
export function SubjectsSection({ events, settings, onChange }: SectionProps) {
  const courseSubjects = settings.courseSubjects
  const grouped = useMemo(() => groupedEvents(events, { courseSubjects }), [events, courseSubjects])
  const groups = useMemo(() => groupEvents(grouped), [grouped])
  const automatic = useMemo(() => new Map(events.map((event) => [event.course, event.subject])), [events])

  // New subjects get a colour straight away, as the server gives them on saving.
  const change = (next: CalendarSettings) =>
    onChange(withSubjectColors(next, calendarSubjects(groupedEvents(events, next))))
  const grouping: Grouping = {
    subjects: groups.map((group) => group.subject),
    automatic,
    assign: (courses, subject) => {
      const nextCourses = { ...settings.courseSubjects }
      for (const course of courses) {
        if (automatic.get(course) === subject) delete nextCourses[course]
        else nextCourses[course] = subject
      }
      change({ ...settings, courseSubjects: nextCourses })
    },
  }

  return (
    <ul className="space-y-3">
      {groups.map((group) => (
        <li key={group.subject}>
          <SubjectCard group={group} settings={settings} onChange={change} grouping={grouping} />
        </li>
      ))}
    </ul>
  )
}

function SubjectCard({
  group,
  settings,
  onChange,
  grouping,
}: {
  group: SubjectGroup
  settings: CalendarSettings
  onChange: (settings: CalendarSettings) => void
  grouping: Grouping
}) {
  const { t } = useTranslation('calendar')
  const checkboxId = useId()
  const nameId = useId()
  const [merging, setMerging] = useState(false)
  const custom = subjectCustomColor(settings.subjects[group.subject]?.color)
  const subject = settings.subjects[group.subject] ?? {}
  const included = !settings.excludedSubjects.includes(group.subject)
  const color = calendarColor(subject.color)
  const sample = group.events.find((event) => !event.cancelled) ?? group.events[0]

  const setSubject = (next: SubjectSettings) =>
    onChange({ ...settings, subjects: { ...settings.subjects, [group.subject]: next } })

  return (
    <section
      className={cn(
        'rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800',
        !included && 'bg-zinc-50 dark:bg-zinc-900/50',
      )}
    >
      <div className="flex items-start gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          className={cn(checkboxClass, 'mt-1')}
          checked={included}
          aria-label={t('subjects.include', { name: group.subject })}
          onChange={(event) =>
            onChange({
              ...settings,
              excludedSubjects: toggle(settings.excludedSubjects, group.subject, event.target.checked),
            })
          }
        />
        <span
          aria-hidden
          className="mt-1.5 size-3 shrink-0 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: color?.hex ?? 'transparent' }}
        />
        <label
          htmlFor={checkboxId}
          className={cn('min-w-0 flex-1 font-medium break-words', !included && 'text-zinc-500 line-through')}
        >
          {group.subject}
        </label>
        {grouping.subjects.length > 1 ? (
          <Button
            size="sm"
            variant="ghost"
            className="-mt-1 shrink-0"
            title={t('subjects.merge')}
            onClick={() => setMerging(true)}
          >
            <Merge aria-hidden className="size-4" />
            <span className="sr-only sm:not-sr-only">{t('subjects.merge')}</span>
          </Button>
        ) : null}
      </div>
      {merging ? (
        <AssignSubjectDialog
          title={t('subjects.mergeTitle', { subject: group.subject })}
          hint={t('subjects.mergeHint')}
          current={group.subject}
          options={grouping.subjects}
          onClose={() => setMerging(false)}
          onSave={(target) => {
            grouping.assign(
              group.courses.map((course) => course.course),
              target,
            )
            setMerging(false)
          }}
        />
      ) : null}

      {included ? (
        <div className="mt-3 space-y-4 sm:pl-7">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <label htmlFor={nameId} className="block text-sm font-medium">
                {t('subjects.shortName')}
              </label>
              <input
                id={nameId}
                type="text"
                maxLength={80}
                value={subject.shortName ?? ''}
                placeholder={t('subjects.shortNamePlaceholder', { example: abbreviate(group.subject) })}
                onChange={(event) => setSubject({ ...subject, shortName: event.target.value || undefined })}
                className={inputClass}
              />
            </div>
            <fieldset>
              <legend className="text-sm font-medium">{t('subjects.color')}</legend>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {CALENDAR_COLORS.map((option) => (
                  <button
                    key={option.name}
                    type="button"
                    aria-pressed={subject.color === option.name}
                    aria-label={t('subjects.colorOption', { color: t(`colors.${option.name}`) })}
                    title={t(`colors.${option.name}`)}
                    onClick={() => setSubject({ ...subject, color: option.name })}
                    className={cn(
                      'size-8 rounded-full ring-1 ring-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 sm:size-7',
                      subject.color === option.name &&
                        'ring-2 ring-zinc-900 ring-offset-2 ring-offset-white dark:ring-zinc-100 dark:ring-offset-zinc-900',
                    )}
                    style={{ backgroundColor: option.hex }}
                  />
                ))}
                <label
                  title={t('subjects.customColor')}
                  className={cn(
                    'relative flex size-8 cursor-pointer items-center justify-center rounded-full ring-1 ring-black/10 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-indigo-500 sm:size-7',
                    custom &&
                      'ring-2 ring-zinc-900 ring-offset-2 ring-offset-white dark:ring-zinc-100 dark:ring-offset-zinc-900',
                  )}
                  style={{
                    background:
                      custom ?? 'conic-gradient(#ff6347, #ffd700, #3cb371, #4169e1, #ba55d3, #ff6347)',
                  }}
                >
                  <input
                    type="color"
                    aria-label={t('subjects.customColor')}
                    value={custom ?? '#808080'}
                    onChange={(event) => setSubject({ ...subject, color: event.target.value })}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                  {custom ? null : (
                    <Pipette
                      aria-hidden
                      className="size-3.5 text-white drop-shadow-[0_1px_1px_rgb(0_0_0/0.6)]"
                    />
                  )}
                </label>
              </div>
            </fieldset>
          </div>
          {sample ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t('subjects.preview', {
                title: eventTitle({ ...sample, cancelled: false }, settings, {
                  cancelled: t('cancelledPrefix'),
                }),
              })}
            </p>
          ) : null}
          <ul className="space-y-3">
            {group.courses.map((course) => (
              <li key={course.course}>
                <CourseRow
                  course={course}
                  subject={group.subject}
                  settings={settings}
                  onChange={onChange}
                  grouping={grouping}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function CourseRow({
  course,
  subject,
  settings,
  onChange,
  grouping,
}: {
  course: CourseGroup
  subject: string
  settings: CalendarSettings
  onChange: (settings: CalendarSettings) => void
  grouping: Grouping
}) {
  const { t } = useTranslation('calendar')
  const checkboxId = useId()
  const [moving, setMoving] = useState(false)
  const included = !settings.excludedCourses.includes(course.course)
  const automatic = grouping.automatic.get(course.course)
  const moved = automatic !== undefined && automatic !== subject
  return (
    <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200 dark:bg-zinc-950/40 dark:ring-zinc-800">
      <div className="flex items-start gap-2 text-sm">
        <input
          id={checkboxId}
          type="checkbox"
          className={checkboxClass}
          checked={included}
          onChange={(event) =>
            onChange({
              ...settings,
              excludedCourses: toggle(settings.excludedCourses, course.course, event.target.checked),
            })
          }
        />
        <label
          htmlFor={checkboxId}
          className={cn('min-w-0 break-words', !included && 'text-zinc-500 line-through')}
        >
          {course.kind ? <span className="font-medium">{course.kind}: </span> : null}
          {course.name}
          {moved ? (
            <span className="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-400">
              {t('subjects.movedFrom', { subject: automatic })}
            </span>
          ) : null}
        </label>
        <Button
          size="sm"
          variant="ghost"
          className="-my-1 ml-auto shrink-0"
          title={t('subjects.move')}
          onClick={() => setMoving(true)}
        >
          <ArrowRightLeft aria-hidden className="size-4" />
          <span className="sr-only sm:not-sr-only">{t('subjects.move')}</span>
        </Button>
      </div>
      {moving ? (
        <AssignSubjectDialog
          title={t('subjects.moveTitle', { course: course.course })}
          hint={t('subjects.moveHint')}
          current={subject}
          automatic={automatic}
          options={grouping.subjects}
          onClose={() => setMoving(false)}
          onSave={(target) => {
            grouping.assign([course.course], target)
            setMoving(false)
          }}
        />
      ) : null}
      {included ? (
        <ul className="mt-2 space-y-1.5 pl-6">
          {course.slots.map((slot) => (
            <li key={slot.slot}>
              <SlotRow course={course.course} slot={slot} settings={settings} onChange={onChange} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function slotLabel(t: ReturnType<typeof useTranslation<'calendar'>>['t'], slot: SlotGroup): string {
  const [first] = slot.events
  // A date of its own reads better with its day than with "every Friday".
  if (slot.events.length === 1 && first) return `${formatEventStart(first.start)}–${formatTime(first.end)}`
  const { weekday, from, to } = parseSlot(slot.slot)
  const key = WEEKDAYS[weekday - 1]
  const day = key ? t(`weekdays.${key}`) : ''
  return t('subjects.weekly', { weekday: day, from, to })
}

function SlotRow({
  course,
  slot,
  settings,
  onChange,
}: {
  course: string
  slot: SlotGroup
  settings: CalendarSettings
  onChange: (settings: CalendarSettings) => void
}) {
  const { t } = useTranslation('calendar')
  const checkboxId = useId()
  const key = slotKey(course, slot.slot)
  const included = !settings.excludedSlots.includes(key)
  const label = slotLabel(t, slot)
  const locations = [...new Set(slot.events.map((event) => event.location).filter(Boolean))]
  return (
    <div className="text-sm">
      <div className="flex items-start gap-2">
        <input
          id={checkboxId}
          type="checkbox"
          className={checkboxClass}
          checked={included}
          onChange={(event) =>
            onChange({
              ...settings,
              excludedSlots: toggle(settings.excludedSlots, key, event.target.checked),
            })
          }
        />
        <label htmlFor={checkboxId} className="min-w-0">
          <span className={cn('font-medium tabular-nums', !included && 'text-zinc-500 line-through')}>
            {label}
          </span>
          {slot.events.length > 1 ? (
            <span className="text-zinc-600 dark:text-zinc-400">
              {' '}
              · {t('subjects.dates', { count: slot.events.length })}
            </span>
          ) : null}
          <span className="block text-xs break-words text-zinc-600 dark:text-zinc-400">
            {locations.length > 0 ? locations.join(' · ') : t('subjects.noLocation')}
          </span>
        </label>
      </div>
      {included && slot.events.length > 1 ? (
        <details className="group mt-1 pl-6">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded py-1 text-xs font-medium text-indigo-700 select-none focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-300 [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden
              className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none"
            />
            {t('subjects.showDates')}
          </summary>
          <ul className="mt-1 grid grid-cols-2 gap-1">
            {slot.events.map((event) => (
              <li key={event.uid}>
                <DateRow event={event} settings={settings} onChange={onChange} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

function DateRow({
  event,
  settings,
  onChange,
}: {
  event: CalendarEvent
  settings: CalendarSettings
  onChange: (settings: CalendarSettings) => void
}) {
  const { t } = useTranslation('calendar')
  const checkboxId = useId()
  const included = !settings.hiddenEvents.includes(event.uid)
  const day = formatEventDay(event.start)
  return (
    <div className="flex items-center gap-2 text-xs">
      <input
        id={checkboxId}
        type="checkbox"
        className="size-4 shrink-0 accent-indigo-600"
        checked={included}
        aria-label={t('subjects.includeDate', { date: day })}
        onChange={(change) =>
          onChange({
            ...settings,
            hiddenEvents: toggle(settings.hiddenEvents, event.uid, change.target.checked),
          })
        }
      />
      <label
        htmlFor={checkboxId}
        className={cn('tabular-nums', (!included || event.cancelled) && 'text-zinc-500 line-through')}
      >
        {day}
      </label>
      {event.cancelled ? (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[0.7rem] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {t('subjects.cancelled')}
        </span>
      ) : null}
    </div>
  )
}

/** A custom colour, as #rrggbb; presets are shown by their own swatches. */
const subjectCustomColor = (color: string | undefined) =>
  color && !isPresetColor(color) ? calendarColor(color)?.hex : undefined

/** Picks the subject for one course, or for all courses of a subject: an existing one, or a new name. */
function AssignSubjectDialog({
  title,
  hint,
  current,
  automatic,
  options,
  onClose,
  onSave,
}: {
  title: string
  hint: string
  current: string
  /** The course's subject in Stud.IP; offered even when no course has it any more. */
  automatic?: string
  options: readonly string[]
  onClose: () => void
  onSave: (subject: string) => void
}) {
  const { t } = useTranslation(['calendar', 'common'])
  const newNameId = useId()
  const choices = [...new Set([...(automatic ? [automatic] : []), ...options])]
    .filter((option) => option !== current)
    .sort((a, b) => a.localeCompare(b, 'de'))
  const [choice, setChoice] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const isNew = choice === NEW_SUBJECT
  const target = isNew ? newName.trim() : choice
  const valid = Boolean(target) && target !== current

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (valid && target) onSave(target)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={title}
      description={hint}
    >
      <form onSubmit={submit} className="space-y-3 text-sm">
        <fieldset className="space-y-1.5">
          <legend className="sr-only">{t('subjects.target')}</legend>
          {choices.map((option) => (
            <label key={option} className="flex items-start gap-2">
              <input
                type="radio"
                name="target-subject"
                className="mt-0.5 size-4 shrink-0 accent-indigo-600"
                checked={choice === option}
                onChange={() => setChoice(option)}
              />
              <span className="min-w-0 break-words">
                {option}
                {option === automatic ? (
                  <span className="text-zinc-600 dark:text-zinc-400"> {t('subjects.fromStudip')}</span>
                ) : null}
              </span>
            </label>
          ))}
          <label className="flex items-start gap-2">
            <input
              type="radio"
              name="target-subject"
              className="mt-0.5 size-4 shrink-0 accent-indigo-600"
              checked={isNew}
              onChange={() => setChoice(NEW_SUBJECT)}
            />
            {t('subjects.newSubject')}
          </label>
          {isNew ? (
            <div className="pl-6">
              <label htmlFor={newNameId} className="sr-only">
                {t('subjects.newSubjectName')}
              </label>
              <input
                id={newNameId}
                type="text"
                required
                maxLength={200}
                autoFocus
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                className={inputClass}
              />
            </div>
          ) : null}
        </fieldset>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose}>{t('common:actions.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={!valid}>
            {t('subjects.apply')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/** The radio value for "a new subject"; no subject is called this. */
const NEW_SUBJECT = '\u0000new'
