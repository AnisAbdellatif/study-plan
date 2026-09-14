import {
  dependentModules,
  type ModuleDetails,
  type Plan,
  type PlanModule,
  prerequisiteCodes,
} from '@study-plan/shared'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCredits } from '../../lib/format.ts'
import { Button } from '../ui/button.tsx'
import { Dialog } from '../ui/dialog.tsx'

interface Row {
  key: string
  label: string
  value: ReactNode
}

const present = <T,>(row: T | null | undefined | false): row is T => Boolean(row)

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function TextList({ items, always = false }: { items: readonly string[]; always?: boolean }) {
  if (items.length === 1 && !always) return <span className="whitespace-pre-line">{items[0]}</span>
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {items.map((item, index) => (
        // Catalog entries can repeat, so the position is part of the key.
        // biome-ignore lint/suspicious/noArrayIndexKey: static list that is never reordered
        <li key={index} className="whitespace-pre-line">
          {item}
        </li>
      ))}
    </ul>
  )
}

function Section({ title, rows }: { title: string; rows: readonly Row[] }) {
  if (rows.length === 0) return null
  return (
    <section className="mt-5 first:mt-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      <dl className="mt-2 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
        {rows.map((row) => (
          <div key={row.key} className="grid gap-x-4 gap-y-0.5 py-1.5 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <dt className="text-zinc-500 dark:text-zinc-400">{row.label}</dt>
            <dd className="min-w-0 break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

const nonEmpty = (items: readonly string[] | undefined): items is readonly string[] =>
  items !== undefined && items.length > 0

function hasDetails(details: ModuleDetails | undefined): details is ModuleDetails {
  if (!details) return false
  return Object.values(details).some(
    (value) =>
      value !== undefined &&
      !(Array.isArray(value) && value.length === 0) &&
      !(typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0),
  )
}

function FactsSection({ module, plan }: { module: PlanModule; plan: Plan }) {
  const { t } = useTranslation('board')
  const label = plan.preset.creditLabel
  const names = new Map(plan.modules.map((m) => [m.code, m.name]))
  const prerequisites = (module.prerequisites ?? []).map((prerequisite) =>
    prerequisiteCodes(prerequisite)
      .map((code) => names.get(code) ?? code)
      .join(t('details.or')),
  )
  const requiredFor = dependentModules(plan, module.code).map((other) => other.name)
  const recognition = module.recognition
  const alternatives = module.alternativeGroup
    ? plan.modules
        .filter((other) => other.alternativeGroup === module.alternativeGroup && other.code !== module.code)
        .map((other) => other.name)
    : []

  const rows: Row[] = [
    { key: 'credits', label: t('details.credits'), value: `${formatCredits(module.credits)} ${label}` },
    { key: 'offering', label: t('details.offering'), value: t(`details.offerings.${module.offering}`) },
    module.typicalSemester !== undefined && {
      key: 'typicalSemester',
      label: t('details.typicalSemester'),
      value: t('details.typicalSemesterValue', { number: module.typicalSemester }),
    },
    {
      key: 'grading',
      label: t('details.grading'),
      value: module.grading === 'graded' ? t('details.graded') : t('details.passFail'),
    },
    {
      key: 'average',
      label: t('details.average'),
      value: module.countsTowardAverage ? t('details.counts') : t('details.notCounted'),
    },
    {
      key: 'category',
      label: t('details.category'),
      value: module.custom ? t('card.custom') : module.category,
    },
    plan.preset.codesAreOfficial !== false &&
      !module.custom && {
        key: 'code',
        label: t('details.code'),
        value: module.code,
      },
    prerequisites.length > 0 && {
      key: 'prerequisites',
      label: t('details.prerequisites'),
      value: <TextList items={prerequisites} />,
    },
    requiredFor.length > 0 && {
      key: 'requiredFor',
      label: t('details.requiredFor'),
      value: <TextList items={requiredFor} />,
    },
    module.requiresCredits !== undefined && {
      key: 'requiresCredits',
      label: t('details.requiresCredits'),
      value: t('details.requiresCreditsValue', { credits: formatCredits(module.requiresCredits), label }),
    },
    module.maxAttempts !== undefined && {
      key: 'maxAttempts',
      label: t('details.maxAttempts'),
      value: t('details.maxAttemptsValue', { count: module.maxAttempts }),
    },
    module.internship === true && { key: 'kind', label: t('details.kind'), value: t('details.internship') },
    alternatives.length > 0 && {
      key: 'alternatives',
      label: t('details.alternatives'),
      value: <TextList items={alternatives} />,
    },
    module.retired === true && { key: 'retired', label: t('details.status'), value: t('details.retired') },
    recognition !== undefined && {
      key: 'recognition',
      label: t('details.recognition'),
      value: [
        t(`card.recognition.${recognition.status}`),
        recognition.institution,
        recognition.originalTitle,
        recognition.originalCredits !== undefined
          ? `${formatCredits(recognition.originalCredits)} ${label}`
          : undefined,
      ]
        .filter(Boolean)
        .join(' · '),
    },
  ].filter(present)

  return <Section title={t('details.facts')} rows={rows} />
}

function CatalogSections({ details }: { details: ModuleDetails }) {
  const { t } = useTranslation('board')
  const text = (value: string) => <span className="whitespace-pre-line">{value}</span>
  const list = (key: string, label: string, items: readonly string[] | undefined): Row | false =>
    nonEmpty(items) && { key, label, value: <TextList items={items} /> }
  const single = (key: string, label: string, value: string | undefined): Row | false =>
    value !== undefined && value !== '' && { key, label, value: text(value) }

  const workload = details.workload
  const workloadParts = workload
    ? [
        workload.totalHours !== undefined &&
          t('details.totalHours', { hours: formatCredits(workload.totalHours) }),
        workload.contactHours !== undefined &&
          t('details.contactHours', { hours: formatCredits(workload.contactHours) }),
        workload.selfStudyHours !== undefined &&
          t('details.selfStudyHours', { hours: formatCredits(workload.selfStudyHours) }),
      ].filter(present)
    : []

  const courses = (details.courses ?? []).map((course) =>
    [
      course.title ? `${course.type}: ${course.title}` : course.type,
      course.sws !== undefined ? t('details.swsValue', { sws: formatCredits(course.sws) }) : null,
    ]
      .filter(present)
      .join(' · '),
  )

  const website = details.website
  const people = [
    list('responsible', t('details.responsible'), details.responsible),
    list('lecturers', t('details.lecturers'), details.lecturers),
    list('examiners', t('details.examiners'), details.examiners),
  ].filter(present)

  const organisation = [
    single('organisationalUnit', t('details.organisationalUnit'), details.organisationalUnit),
    list('languages', t('details.languages'), details.languages),
    single('frequency', t('details.frequency'), details.frequency),
    details.durationSemesters !== undefined && {
      key: 'duration',
      label: t('details.duration'),
      value: t('details.durationValue', { count: details.durationSemesters }),
    },
    details.sws !== undefined && {
      key: 'sws',
      label: t('details.sws'),
      value: t('details.swsValue', { sws: formatCredits(details.sws) }),
    },
    courses.length > 0 && {
      key: 'courses',
      label: t('details.courses'),
      value: <TextList items={courses} />,
    },
    workloadParts.length > 0 && {
      key: 'workload',
      label: t('details.workload'),
      value: <TextList items={workloadParts} />,
    },
  ].filter(present)

  const exam = [
    list('examForms', t('details.examForms'), details.examForms),
    single('examRegistration', t('details.examRegistration'), details.examRegistration),
    list('coursework', t('details.coursework'), details.courseworkRequirements),
    single('gradingNote', t('details.gradingNote'), details.gradingNote),
    single(
      'participationRequirements',
      t('details.participationRequirements'),
      details.participationRequirements,
    ),
    single(
      'recommendedPrerequisites',
      t('details.recommendedPrerequisites'),
      details.recommendedPrerequisites,
    ),
  ].filter(present)

  const contents = [
    single('learningOutcomes', t('details.learningOutcomes'), details.learningOutcomes),
    single('content', t('details.content'), details.content),
    nonEmpty(details.literature) && {
      key: 'literature',
      label: t('details.literature'),
      value: <TextList items={details.literature} always />,
    },
    single('teachingMethods', t('details.teachingMethods'), details.teachingMethods),
  ].filter(present)

  const more: Row[] = [
    single('usability', t('details.usability'), details.usability),
    list('specialisations', t('details.specialisations'), details.specialisations),
    website !== undefined &&
      website !== '' && {
        key: 'website',
        label: t('details.website'),
        value: isHttpUrl(website) ? (
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-indigo-700 underline underline-offset-2 dark:text-indigo-300"
          >
            {website}
          </a>
        ) : (
          <span className="break-all">{website}</span>
        ),
      },
    single('remarks', t('details.remarks'), details.remarks),
    ...(details.additionalFields ?? []).map((field, index) => ({
      key: `additional-${index}`,
      label: field.label,
      value: text(field.value),
    })),
  ].filter(present)

  return (
    <>
      <Section title={t('details.people')} rows={people} />
      <Section title={t('details.organisation')} rows={organisation} />
      <Section title={t('details.exam')} rows={exam} />
      <Section title={t('details.contents')} rows={contents} />
      <Section title={t('details.more')} rows={more} />
    </>
  )
}

export interface ModuleDetailsDialogProps {
  module: PlanModule | null
  plan: Plan
  onClose: () => void
}

export function ModuleDetailsDialog({ module, plan, onClose }: ModuleDetailsDialogProps) {
  const { t } = useTranslation(['board', 'common'])
  const details = module?.details
  return (
    <Dialog
      size="lg"
      open={module !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={module ? module.name : ''}
      description={details?.englishName}
    >
      {module ? (
        <div>
          <FactsSection module={module} plan={plan} />
          {hasDetails(details) ? (
            <>
              <CatalogSections details={details} />
              <p className="mt-5 text-xs text-zinc-500 dark:text-zinc-400">{t('details.catalogHint')}</p>
            </>
          ) : (
            <p className="mt-5 rounded-lg bg-zinc-100 p-3 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {t('details.noDetails')}
            </p>
          )}
          <div className="mt-5 flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              {t('common:actions.close')}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  )
}
