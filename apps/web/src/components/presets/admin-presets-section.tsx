import { FilePlus2 } from 'lucide-react'
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { currentIntlLocale } from '../../i18n/index.ts'
import { ApiError, adminApi, InvalidPresetError, type PresetSummary, presetApi } from '../../lib/api.ts'
import { Button } from '../ui/button.tsx'
import { ConfirmDialog } from '../ui/dialog.tsx'
import { presetLabel, presetTitle } from './preset-search.ts'

const cardClass = 'rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800'
const MAX_ISSUES = 20

type Outcome =
  | { tone: 'ok'; text: string }
  | { tone: 'error'; text: string; issues?: InvalidPresetError['issues'] }

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat(currentIntlLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )

function OutcomeMessage({ outcome }: { outcome: Outcome | null }) {
  const { t } = useTranslation('admin')
  if (!outcome) return null
  if (outcome.tone === 'ok') {
    return (
      <p role="status" className="text-sm text-emerald-800 dark:text-emerald-300">
        {outcome.text}
      </p>
    )
  }
  const issues = outcome.issues ?? []
  return (
    <div
      role="alert"
      className="space-y-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-100 dark:ring-red-900"
    >
      <p>{outcome.text}</p>
      {issues.length > 0 ? (
        <ul className="max-h-64 list-disc space-y-0.5 overflow-auto pl-5 font-mono text-xs break-words">
          {issues.slice(0, MAX_ISSUES).map((issue, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: issues can repeat and never reorder
            <li key={index}>
              {issue.path ? `${issue.path}: ` : ''}
              {issue.message}
            </li>
          ))}
          {issues.length > MAX_ISSUES ? (
            <li className="list-none font-sans">
              {t('presets.moreIssues', { count: issues.length - MAX_ISSUES })}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}

/** Admins add, replace and delete the presets students pick on the start page. */
export function AdminPresetsSection({ onChanged }: { onChanged: () => void }) {
  const { t } = useTranslation('admin')
  const addInput = useRef<HTMLInputElement>(null)
  const replaceInput = useRef<HTMLInputElement>(null)
  // Which preset the replace file input is for; set right before the file dialog opens.
  const replaceTarget = useRef<PresetSummary | null>(null)
  const [presets, setPresets] = useState<PresetSummary[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [deleting, setDeleting] = useState<PresetSummary | null>(null)

  const load = useCallback(async () => {
    try {
      setPresets(await presetApi.list())
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const describeError = (error: unknown): Outcome => {
    if (error instanceof InvalidPresetError) {
      return { tone: 'error', text: t(`presets.reasons.${error.reason}`), issues: error.issues }
    }
    const code = error instanceof ApiError ? error.code : ''
    const text =
      code === 'preset_exists'
        ? t('presets.exists')
        : code === 'payload_too_large'
          ? t('presets.tooLarge')
          : code === 'not_found'
            ? t('presets.notFound')
            : t('messages.failed')
    return { tone: 'error', text }
  }

  const run = async (action: () => Promise<string>) => {
    setBusy(true)
    setOutcome(null)
    try {
      setOutcome({ tone: 'ok', text: await action() })
      onChanged()
    } catch (error) {
      setOutcome(describeError(error))
    } finally {
      setBusy(false)
      void load()
    }
  }

  const takeFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    // Cleared so choosing the same file again fires another change event.
    event.target.value = ''
    return file
  }

  const onAddFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = takeFile(event)
    if (!file) return
    void run(async () => {
      const saved = await adminApi.createPreset(await file.text())
      return t('presets.added', { name: presetLabel(saved.preset) })
    })
  }

  const onReplaceFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = takeFile(event)
    const target = replaceTarget.current
    if (!file || !target) return
    void run(async () => {
      const saved = await adminApi.replacePreset(target.id, await file.text())
      return t('presets.replaced', { name: presetLabel(saved.preset) })
    })
  }

  return (
    <section aria-labelledby="admin-presets" className="space-y-3">
      <h2 id="admin-presets" className="text-lg font-semibold">
        {t('presets.heading')}
      </h2>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{t('presets.intro')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={busy} onClick={() => addInput.current?.click()}>
          <FilePlus2 aria-hidden className="size-4" />
          {busy ? t('presets.uploading') : t('presets.add')}
        </Button>
        <input
          ref={addInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label={t('presets.addInput')}
          onChange={onAddFile}
        />
        <input
          ref={replaceInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label={t('presets.replaceInput')}
          onChange={onReplaceFile}
        />
      </div>
      <OutcomeMessage outcome={outcome} />
      <div className={`${cardClass} overflow-x-auto p-0`}>
        {presets === null ? (
          <p className="p-4 text-sm">{loadError ? t('presets.loadError') : t('loading', { ns: 'common' })}</p>
        ) : presets.length === 0 ? (
          <p className="p-4 text-sm text-zinc-600 dark:text-zinc-400">{t('presets.empty')}</p>
        ) : (
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-zinc-600 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2 font-medium">{t('presets.columns.programme')}</th>
                <th className="px-2 py-2 font-medium">{t('presets.columns.university')}</th>
                <th className="px-2 py-2 font-medium">{t('presets.columns.poVersion')}</th>
                <th className="px-2 py-2 font-medium">{t('presets.columns.updated')}</th>
                <th className="px-4 py-2 font-medium">{t('presets.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {presets.map((preset) => (
                <tr key={preset.id} className="border-t border-zinc-200 align-top dark:border-zinc-800">
                  <td className="px-4 py-2 font-medium">{presetTitle(preset)}</td>
                  <td className="px-2 py-2">{preset.universityName}</td>
                  <td className="px-2 py-2">{preset.poVersion}</td>
                  <td className="px-2 py-2 tabular-nums">{formatDateTime(preset.updatedAt)}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={t('presets.replaceLabel', { name: presetLabel(preset) })}
                        onClick={() => {
                          replaceTarget.current = preset
                          replaceInput.current?.click()
                        }}
                      >
                        {t('presets.replace')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        className="text-red-700 dark:text-red-400"
                        aria-label={t('presets.deleteLabel', { name: presetLabel(preset) })}
                        onClick={() => setDeleting(preset)}
                      >
                        {t('presets.delete')}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">{t('presets.footnote')}</p>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('presets.confirmDelete.title')}
        description={deleting ? t('presets.confirmDelete.description', { name: presetLabel(deleting) }) : ''}
        confirmLabel={t('presets.confirmDelete.label')}
        destructive
        onConfirm={() => {
          const target = deleting
          setDeleting(null)
          if (!target) return
          void run(async () => {
            await adminApi.deletePreset(target.id)
            return t('presets.deleted', { name: presetLabel(target) })
          })
        }}
      />
    </section>
  )
}
