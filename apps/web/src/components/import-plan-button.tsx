import { type ParseFailure, type Plan, parseGuestDocument } from '@study-plan/shared'
import { useNavigate } from '@tanstack/react-router'
import { Upload } from 'lucide-react'
import { type ChangeEvent, type ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGuestState, useGuestStore } from '../store/guest-store.ts'
import { useAnnounce } from './announcer.tsx'
import { Button, type ButtonProps } from './ui/button.tsx'
import { ConfirmDialog, Dialog } from './ui/dialog.tsx'

/** Message keys in the `dialogs` namespace for each reason a file cannot be imported. */
export const IMPORT_ERRORS = {
  not_a_plan: 'importPlan.errors.not_a_plan',
  newer_version: 'importPlan.errors.newer_version',
  invalid: 'importPlan.errors.invalid',
} as const satisfies Record<ParseFailure['reason'], string>

/**
 * Restoring a plan file: `open` shows the file picker, `element` holds the hidden input and the dialogs and must be
 * rendered once. Split from the button so a menu item can open the same picker.
 */
export function useImportPlan(): { open: () => void; element: ReactNode } {
  const { t } = useTranslation(['dialogs', 'common'])
  const store = useGuestStore()
  const { plan } = useGuestState()
  const navigate = useNavigate()
  const announce = useAnnounce()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Plan | null>(null)
  const [error, setError] = useState<{ reason: ParseFailure['reason']; details?: string } | null>(null)

  const apply = (next: Plan) => {
    store.replacePlan(next)
    setPending(null)
    announce(t('importPlan.announced', { name: next.name }))
    void navigate({ to: '/' })
  }

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    let data: unknown
    try {
      data = JSON.parse(await file.text())
    } catch {
      setError({ reason: 'not_a_plan' })
      return
    }
    const result = parseGuestDocument(data)
    if (!result.success) {
      setError({ reason: result.reason, details: result.details })
      return
    }
    if (plan) setPending(result.document.plan)
    else apply(result.document.plan)
  }

  const element = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label={t('importPlan.fileInput')}
        onChange={onFile}
      />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title={t('importPlan.replaceTitle')}
        description={t('importPlan.replaceDescription', { name: pending?.name ?? '' })}
        confirmLabel={t('importPlan.replace')}
        destructive
        onConfirm={() => {
          if (pending) apply(pending)
        }}
      />
      <Dialog
        open={error !== null}
        onOpenChange={(open) => {
          if (!open) setError(null)
        }}
        title={t('importPlan.failedTitle')}
        description={error ? t(IMPORT_ERRORS[error.reason]) : undefined}
      >
        {error?.details ? (
          <details className="text-xs text-zinc-600 dark:text-zinc-400">
            <summary className="cursor-pointer">{t('importPlan.technicalDetails')}</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{error.details}</pre>
          </details>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setError(null)}>{t('common:actions.close')}</Button>
        </div>
      </Dialog>
    </>
  )

  return { open: () => inputRef.current?.click(), element }
}

export function ImportPlanButton({
  label,
  labelClassName,
  variant = 'secondary',
  size = 'md',
  className,
}: {
  label?: string
  /** Classes for the text label, e.g. to show it only on larger screens while keeping it for screen readers. */
  labelClassName?: string
} & Pick<ButtonProps, 'variant' | 'size' | 'className'>) {
  const { t } = useTranslation('dialogs')
  const importer = useImportPlan()
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={importer.open}>
        <Upload aria-hidden className="size-4" />
        <span className={size === 'icon' ? 'sr-only' : labelClassName}>{label ?? t('importPlan.label')}</span>
      </Button>
      {importer.element}
    </>
  )
}
