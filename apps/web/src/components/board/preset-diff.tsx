import type { PresetDiff } from '@study-plan/shared'
import { useTranslation } from 'react-i18next'

/** The changes a preset update or PO switch makes to a plan. */
export function PresetDiffList({ diff }: { diff: PresetDiff }) {
  const { t } = useTranslation('dialogs')
  return (
    <div className="space-y-4 text-sm [&_h3]:font-semibold [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:space-y-0.5 [&_ul]:pl-5">
      {diff.added.length > 0 ? (
        <section>
          <h3>{t('presetDiff.added', { number: diff.added.length })}</h3>
          <p className="text-zinc-600 dark:text-zinc-400">{t('presetDiff.addedHint')}</p>
          <ul>
            {diff.added.map((module) => (
              <li key={module.code}>{module.name}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {diff.removed.length > 0 ? (
        <section>
          <h3>{t('presetDiff.removed', { number: diff.removed.length })}</h3>
          <ul>
            {diff.removed.map((module) => (
              <li key={module.code}>
                {module.name}: {module.kept ? t('presetDiff.removedKept') : t('presetDiff.removedDropped')}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {diff.changed.length > 0 ? (
        <section>
          <h3>{t('presetDiff.changed', { number: diff.changed.length })}</h3>
          <ul>
            {diff.changed.map((change) => (
              <li key={change.code}>
                {change.name}
                {change.fields.length > 0
                  ? `: ${change.fields.map((field) => t(`presetDiff.fields.${field}`)).join(', ')}`
                  : ''}
                {change.resultCleared ? (
                  <span className="text-amber-700 dark:text-amber-400"> {t('presetDiff.resultCleared')}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {diff.info.length > 0 || diff.rulesChanged || diff.areasChanged || diff.targetGradeCleared ? (
        <section>
          <h3>{t('presetDiff.general')}</h3>
          <ul>
            {diff.info.map((key) => (
              <li key={key}>{t(`presetDiff.info.${key}`)}</li>
            ))}
            {diff.rulesChanged ? <li>{t('presetDiff.rulesChanged')}</li> : null}
            {diff.areasChanged ? <li>{t('presetDiff.areasChanged')}</li> : null}
            {diff.targetGradeCleared ? <li>{t('presetDiff.targetGradeCleared')}</li> : null}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
