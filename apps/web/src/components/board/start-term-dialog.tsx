import { type Plan, setStartTerm, type Term, validatePlan } from '@study-plan/shared'
import { type FormEvent, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StartTermFields } from '../start-term-fields.tsx'
import { Button } from '../ui/button.tsx'
import { Dialog } from '../ui/dialog.tsx'

export interface StartTermDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  plan: Plan
  onSave: (term: Term) => void
}

/** Changes the term of the first semester; every semester moves along with its modules. */
export function StartTermDialog({ open, onOpenChange, plan, onSave }: StartTermDialogProps) {
  const { t } = useTranslation('board')
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('startTerm.title')}
      description={t('startTerm.description')}
    >
      {/* Mounted only while open, so every opening starts from the plan's current term. */}
      {open ? <StartTermForm plan={plan} onCancel={() => onOpenChange(false)} onSave={onSave} /> : null}
    </Dialog>
  )
}

const wrongTerms = (plan: Plan) => validatePlan(plan).filter((issue) => issue.kind === 'wrong_term').length

function StartTermForm({
  plan,
  onCancel,
  onSave,
}: {
  plan: Plan
  onCancel: () => void
  onSave: (term: Term) => void
}) {
  const { t } = useTranslation(['board', 'common'])
  const [term, setTerm] = useState<Term>(plan.startTerm)
  const changed = term.season !== plan.startTerm.season || term.year !== plan.startTerm.year
  const before = useMemo(() => wrongTerms(plan), [plan])
  const after = useMemo(
    () => (changed ? wrongTerms(setStartTerm(plan, term)) : before),
    [plan, term, changed, before],
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (changed) onSave(term)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <StartTermFields value={term} onChange={setTerm} standardSemesters={plan.preset.standardSemesters} />
      {changed && after > before ? (
        <p role="status" className="text-sm text-amber-800 dark:text-amber-300">
          {t('startTerm.wrongTerms', { count: after })}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {t('common:actions.cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={!changed}>
          {t('startTerm.save')}
        </Button>
      </div>
    </form>
  )
}
