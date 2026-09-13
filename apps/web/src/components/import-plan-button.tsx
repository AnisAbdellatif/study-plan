import { type ParseFailure, type Plan, parseGuestDocument } from '@study-plan/shared'
import { useNavigate } from '@tanstack/react-router'
import { Upload } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'
import { useGuestState, useGuestStore } from '../store/guest-store.ts'
import { useAnnounce } from './announcer.tsx'
import { Button, type ButtonProps } from './ui/button.tsx'
import { ConfirmDialog, Dialog } from './ui/dialog.tsx'

export const IMPORT_ERRORS: Record<ParseFailure['reason'], string> = {
  not_a_plan: 'Diese Datei ist kein Export dieses Studienplaners.',
  newer_version:
    'Diese Datei stammt aus einer neueren Version der App. Lade die Seite neu und versuche es noch einmal.',
  invalid: 'Die Datei ist beschädigt oder unvollständig.',
}

export function ImportPlanButton({
  label = 'Importieren',
  labelClassName,
  variant = 'secondary',
  size = 'md',
  className,
}: {
  label?: string
  /** Classes for the text label, e.g. to show it only on larger screens while keeping it for screen readers. */
  labelClassName?: string
} & Pick<ButtonProps, 'variant' | 'size' | 'className'>) {
  const store = useGuestStore()
  const { plan } = useGuestState()
  const navigate = useNavigate()
  const announce = useAnnounce()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Plan | null>(null)
  const [error, setError] = useState<{ message: string; details?: string } | null>(null)

  const apply = (next: Plan) => {
    store.replacePlan(next)
    setPending(null)
    announce(`Plan „${next.name}“ importiert`)
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
      setError({ message: IMPORT_ERRORS.not_a_plan })
      return
    }
    const result = parseGuestDocument(data)
    if (!result.success) {
      setError({ message: IMPORT_ERRORS[result.reason], details: result.details })
      return
    }
    if (plan) setPending(result.document.plan)
    else apply(result.document.plan)
  }

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => inputRef.current?.click()}>
        <Upload aria-hidden className="size-4" />
        <span className={size === 'icon' ? 'sr-only' : labelClassName}>{label}</span>
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Plan-Datei auswählen"
        onChange={onFile}
      />
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        title="Aktuellen Plan ersetzen?"
        description={`„${pending?.name ?? ''}“ ersetzt deinen aktuellen Plan in diesem Browser. Exportiere den aktuellen Plan vorher, wenn du ihn behalten willst.`}
        confirmLabel="Ersetzen"
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
        title="Import fehlgeschlagen"
        description={error?.message}
      >
        {error?.details ? (
          <details className="text-xs text-zinc-600 dark:text-zinc-400">
            <summary className="cursor-pointer">Technische Details</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{error.details}</pre>
          </details>
        ) : null}
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setError(null)}>Schließen</Button>
        </div>
      </Dialog>
    </>
  )
}
