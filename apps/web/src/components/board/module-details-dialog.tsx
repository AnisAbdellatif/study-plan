import {
  dependentModules,
  type ModuleDetails,
  type Plan,
  type PlanModule,
  prerequisiteCodes,
  tidyCatalogText,
} from '@study-plan/shared'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { examKindLabels } from '../../lib/exam-kinds.ts'
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
    <section className="mt-6 first:mt-0">
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

/**
 * A description from the Modulkatalog, at full width and in reading order. Plans made before the texts were
 * tidied on import still carry the PDF's line breaks, so they are joined here too.
 */
function Prose({ title, text }: { title: string; text: string }) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-zinc-700 dark:text-zinc-300">
        {tidyCatalogText(text)}
      </p>
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

/** The handful of facts a student checks first, as chips above everything else. */
function Overview({ module, plan }: { module: PlanModule; plan: Plan }) {
  const { t } = useTranslation('board')
  const chips = [
    `${formatCredits(module.credits)} ${plan.preset.creditLabel}`,
    t(`details.offerings.${module.offering}`),
    module.typicalSemester !== undefined
      ? t('details.typicalSemesterValue', { number: module.typicalSemester })
      : null,
    ...examKindLabels(module),
    module.selfStudy === true
      ? t('details.selfStudy')
      : module.grading === 'pass_fail'
        ? t('details.passFailShort')
        : module.countsTowardAverage
          ? t('details.counts')
          : t('details.notCounted'),
    module.internship === true ? t('details.internship') : null,
    module.retired === true ? t('details.retired') : null,
  ].filter(present)

  return (
    <ul className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <li
          key={chip}
          className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
        >
          {chip}
        </li>
      ))}
    </ul>
  )
}

/** What the module is about: the texts come first, the tables below them. */
function Description({ details }: { details: ModuleDetails }) {
  const { t } = useTranslation('board')
  return (
    <>
      {details.learningOutcomes ? (
        <Prose title={t('details.learningOutcomes')} text={details.learningOutcomes} />
      ) : null}
      {details.content ? <Prose title={t('details.content')} text={details.content} /> : null}
    </>
  )
}

function ExamSection({ module, details }: { module: PlanModule; details: ModuleDetails | undefined }) {
  const { t } = useTranslation('board')
  const label = t('details.exam')
  const text = (value: string) => <span className="whitespace-pre-line">{tidyCatalogText(value)}</span>
  const rows: Row[] = [
    nonEmpty(details?.examForms) && {
      key: 'examForms',
      label: t('details.examForms'),
      value: <TextList items={details.examForms.map(tidyCatalogText)} />,
    },
    details?.examRegistration !== undefined && {
      key: 'examRegistration',
      label: t('details.examRegistration'),
      value: text(details.examRegistration),
    },
    nonEmpty(details?.courseworkRequirements) && {
      key: 'coursework',
      label: t('details.coursework'),
      value: <TextList items={details.courseworkRequirements.map(tidyCatalogText)} />,
    },
    details?.gradingNote !== undefined && {
      key: 'gradingNote',
      label: t('details.gradingNote'),
      value: text(details.gradingNote),
    },
    module.maxAttempts !== undefined && {
      key: 'maxAttempts',
      label: t('details.maxAttempts'),
      value: t('details.maxAttemptsValue', { count: module.maxAttempts }),
    },
  ].filter(present)
  return <Section title={label} rows={rows} />
}

/** Admission: what has to be done before the module, and what it opens up. */
function RequirementsSection({
  module,
  plan,
  details,
}: {
  module: PlanModule
  plan: Plan
  details: ModuleDetails | undefined
}) {
  const { t } = useTranslation('board')
  const label = plan.preset.creditLabel
  const names = new Map(plan.modules.map((m) => [m.code, m.name]))
  const prerequisites = (module.prerequisites ?? []).map((prerequisite) =>
    prerequisiteCodes(prerequisite)
      .map((code) => names.get(code) ?? code)
      .join(t('details.or')),
  )
  const requiredFor = dependentModules(plan, module.code).map((other) => other.name)
  const text = (value: string) => <span className="whitespace-pre-line">{tidyCatalogText(value)}</span>

  const rows: Row[] = [
    prerequisites.length > 0 && {
      key: 'prerequisites',
      label: t('details.prerequisites'),
      value: <TextList items={prerequisites} />,
    },
    module.requiresCredits !== undefined && {
      key: 'requiresCredits',
      label: t('details.requiresCredits'),
      value: t('details.requiresCreditsValue', { credits: formatCredits(module.requiresCredits), label }),
    },
    details?.participationRequirements !== undefined && {
      key: 'participationRequirements',
      label: t('details.participationRequirements'),
      value: text(details.participationRequirements),
    },
    details?.recommendedPrerequisites !== undefined && {
      key: 'recommendedPrerequisites',
      label: t('details.recommendedPrerequisites'),
      value: text(details.recommendedPrerequisites),
    },
    requiredFor.length > 0 && {
      key: 'requiredFor',
      label: t('details.requiredFor'),
      value: <TextList items={requiredFor} />,
    },
  ].filter(present)
  return <Section title={t('details.requirements')} rows={rows} />
}

/** How the module sits in this plan: area, what it counts for, alternatives, recognition. */
function PlanSection({ module, plan }: { module: PlanModule; plan: Plan }) {
  const { t } = useTranslation('board')
  const label = plan.preset.creditLabel
  const recognition = module.recognition
  const alternatives = module.alternativeGroup
    ? plan.modules
        .filter((other) => other.alternativeGroup === module.alternativeGroup && other.code !== module.code)
        .map((other) => other.name)
    : []

  const rows: Row[] = [
    { key: 'credits', label: t('details.credits'), value: `${formatCredits(module.credits)} ${label}` },
    {
      key: 'category',
      label: t('details.category'),
      value: module.custom ? t('card.custom') : module.category,
    },
    {
      key: 'grading',
      label: t('details.grading'),
      value: module.grading === 'graded' ? t('details.graded') : t('details.passFail'),
    },
    {
      key: 'average',
      label: t('details.average'),
      value:
        module.selfStudy === true
          ? t('details.selfStudyValue')
          : module.countsTowardAverage
            ? t('details.counts')
            : t('details.notCounted'),
    },
    { key: 'offering', label: t('details.offering'), value: t(`details.offerings.${module.offering}`) },
    module.typicalSemester !== undefined && {
      key: 'typicalSemester',
      label: t('details.typicalSemester'),
      value: t('details.typicalSemesterValue', { number: module.typicalSemester }),
    },
    alternatives.length > 0 && {
      key: 'alternatives',
      label: t('details.alternatives'),
      value: <TextList items={alternatives} />,
    },
    module.internship === true && { key: 'kind', label: t('details.kind'), value: t('details.internship') },
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
    plan.preset.codesAreOfficial !== false &&
      !module.custom && {
        key: 'code',
        label: t('details.code'),
        value: module.code,
      },
  ].filter(present)

  return <Section title={t('details.facts')} rows={rows} />
}

/** Teaching: who gives the module, in which language, with how much work. */
function OrganisationSection({ details }: { details: ModuleDetails }) {
  const { t } = useTranslation('board')
  const text = (value: string) => <span className="whitespace-pre-line">{tidyCatalogText(value)}</span>
  const list = (key: string, label: string, items: readonly string[] | undefined): Row | false =>
    nonEmpty(items) && { key, label, value: <TextList items={items} /> }

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

  const rows: Row[] = [
    details.frequency !== undefined && {
      key: 'frequency',
      label: t('details.frequency'),
      value: text(details.frequency),
    },
    details.durationSemesters !== undefined && {
      key: 'duration',
      label: t('details.duration'),
      value: t('details.durationValue', { count: details.durationSemesters }),
    },
    list('languages', t('details.languages'), details.languages),
    courses.length > 0 && {
      key: 'courses',
      label: t('details.courses'),
      value: <TextList items={courses} />,
    },
    details.sws !== undefined && {
      key: 'sws',
      label: t('details.sws'),
      value: t('details.swsValue', { sws: formatCredits(details.sws) }),
    },
    workloadParts.length > 0 && {
      key: 'workload',
      label: t('details.workload'),
      value: <TextList items={workloadParts} />,
    },
    list('responsible', t('details.responsible'), details.responsible),
    list('lecturers', t('details.lecturers'), details.lecturers),
    list('examiners', t('details.examiners'), details.examiners),
    details.organisationalUnit !== undefined && {
      key: 'organisationalUnit',
      label: t('details.organisationalUnit'),
      value: text(details.organisationalUnit),
    },
  ].filter(present)

  return <Section title={t('details.organisation')} rows={rows} />
}

/** Everything that is good to know but rarely decides anything. */
function MoreSection({ details }: { details: ModuleDetails }) {
  const { t } = useTranslation('board')
  const text = (value: string) => <span className="whitespace-pre-line">{tidyCatalogText(value)}</span>
  const website = details.website
  const rows: Row[] = [
    nonEmpty(details.literature) && {
      key: 'literature',
      label: t('details.literature'),
      value: <TextList items={details.literature.map(tidyCatalogText)} always />,
    },
    details.teachingMethods !== undefined && {
      key: 'teachingMethods',
      label: t('details.teachingMethods'),
      value: text(details.teachingMethods),
    },
    details.usability !== undefined && {
      key: 'usability',
      label: t('details.usability'),
      value: text(details.usability),
    },
    nonEmpty(details.specialisations) && {
      key: 'specialisations',
      label: t('details.specialisations'),
      value: <TextList items={details.specialisations} />,
    },
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
    details.remarks !== undefined && {
      key: 'remarks',
      label: t('details.remarks'),
      value: text(details.remarks),
    },
    ...(details.additionalFields ?? []).map((field, index) => ({
      key: `additional-${index}`,
      label: field.label,
      value: text(field.value),
    })),
  ].filter(present)

  return <Section title={t('details.more')} rows={rows} />
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
        // Top to bottom: the facts at a glance, what the module teaches, how it is examined, what it needs,
        // where it sits in the plan, and only then the organisational detail.
        <div>
          <Overview module={module} plan={plan} />
          {hasDetails(details) ? <Description details={details} /> : null}
          <ExamSection module={module} details={details} />
          <RequirementsSection module={module} plan={plan} details={details} />
          <PlanSection module={module} plan={plan} />
          {hasDetails(details) ? (
            <>
              <OrganisationSection details={details} />
              <MoreSection details={details} />
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
