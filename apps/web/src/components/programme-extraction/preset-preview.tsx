import type { CustomPresetWarning, Preset } from '@study-plan/shared'
import { Download } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { downloadFile } from '../../lib/files.ts'
import { DEGREE_LABEL, describeRounding, formatCredits } from '../../lib/format.ts'
import { Button } from '../ui/button.tsx'
import { hintClass } from './section.tsx'

const MAX_CODES = 10

const WARNING_KEYS = {
  modules_without_area: 'warnings.modules_without_area',
  modules_without_semester: 'warnings.modules_without_semester',
  modules_without_details: 'warnings.modules_without_details',
} as const satisfies Record<CustomPresetWarning['kind'], string>

/** The key facts of a checked LLM answer, its warnings and notes. */
export function PresetPreview({ preset, warnings }: { preset: Preset; warnings: CustomPresetWarning[] }) {
  const { t } = useTranslation('customPreset')
  const graded = preset.modules.filter((module) => module.grading === 'graded').length
  const withDetails = preset.modules.filter((module) => module.details !== undefined).length
  const credits = (value: number) => formatCredits(value)
  const examRules = preset.examRules
  const examLines = [
    examRules?.withdrawalDaysBeforeExam !== undefined
      ? t('preview.withdrawal', { count: examRules.withdrawalDaysBeforeExam })
      : null,
    examRules?.maxAttempts !== undefined ? t('preview.attempts', { count: examRules.maxAttempts }) : null,
  ].filter((line): line is string => line !== null)

  const rows: { label: string; value: ReactNode }[] = [
    { label: t('preview.programme'), value: preset.programme.name },
    { label: t('preview.degree'), value: DEGREE_LABEL[preset.programme.degree] },
    { label: t('preview.university'), value: preset.university.name },
    { label: t('preview.poVersion'), value: preset.poVersion },
    { label: t('preview.handbookVersion'), value: preset.handbookVersion },
    {
      label: t('preview.standardSemesters'),
      value: t('preview.semesterCount', { count: preset.standardSemesters }),
    },
    { label: t('preview.totalCredits'), value: `${credits(preset.totalCredits)} ${preset.creditLabel}` },
    {
      label: t('preview.modules'),
      value: t('preview.moduleCount', {
        count: preset.modules.length,
        graded,
        ungraded: preset.modules.length - graded,
      }),
    },
    {
      label: t('preview.details'),
      value: t('preview.detailsCount', { count: withDetails, total: preset.modules.length }),
    },
  ]
  if (preset.areas.length > 0) {
    rows.push({
      label: t('preview.areas'),
      value: (
        <ul className="space-y-0.5">
          {preset.areas.map((area) => (
            <li key={area.id}>
              {area.maxCredits === undefined
                ? t('preview.areaMin', {
                    name: area.name,
                    min: credits(area.minCredits),
                    label: preset.creditLabel,
                  })
                : t('preview.areaRange', {
                    name: area.name,
                    min: credits(area.minCredits),
                    max: credits(area.maxCredits),
                    label: preset.creditLabel,
                  })}
            </li>
          ))}
        </ul>
      ),
    })
  }
  rows.push({ label: t('preview.rounding'), value: describeRounding(preset.gradeRules.finalRounding) })
  if (examLines.length > 0) {
    rows.push({
      label: t('preview.examRules'),
      value: (
        <ul className="space-y-0.5">
          {examLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ),
    })
  }

  const download = () =>
    downloadFile(`${preset.id.replace('/', '-')}.json`, JSON.stringify(preset, null, 2), 'application/json')

  return (
    <div className="space-y-4 rounded-lg bg-emerald-50/60 p-4 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:ring-emerald-900">
      <div>
        <h3 className="text-base font-semibold">{t('preview.title')}</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t('preview.intro')}</p>
      </div>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="font-medium text-zinc-600 dark:text-zinc-400">{row.label}</dt>
            <dd className="break-words">{row.value}</dd>
          </div>
        ))}
      </dl>

      {warnings.length > 0 ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900">
          <p className="font-medium">{t('preview.warningsTitle')}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {warnings.map((warning) => (
              <li key={warning.kind}>
                {t(WARNING_KEYS[warning.kind], {
                  count: warning.codes.length,
                  codes: `${warning.codes.slice(0, MAX_CODES).join(', ')}${warning.codes.length > MAX_CODES ? ', …' : ''}`,
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {preset.notes ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">{t('preview.notes')}</summary>
          <p className="mt-2 whitespace-pre-line break-words text-zinc-700 dark:text-zinc-300">
            {preset.notes}
          </p>
        </details>
      ) : null}

      <p className={hintClass}>{t('preview.checkHint')}</p>
      <Button size="sm" onClick={download}>
        <Download aria-hidden className="size-4" />
        {t('preview.downloadTemplate')}
      </Button>
    </div>
  )
}
