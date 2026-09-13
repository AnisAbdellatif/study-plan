import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './button.tsx'

const backdropClass = 'fixed inset-0 z-40 bg-zinc-950/40'
// Phones: a sheet along the bottom edge, full width and clear of the home indicator. From sm: a centred dialog.
const popupClass =
  'fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl ring-1 ring-zinc-200 outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:pb-5 dark:bg-zinc-900 dark:ring-zinc-800'
const popupWidth = 'w-full sm:w-[min(28rem,calc(100vw-2rem))]'
const titleClass = 'text-base font-semibold'
const descriptionClass = 'mt-1 text-sm text-zinc-600 dark:text-zinc-400'

export interface DialogProps {
  /** `lg` for dialogs with tables. */
  size?: 'md' | 'lg'
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  children: ReactNode
}

export function Dialog({ open, onOpenChange, title, description, children, size = 'md' }: DialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={backdropClass} />
        <BaseDialog.Popup
          className={`${popupClass} ${size === 'lg' ? 'w-full sm:w-[min(48rem,calc(100vw-2rem))]' : popupWidth}`}
        >
          <BaseDialog.Title className={titleClass}>{title}</BaseDialog.Title>
          {description ? (
            <BaseDialog.Description className={descriptionClass}>{description}</BaseDialog.Description>
          ) : null}
          <div className="mt-4">{children}</div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
}

/** Confirmation for irreversible actions. Uses an alert dialog, so clicking the backdrop does not dismiss it. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className={backdropClass} />
        <AlertDialog.Popup className={`${popupClass} ${popupWidth}`}>
          <AlertDialog.Title className={titleClass}>{title}</AlertDialog.Title>
          <AlertDialog.Description className={descriptionClass}>{description}</AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Close render={<Button variant="secondary" />}>
              {cancelLabel ?? t('actions.cancel')}
            </AlertDialog.Close>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              onClick={() => {
                onConfirm()
                onOpenChange(false)
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
